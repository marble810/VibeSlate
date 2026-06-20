import { generateHeartbeat } from './mock';
import { fetchDeepSeekData } from './deepseek';
import { OpenAICodexProvider } from './openai';
import { OpenAIUsageStore } from './openai-store';
import { fetchOpenCodeGoData } from './opencode';
import { loadConfig } from './config';
import { createAuthManager } from './auth';
import { handleLanSetup } from './lan-setup';
import type { DeepSeekData, OpenAIAuthStatus, OpenAIData, OpenCodeGoData } from './types';
import { statSync } from 'node:fs';

// ── Config ──
const config = loadConfig();

const auth = createAuthManager(config.auth);
const PORT = parseInt(process.env.PORT || '12001', 10);
const HOST = process.env.HOST || 'localhost';
const DEEPSEEK_INTERVAL = (config.query_interval_seconds || 60) * 1000;

// ── TLS support ──
let tlsCert: string | undefined;
let tlsKey: string | undefined;

if (config.tls.enabled) {
  try {
    if (!statSync(config.tls.cert_file).isFile()) {
      throw new Error(`TLS cert file is not a regular file: ${config.tls.cert_file}`);
    }
    if (!statSync(config.tls.key_file).isFile()) {
      throw new Error(`TLS key file is not a regular file: ${config.tls.key_file}`);
    }
    tlsCert = config.tls.cert_file;
    tlsKey = config.tls.key_file;
    console.log(`[tls] Enabled with cert ${tlsCert} and key ${tlsKey}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[tls] TLS_ENABLED=true but the configured certificate files are unavailable. ${message}`);
  }
}

const useTls = !!(tlsCert && tlsKey);

// ── Cached provider data ──
let deepseekCache: DeepSeekData | null = null;
let openaiCache: OpenAIData | null = null;
let openaiAuthCache: OpenAIAuthStatus = {
  state: config.openai.enabled ? 'not_configured' : 'not_configured',
  email_redacted: null,
  plan_type: null,
  last_success_at: null,
  last_error_code: config.openai.enabled ? null : 'OPENAI_DISABLED',
  auth_json_hash: null,
  ts: Math.floor(Date.now() / 1000),
};
let opencodeCache: OpenCodeGoData | null = null;

const openaiProvider = config.openai.enabled ? new OpenAICodexProvider(config.openai) : null;
const openaiUsageStore = config.openai.enabled ? new OpenAIUsageStore(config.openai.sqlite_path) : null;

// ── SSE broadcast ──
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

function updateOpenAIAuth(status: OpenAIAuthStatus) {
  openaiAuthCache = status;
  broadcast('openai-auth', status);
}

async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = await req.json();
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
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
  if (!openaiProvider) return;
  const result = await openaiProvider.fetchOpenAIData();
  updateOpenAIAuth(openaiProvider.getAuthStatus());
  if (result) {
    openaiCache = result;
    openaiUsageStore?.saveSnapshot(result);
    broadcast('openai', result);
    console.log(
      `[openai] Updated — plan: ${result.planType}, ` +
        `primary: ${result.primaryUsedPercent}%, ` +
        `secondary: ${result.secondaryUsedPercent}%`,
    );
  } else {
    console.log(`[openai] Auth state: ${openaiAuthCache.state}`);
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
if (openaiProvider) {
  refreshOpenAI();
  setInterval(refreshOpenAI, config.openai.poll_interval_seconds * 1000);
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
      key: Bun.file(tlsKey!),
      cert: Bun.file(tlsCert!),
    },
  } : {}),
  async fetch(req: Request) {
    let url = new URL(req.url);

    const authRoute = await auth.handleRoute(req, url);
    if (authRoute) return authRoute;

    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

    if (url.pathname === '/api/openai/auth/status' && req.method === 'GET') {
      const authResponse = auth.requireRequest(req);
      if (authResponse) return authResponse;

      if (openaiProvider) {
        updateOpenAIAuth(await openaiProvider.refreshAuthStatus());
      }
      return Response.json(openaiAuthCache, {
        headers: {
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    if (url.pathname === '/api/openai/auth/login/start' && req.method === 'POST') {
      const authResponse = auth.requireRequest(req);
      if (authResponse) return authResponse;
      if (!openaiProvider) return Response.json({ error: 'OPENAI_DISABLED' }, { status: 503 });

      try {
        const login = await openaiProvider.startLogin();
        updateOpenAIAuth(openaiProvider.getAuthStatus());
        return Response.json(login, {
          headers: {
            'Cache-Control': 'no-cache',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch {
        return Response.json(
          { error: 'LOGIN_START_FAILED' },
          { status: 500 },
        );
      }
    }

    if (url.pathname === '/api/openai/auth/login/cancel' && req.method === 'POST') {
      const authResponse = auth.requireRequest(req);
      if (authResponse) return authResponse;
      if (!openaiProvider) return Response.json({ error: 'OPENAI_DISABLED' }, { status: 503 });

      const body = await readJsonBody(req);
      const loginId = typeof body.loginId === 'string' ? body.loginId : null;
      const result = await openaiProvider.cancelLogin(loginId);
      updateOpenAIAuth(openaiProvider.getAuthStatus());
      return Response.json(result, {
        headers: {
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    if (url.pathname === '/api/openai/auth/logout' && req.method === 'POST') {
      const authResponse = auth.requireRequest(req);
      if (authResponse) return authResponse;
      if (!openaiProvider) return Response.json({ error: 'OPENAI_DISABLED' }, { status: 503 });

      await openaiProvider.logout();
      updateOpenAIAuth(openaiProvider.getAuthStatus());
      openaiCache = null;
      return Response.json({ ok: true }, {
        headers: {
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    if (url.pathname === '/api/openai/usage/latest' && req.method === 'GET') {
      const authResponse = auth.requireRequest(req);
      if (authResponse) return authResponse;

      return Response.json(openaiUsageStore?.latest() ?? openaiCache, {
        headers: {
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    if (url.pathname === '/api/openai/usage/history' && req.method === 'GET') {
      const authResponse = auth.requireRequest(req);
      if (authResponse) return authResponse;

      const limit = Number.parseInt(url.searchParams.get('limit') || '100', 10);
      return Response.json(openaiUsageStore?.history(Number.isFinite(limit) ? limit : 100) ?? [], {
        headers: {
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*',
        },
      });
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
          const oaAuth = `event: openai-auth\ndata: ${JSON.stringify(openaiAuthCache)}\n\n`;
          try {
            controller.enqueue(new TextEncoder().encode(oaAuth));
          } catch {
            // ignore
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

    // LAN cert setup page
    if (url.pathname.startsWith('/lan-setup')) {
      const lanPage = await handleLanSetup(req, {
        rootCaFile: config.tls.root_ca_file,
      });
      if (lanPage) return lanPage;
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
console.log(`VibeSlate server running on ${protocol}://${HOST}:${server.port}`);
console.log(
  WEB_DIST ? `Serving static files from: ${WEB_DIST}` : 'Warning: No web dist — static serving disabled',
);
console.log(
  config.deepseek_token
    ? `DeepSeek API: enabled (refresh every ${config.query_interval_seconds}s)`
    : 'DeepSeek API: DISABLED (no token configured)',
);
console.log(
  openaiProvider
    ? `OpenAI Codex app-server: enabled (poll every ${config.openai.poll_interval_seconds}s)`
    : 'OpenAI Codex app-server: disabled',
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

function shutdown() {
  openaiProvider?.stop();
  openaiUsageStore?.close();
}

process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});
process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});
