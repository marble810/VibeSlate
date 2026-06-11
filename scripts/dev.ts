// Start both server and frontend dev servers concurrently
import { spawn } from "bun";
import { join } from "node:path";

const bun = process.execPath;
const root = join(import.meta.dirname, "..");

const VITE_PORT = 5173;

const server = spawn([bun, "--watch", "src/index.ts"], {
  cwd: join(root, "server"),
  stdio: ["inherit", "inherit", "inherit"],
  env: { ...process.env },
});

const web = spawn([bun, "x", "vite"], {
  cwd: join(root, "web"),
  stdio: ["inherit", "inherit", "inherit"],
  env: { ...process.env },
});

// ── HTTP proxy → Vite HTTPS (HTTP + HTTPS 共存) ──
const HTTP_PROXY_PORT = 5174;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const httpProxy = Bun.serve({
  port: HTTP_PROXY_PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // WebSocket upgrade (HMR 支持)
    if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const upgraded = httpProxy.upgrade(req, {
        data: { path: url.pathname + url.search },
      });
      if (upgraded) return;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // 普通 HTTP → HTTPS 代理
    const target = `https://localhost:${VITE_PORT}${url.pathname}${url.search}`;
    try {
      const resp = await fetch(target, {
        method: req.method,
        headers: req.headers,
        body: req.body,
        tls: { rejectUnauthorized: false },
      });
      return new Response(resp.body, resp);
    } catch (err) {
      return new Response(`Proxy error: ${err}`, { status: 502 });
    }
  },
  websocket: {
    open(ws) {
      const { path } = ws.data as { path: string };
      // 连接到 Vite WSS
      const upstream = new WebSocket(`wss://localhost:${VITE_PORT}${path}`, {
        tls: { rejectUnauthorized: false },
      });
      (ws as any)._upstream = upstream;

      upstream.addEventListener("open", () => {});
      upstream.addEventListener("message", (e) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(e.data);
      });
      upstream.addEventListener("close", () => ws.close());
      upstream.addEventListener("error", () => ws.close());
    },
    message(ws, message) {
      const up = (ws as any)._upstream as WebSocket;
      if (up?.readyState === WebSocket.OPEN) up.send(message);
    },
    close(ws) {
      (ws as any)._upstream?.close();
    },
  },
});

console.log(`[http-proxy] http://localhost:${HTTP_PROXY_PORT} → https://localhost:${VITE_PORT}`);

const cleanup = () => {
  server.kill();
  web.kill();
  httpProxy.stop();
  process.exit();
};

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

server.exited.then((code) => {
  console.log(`[server] exited with code ${code}`);
  cleanup();
});

web.exited.then((code) => {
  console.log(`[web] exited with code ${code}`);
  cleanup();
});
