/**
 * VibeSlate — Help
 */

function h(label: string) {
  return `\x1b[1m${label}\x1b[0m`;
}

function c(cmd: string) {
  return `\x1b[32m${cmd}\x1b[0m`;
}

function dim(s: string) {
  return `\x1b[2m${s}\x1b[0m`;
}

function cyan(s: string) {
  return `\x1b[36m${s}\x1b[0m`;
}

const W = 22;

function row(cmd: string, desc: string) {
  const padded = cmd.padEnd(W);
  console.log(`  ${c(padded)} ${dim(desc)}`);
}

function heading(text: string) {
  console.log(`\n${h(text)}`);
}

console.log("");
console.log(`  ${cyan(h("VibeSlate"))}  ${dim("— LLM usage and spare-device info slate")}`);

// ── Docker deployment ──
heading("Docker Deployment");
row("cp docker/docker-compose.example.yml docker/docker-compose.yml", "Create your local compose file");
row("cp docker/.env.example docker/.env", "Create your local Docker env file");
row("docker compose -f docker/docker-compose.yml up -d app", "Start containers → http://localhost:12001");
row("bun run docker:openai:login", "Create Docker-owned OpenAI device-code session");
row("docker compose -f docker/docker-compose.yml ps", "Check container status");

// ── Bun helpers ──
heading("Bun Helpers");
row("bun run docker:up", "Wrap docker compose up -d app");
row("bun run docker:smoke", "Verify deployment end-to-end");
row("bun run docker:openai:login", "Run OpenAI login CLI inside the app container");

// ── Development ──
heading("Development");
row("bun run dev", "Start dev server + web + proxy");
row("bun run dev:server", "Server only (--watch)");
row("bun run dev:web", "Frontend only (Vite)");
row("bun run build", "Build frontend for production");
row("bun run preview", "Build + start production server");

// ── Utilities ──
heading("Utilities");
row("bun run openai:auth:doctor", "Inspect Codex app-server auth state safely");
row("bun run openai:auth:login", "Start OpenAI login via the running backend");
row("bun run check:codex-app-server-schema", "Verify required Codex protocol methods");
row("bun run help", "Print this guide");

console.log("");
console.log(`  ${dim("Config:  docker/.env + docker/docker-compose.yml  (local copies from examples)")}`);
console.log(`  ${dim("Dev:     server/config.jsonc          (copy config.example.jsonc; fill credentials manually)")}`);
console.log(`  ${dim("Docs:    README.md | docs/DOCKER_DEPLOYMENT.md | DESIGN.md | ROADMAP.md")}`);
console.log("");
