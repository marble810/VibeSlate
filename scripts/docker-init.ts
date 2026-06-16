/**
 * VibeSlate — Docker Init Wrapper
 *
 * Development-only helper that runs the tracked Docker init flow against the
 * local deployment compose file after the user copies the example template.
 */

import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { spawn } from "bun";

const PREFIX = "docker-init";
const ROOT = join(import.meta.dirname, "..");
const STATE_DIR = join(ROOT, "data", "docker", "state");
const CERTS_DIR = join(ROOT, "data", "docker", "certs");
const COMPOSE_FILE = join(ROOT, "docker", "docker-compose.yml");
const COMPOSE_EXAMPLE = join(ROOT, "docker", "docker-compose.example.yml");

function log(msg: string) {
  console.log(`[${PREFIX}] ${msg}`);
}

function printBanner() {
  console.log("");
  console.log("  \x1b[1;36m╔══════════════════════════════════════════════════════╗");
  console.log("  ║        VibeSlate — Docker Init Wrapper              ║");
  console.log("  ╚══════════════════════════════════════════════════════╝\x1b[0m");
  console.log("");
}

function checkDockerAvailable(): boolean {
  const result = Bun.spawnSync(["docker", "--version"], { stdout: "pipe", stderr: "pipe" });
  return result.exitCode === 0;
}

// ═══════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════

async function main() {
  printBanner();

  if (!checkDockerAvailable()) {
    console.log("  \x1b[31m✗\x1b[0m Docker not found. Please install Docker first.");
    console.log("    https://docs.docker.com/get-docker/");
    process.exit(1);
  }

  mkdirSync(STATE_DIR, { recursive: true });
  mkdirSync(CERTS_DIR, { recursive: true });
  log(`Runtime state directory: ${STATE_DIR}`);
  log(`TLS cert directory: ${CERTS_DIR}`);

  if (!existsSync(COMPOSE_FILE)) {
    console.log("  \x1b[31m✗\x1b[0m Missing docker/docker-compose.yml.");
    console.log(`    Copy \x1b[36m${COMPOSE_EXAMPLE}\x1b[0m to \x1b[36m${COMPOSE_FILE}\x1b[0m first.`);
    process.exit(1);
  }

  const proc = spawn(
    ["docker", "compose", "--project-directory", ".", "-f", "docker/docker-compose.yml", "run", "--rm", "init"],
    {
      cwd: ROOT,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  const exitCode = await proc.exited;
  if (exitCode !== 0) process.exit(exitCode);

  console.log("");
  console.log("  \x1b[1;32m╔══════════════════════════════════════════════════════╗");
  console.log("  ║  Ready. Next steps:                                  ║");
  console.log("  ╚══════════════════════════════════════════════════════╝\x1b[0m");
  console.log("");
  console.log("  1. Apply any printed YAML lines to \x1b[36mdocker/docker-compose.yml\x1b[0m");
  console.log("  2. \x1b[36mbun run docker:up\x1b[0m");
  console.log("  3. \x1b[36mbun run docker:smoke\x1b[0m");
  console.log("");
}

main().catch((err) => {
  console.error(`\n\x1b[31mFatal error:\x1b[0m ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
