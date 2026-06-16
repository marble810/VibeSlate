/**
 * VibeSlate — Docker Up
 */

import { join } from "node:path";
import { existsSync } from "node:fs";
import { spawn } from "bun";

const ROOT = join(import.meta.dirname, "..");
const COMPOSE_FILE = join(ROOT, "docker", "docker-compose.yml");
const COMPOSE_EXAMPLE = join(ROOT, "docker", "docker-compose.example.yml");
const ENV_FILE = join(ROOT, "docker", ".env");
const ENV_EXAMPLE = join(ROOT, "docker", ".env.example");

function log(msg: string) {
  console.log(`\x1b[36m[docker-up]\x1b[0m ${msg}`);
}

async function main() {
  if (!existsSync(COMPOSE_FILE)) {
    console.log("\x1b[31m[docker-up]\x1b[0m Missing docker/docker-compose.yml.");
    console.log(`Copy ${COMPOSE_EXAMPLE} to ${COMPOSE_FILE} before starting the stack.`);
    process.exit(1);
  }
  if (!existsSync(ENV_FILE)) {
    console.log("\x1b[31m[docker-up]\x1b[0m Missing docker/.env.");
    console.log(`Copy ${ENV_EXAMPLE} to ${ENV_FILE} and fill it before starting the stack.`);
    process.exit(1);
  }

  log("Starting containers...");
  const proc = spawn(
    ["docker", "compose", "--project-directory", ".", "-f", "docker/docker-compose.yml", "up", "-d", "app"],
    {
      cwd: ROOT,
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  const exitCode = await proc.exited;
  if (exitCode !== 0) process.exit(exitCode);

  console.log("");
  log("Containers started successfully.");
  console.log("");
  console.log("  \x1b[1mUseful commands:\x1b[0m");
  console.log("    \x1b[2mdocker compose -f docker/docker-compose.yml logs -f app\x1b[0m  # View app logs");
  console.log("    \x1b[2mdocker compose ps\x1b[0m                       # List containers");
  console.log("    \x1b[2mdocker compose -f docker/docker-compose.yml down\x1b[0m     # Stop all containers");
  console.log("    \x1b[2mdocker inspect vibeslate\x1b[0m               # Inspect container");
  console.log("");
}

main().catch((err) => {
  console.error(`\n\x1b[31mFatal error:\x1b[0m ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
