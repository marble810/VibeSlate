/**
 * Marble Panel — Docker Up
 *
 * Starts the Docker Compose stack.
 *
 * Usage:
 *   bun run docker:up
 */

import { join } from "node:path";
import { spawn } from "bun";

const ROOT = join(import.meta.dirname, "..");

function log(msg: string) {
  console.log(`\x1b[36m[docker-up]\x1b[0m ${msg}`);
}

async function main() {
  log("Starting containers...");
  const proc = spawn(
    ["docker", "compose", "--project-directory", ".", "-f", "docker/docker-compose.yml", "up", "--build", "-d"],
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
  console.log("    \x1b[2mdocker compose logs -f app\x1b[0m      # View app logs");
  console.log("    \x1b[2mdocker compose ps\x1b[0m                 # List containers");
  console.log("    \x1b[2mdocker compose down\x1b[0m              # Stop all containers");
  console.log("");
}

main().catch((err) => {
  console.error(`\n\x1b[31mFatal error:\x1b[0m ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
