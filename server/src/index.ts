import { generateHeartbeat } from './mock';
import { fetchDeepSeekData } from './deepseek';
import { fetchOpenAIData } from './openai';
import { fetchOpenCodeGoData } from './opencode';
import { loadConfig } from './config';
import { createAuthManager } from './auth';
import { isBanned } from './banned-ips';
import type { DeepSeekData, OpenAIData, OpenCodeGoData } from './types';
import { statSync } from 'node:fs';

// ── Config ──
const config = loadConfig();

// Startup validation: Public Scope must fail closed before binding a socket.
if (config.public.mode === 'public') {
  if (!config.auth.enabled) {
    console.error('[public] FATAL: Public Scope requires password auth.');
    console.error('  → Enable auth in the Docker init config or re-run bun run docker:init.');
    process.exit(1);
  }
  if (!config.auth.password_hash) {
    console.error('[public] FATAL: Public Scope requires auth.password_hash.');
    console.error('  → Re-run bun run docker:init to generate a password hash.');
    process.exit(1);
  }
  if (config.public.trusted_proxies.length === 0) {
    console.error('[public] FATAL: Public Scope requires at least one trusted proxy IP/CIDR.');
    console.error('  → Set public.trusted_proxies to the Docker bridge CIDR used by Caddy.');
    process.exit(1);
  }
}

// ── Hidden entry gate ──
const hiddenEntry = config.hidden_entry;
const hiddenPath = hiddenEntry.enabled ? '/' + hiddenEntry.path : '';

const auth = createAuthManager(config.auth, config.public, hiddenPath);
const PORT = parseInt(process.env.PORT || '12001', 10);
const HOST = process.env.HOST || 'localhost';
const DEEPSEEK_INTERVAL = (config.query_interval_seconds || 60) * 1000;

// ── TLS support (LAN HTTPS) ──
const TLS_CERT_FILE = process.env.TLS_CERT_FILE;
const TLS_KEY_FILE = process.env.TLS_KEY_FILE;
const useTls = !!(TLS_CERT_FILE && TLS_KEY_FILE);
if (useTls) {
  console.log(`[tls] TLS enabled — cert: ${TLS_CERT_FILE}, key: ${TLS_KEY_FILE}`);
}

// ── Cached provider data ──
let deepseekCache: DeepSeekData | null = null;
let openaiCache: OpenAIData | null = null;
let opencodeCache: OpenCodeGoData | null = null;

// ── SSE broadcast: track connected clients ──
type Enqueue = (chunk: Uint8Array) => void;
const clients = new Set<Enqueue>();

function broadcast(event: string, data: unknown) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const encoded = new TextEncoder().encode(payload);
  for (const enqueue of clients) {
    try {
      enqueue(encoded);
    } catch {
      clients.delete(enqueue);
    }
  }
}

// ── DeepSeek refresh ──
async function refreshDeepSeek() {
  const result = await fetchDeepSeekData(config.deepseek_token);
  if (result) {
    deepseekCache = result;
    broadcast('deepseek', result);
    const modelCount = Object.keys(result.thirtyDays.models).length;
    const totalTokens = Object.values(result.thirtyDays.models).reduce(
      (s, m) => s + m.cached + m.nonCached + m.output, 0,
    );
    const total1dTokens = Object.values(result.oneDay.models).reduce(
      (s, m) => s + m.cached + m.nonCached + m.output, 0,
    );
    console.log(
      `[deepseek] Updated — balance: ¥${result.balance.toFixed(2)}, ` +
        `1d cost: ¥${result.oneDay.cost.toFixed(4)}, ` +
        `1d tokens: ${total1dTokens.toLocaleString()} (${Object.keys(result.oneDay.models).length} models), ` +
        `30d cost: ¥${result.thirtyDays.cost.toFixed(2)}, ` +
        `30d tokens: ${totalTokens.toLocaleString()} (${modelCount} models)`,
    );
  }
}

// ── OpenAI refresh ──
async function refreshOpenAI() {
  const result = await fetchOpenAIData(
    config.openai_refresh_token,
    config.openai_account_id,
  );
  if (result) {
    openaiCache = result;
    broadcast('openai', result);
    console.log(
      `[openai] Updated — plan: ${result.planType}, ` +
        `primary: ${result.primaryUsedPercent}%, ` +
        `secondary: ${result.secondaryUsedPercent}%`,
    );
  }
}

