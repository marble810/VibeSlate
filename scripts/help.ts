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
row("./docker/GetCodexAuthInfo.sh", "Print OpenAI compose env lines");
row("docker compose -f docker/docker-compose.yml run --rm init", "Password auth + LAN HTTPS helper");
row("docker compose -f docker/docker-compose.yml up -d", "Start containers → http://localhost:12001");

// ── Bun helpers ──
heading("Bun Helpers");
row("bun run docker:init", "Run the same compose init flow from Bun");
row("bun run docker:up", "Wrap docker compose up -d");
row("bun run docker:smoke", "Verify deployment end-to-end");

// ── Development ──
heading("Development");
row("bun run dev", "Start dev server + web + proxy");
row("bun run dev:server", "Server only (--watch)");
row("bun run dev:web", "Frontend only (Vite)");
row("bun run build", "Build frontend for production");
row("bun run preview", "Build + start production server");

// ── Utilities ──
heading("Utilities");
row("bun run codex:auth", "Legacy Bun-based OpenAI credential extractor");
row("./docker/GetCodexAuthInfo.sh", "Shell helper for compose-ready credentials");
row("./docker/GetCodexAuthInfo.ps1", "PowerShell helper for compose-ready credentials");
row("bun run help", "Print this guide");

console.log("");
console.log(`  ${dim("Config:  docker/docker-compose.yml  (local copy from example)")}`);
console.log(`  ${dim("Dev:     server/config.jsonc          (copy config.example.jsonc)")}`);
console.log(`  ${dim("Docs:    README.md | DESIGN.md | ROADMAP.md")}`);
console.log("");
