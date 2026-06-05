import { generateSnapshot } from './mock';
import { fetchDeepSeekData } from './deepseek';
import { fetchOpenAIData } from './openai';
import { fetchOpenCodeGoData } from './opencode';
import { loadConfig } from './config';
import type { DeepSeekData, OpenAIData, OpenCodeGoData, Snapshot } from './types';

// ── Config ──
const config = loadConfig();
const PORT = parseInt(process.env.PORT || '12001', 10);
const DEEPSEEK_INTERVAL = (config.query_interval_seconds || 60) * 1000;

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
    '/app/web/dist',
    new URL('../web/dist', import.meta.url).pathname,
  ];
  for (const p of candidates) {
    try {
      if (Bun.statSync(p).isDirectory()) return p;
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
  async fetch(req: Request) {
    const url = new URL(req.url);

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

    // SSE endpoint
    if (url.pathname === '/events') {
      let timer: Timer | null = null;
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

          // Push initial snapshot immediately
          const pushSnapshot = () => {
            try {
              const snapshot = generateSnapshot();
              const data = `event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`;
              controller.enqueue(new TextEncoder().encode(data));
            } catch {
              // controller closed
            }
          };
          pushSnapshot();
          timer = setInterval(pushSnapshot, 2000);

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
          if (timer) clearInterval(timer);
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

      const file = Bun.file(WEB_DIST + pathname);
      if (await file.exists()) {
        const ext = pathname.split('.').pop()?.toLowerCase() || '';
        return new Response(file, {
          headers: {
            'Content-Type': MIME[ext] || 'application/octet-stream',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }

      // SPA fallback
      const indexFile = Bun.file(WEB_DIST + '/index.html');
      if (await indexFile.exists()) {
        return new Response(indexFile, {
          headers: { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' },
        });
      }
    }

    return new Response('Not Found', { status: 404 });
  },
});

console.log(`Marble Panel server running on http://localhost:${server.port}`);
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