// ── OpenCode Go refresh ──
async function refreshOpenCodeGo() {
  const result = await fetchOpenCodeGoData(
    config.opencode_workspace_id,
    config.opencode_auth_cookie,
  );
  if (result) {
    opencodeCache = result;
    broadcast('opencode', result);
  }
}

// Initial fetch + periodic refresh
if (config.deepseek_token) {
  refreshDeepSeek();
  setInterval(refreshDeepSeek, DEEPSEEK_INTERVAL);
}
if (config.openai_refresh_token) {
  refreshOpenAI();
  setInterval(refreshOpenAI, DEEPSEEK_INTERVAL);
}
if (config.opencode_workspace_id && config.opencode_auth_cookie) {
  refreshOpenCodeGo();
  setInterval(refreshOpenCodeGo, DEEPSEEK_INTERVAL);
}

// ── Static file serving ──
const WEB_DIST = (() => {
  const candidates = [
    new URL('../../web/dist', import.meta.url).pathname,
    '/app/web/dist',
  ];
  for (const p of candidates) {
    try {
      if (statSync(p).isDirectory()) return p;
    } catch {
      // not found
    }
  }
  return null;
})();

const MIME: Record<string, string> = {
  html: 'text/html',
  js: 'text/javascript',
  css: 'text/css',
  svg: 'image/svg+xml',
  png: 'image/png',
  ico: 'image/x-icon',
  json: 'application/json',
  webmanifest: 'application/manifest+json',
  wasm: 'application/wasm',
};

