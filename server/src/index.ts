import { generateSnapshot } from "./mock";

const PORT = parseInt(process.env.PORT || "12001", 10);

// Determine web dist path for static file serving.
// In Docker, the frontend dist is at /app/web/dist.
// In local dev (server/ dir), it's ../web/dist relative to this source file.
const WEB_DIST = (() => {
  const candidates = [
    "/app/web/dist",
    new URL("../web/dist", import.meta.url).pathname,
  ];
  for (const p of candidates) {
    try {
      const stat = Bun.statSync(p);
      if (stat.isDirectory()) return p;
    } catch {
      // not found, try next
    }
  }
  return null;
})();

const server = Bun.serve({
  port: PORT,
  async fetch(req: Request) {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
      });
    }

    // SSE endpoint
    if (url.pathname === "/events") {
      let timer: Timer | null = null;
      const body = new ReadableStream({
        start(controller) {
          // Push initial snapshot immediately
          const push = () => {
            try {
              const snapshot = generateSnapshot();
              const data = `event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`;
              controller.enqueue(new TextEncoder().encode(data));
            } catch (err) {
              // If controller is closed, stop
            }
          };
          push();
          timer = setInterval(push, 2000);

          // Keep-alive ping every 30s to prevent proxy timeouts
          const pingTimer = setInterval(() => {
            try {
              controller.enqueue(new TextEncoder().encode(": ping\n\n"));
            } catch {
              clearInterval(pingTimer);
            }
          }, 30_000);
        },
        cancel() {
          if (timer) clearInterval(timer);
        },
      });

      return new Response(body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // Static file serving for SPA
    if (WEB_DIST) {
      let pathname = url.pathname;
      if (pathname === "/") pathname = "/index.html";

      const filePath = WEB_DIST + pathname;
      const file = Bun.file(filePath);

      const exists = await file.exists();
      if (exists) {
        const ext = pathname.split(".").pop()?.toLowerCase();
        const mime: Record<string, string> = {
          html: "text/html",
          js: "text/javascript",
          css: "text/css",
          svg: "image/svg+xml",
          png: "image/png",
          ico: "image/x-icon",
          json: "application/json",
          webmanifest: "application/manifest+json",
          wasm: "application/wasm",
        };

        return new Response(file, {
          headers: {
            "Content-Type": mime[ext || ""] || "application/octet-stream",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=3600",
          },
        });
      }

      // SPA fallback: serve index.html for unknown paths (client-side routing)
      const indexFile = Bun.file(WEB_DIST + "/index.html");
      const indexExists = await indexFile.exists();
      if (indexExists) {
        return new Response(indexFile, {
          headers: {
            "Content-Type": "text/html",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
    }

    // Fallback 404
    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Marble Panel server running on http://localhost:${server.port}`);
console.log(
  WEB_DIST
    ? `Serving static files from: ${WEB_DIST}`
    : "Warning: No web dist found — static file serving disabled"
);