// ── Server ──
const server = Bun.serve({
  port: PORT,
  hostname: HOST,
  idleTimeout: 0, // SSE connections must stay open indefinitely
  ...(useTls ? {
    tls: {
      key: Bun.file(TLS_KEY_FILE!),
      cert: Bun.file(TLS_CERT_FILE!),
    },
  } : {}),
  async fetch(req: Request, server) {
    // ── Banned IP check ──
    // If Fail2Ban is active and the ban list file exists in the shared
    // volume, block requests from banned IPs before any other processing.
    if (isBanned(auth.resolveIp(req, server))) {
      return new Response('Forbidden', { status: 403 });
    }

    let url = new URL(req.url);

    // ── Hidden entry gate ──
    if (hiddenEntry.enabled) {
      // Allowed path prefixes (without hidden path):
      //   /auth/*   — login/logout/status
      //   /api/*    — API endpoints
      //   /events   — SSE stream
      const isAuthOrApi = url.pathname.startsWith('/auth/') || url.pathname.startsWith('/api/') || url.pathname === '/events';
      const isHiddenPath = url.pathname === '/' + hiddenEntry.path
        || url.pathname.startsWith('/' + hiddenEntry.path + '/');
      const hasStaticExt = url.pathname.includes('.') && !url.pathname.endsWith('/');

      if (!isAuthOrApi && !isHiddenPath && !hasStaticExt) {
        // Block all non-hidden app-shell paths.
        // Special case: root / can redirect to hidden path if configured.
        if ((url.pathname === '/' || url.pathname === '') && hiddenEntry.root_response === 'redirect') {
          return new Response(null, {
            status: 303,
            headers: { Location: hiddenPath + '/' },
          });
        }
        return new Response('Not Found', { status: 404 });
      }

      // Rewrite hidden entry path to root for app serving.
      // Effect: /<hiddenPath>/ → /, /<hiddenPath>/route → /route
      if (isHiddenPath) {
        const rewritten = url.pathname.slice(('/' + hiddenEntry.path).length) || '/';
        url = new URL(rewritten + url.search, url.origin);
      }
    }

    const authRoute = await auth.handleRoute(req, url, server);
    if (authRoute) return authRoute;

    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    if (url.pathname === '/api/ui-config') {
      const authResponse = auth.requireRequest(req);
      if (authResponse) return authResponse;

      return Response.json(
        {
          custom_accent: config.ui.custom_accent,
        },
        {
          headers: {
            'Cache-Control': 'no-cache',
            'Access-Control-Allow-Origin': '*',
          },
        },
      );
    }

    // SSE endpoint
    if (url.pathname === '/events') {
      const authResponse = auth.requireRequest(req);
      if (authResponse) return authResponse;

      let pingTimer: Timer | null = null;

      const body = new ReadableStream({
        start(controller) {
          const enqueue = (chunk: Uint8Array) => {
            try {
              controller.enqueue(chunk);
            } catch {
              // controller closed
            }
          };
          clients.add(enqueue);

          // Send heartbeat immediately
          const hb = generateHeartbeat();
          try {
            controller.enqueue(new TextEncoder().encode(`event: heartbeat\ndata: ${JSON.stringify(hb)}\n\n`));
          } catch { /* controller closed */ }

          // Send cached provider data on connect
          if (deepseekCache) {
            const ds = `event: deepseek\ndata: ${JSON.stringify(deepseekCache)}\n\n`;
            try {
              controller.enqueue(new TextEncoder().encode(ds));
            } catch {
              // ignore
            }
          }
          if (openaiCache) {
            const oa = `event: openai\ndata: ${JSON.stringify(openaiCache)}\n\n`;
            try {
              controller.enqueue(new TextEncoder().encode(oa));
            } catch {
              // ignore
            }
          }
          if (opencodeCache) {
            const oc = `event: opencode\ndata: ${JSON.stringify(opencodeCache)}\n\n`;
            try {
              controller.enqueue(new TextEncoder().encode(oc));
            } catch {
              // ignore
            }
          }

          // Keep-alive ping every 30s
          pingTimer = setInterval(() => {
            try {
              controller.enqueue(new TextEncoder().encode(': ping\n\n'));
            } catch {
              clearInterval(pingTimer!);
            }
          }, 30_000);
        },
        cancel() {
          if (pingTimer) clearInterval(pingTimer);
        },
      });

      return new Response(body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Static file serving
    if (WEB_DIST) {
      let pathname = url.pathname;
      if (pathname === '/') pathname = '/index.html';
      const isAppShell = pathname === '/index.html' || !pathname.includes('.');

      const file = Bun.file(WEB_DIST + pathname);
      if (await file.exists()) {
        if (isAppShell) {
          const authResponse = auth.requirePage(req);
          if (authResponse) return authResponse;
        }

        const ext = pathname.split('.').pop()?.toLowerCase() || '';
        const cacheControl =
          pathname === '/index.html' || pathname === '/sw.js' || pathname === '/registerSW.js' || ext === 'webmanifest'
            ? 'no-cache'
            : 'public, max-age=3600';
        return new Response(file, {
          headers: {
            'Content-Type': MIME[ext] || 'application/octet-stream',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': cacheControl,
          },
        });
      }

      // SPA fallback
      const indexFile = Bun.file(WEB_DIST + '/index.html');
      if (await indexFile.exists()) {
        const authResponse = auth.requirePage(req);
        if (authResponse) return authResponse;

        return new Response(indexFile, {
          headers: { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' },
        });
      }
    }

    return new Response('Not Found', { status: 404 });
  },
});

const protocol = useTls ? 'https' : 'http';
console.log(`Marble Panel server running on ${protocol}://${HOST}:${server.port}`);
console.log(
  WEB_DIST ? `Serving static files from: ${WEB_DIST}` : 'Warning: No web dist — static serving disabled',
);
console.log(
  config.deepseek_token
    ? `DeepSeek API: enabled (refresh every ${config.query_interval_seconds}s)`
    : 'DeepSeek API: DISABLED (no token configured)',
);
console.log(
  config.openai_refresh_token
    ? `OpenAI API: enabled (refresh every ${config.query_interval_seconds}s)`
    : 'OpenAI API: DISABLED (no token configured)',
);
console.log(
  config.opencode_workspace_id && config.opencode_auth_cookie
    ? `OpenCode Go API: enabled (refresh every ${config.query_interval_seconds}s)`
    : 'OpenCode Go API: DISABLED (no credentials configured)',
);
console.log(
  auth.isEnabled()
    ? 'Password auth: enabled'
    : 'Password auth: disabled',
);

if (config.public.mode === 'public') {
  console.log(`[public] Mode: public — trusted proxies: ${config.public.trusted_proxies.join(', ') || '(none)'}`);
} else {
  console.log('[public] Mode: lan');
}

if (hiddenEntry.enabled) {
  console.log(`[hidden-entry] Enabled — path: /${hiddenEntry.path}, root: ${hiddenEntry.root_response}`);
}
