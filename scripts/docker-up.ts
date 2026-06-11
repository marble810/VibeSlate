/**
 * Marble Panel — Docker Up
 *
 * Reads the mode from data/docker/mode and launches the
 * correct Docker Compose stack.
 *
 * Usage:
 *   bun run docker:up
 */

import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "bun";

const ROOT = join(import.meta.dirname, "..");
const MODE_FILE = join(ROOT, "data", "docker", "mode");
const ENV_FILE = join(ROOT, "data", "docker", ".env");

function log(msg: string) {
  console.log(`\x1b[36m[docker-up]\x1b[0m ${msg}`);
}

function warn(msg: string) {
  console.log(`\x1b[33m[docker-up]\x1b[0m ${msg}`);
}

async function runCompose(args: string[], env?: Record<string, string | undefined>) {
  const proc = spawn(["docker", "compose", "--project-directory", ".", ...args], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

async function main() {
  // Check if init has been run
  if (!existsSync(MODE_FILE)) {
    console.log("");
    console.log("  \x1b[33mNo Docker configuration found.\x1b[0m");
    console.log("  Run \x1b[36mbun run docker:init\x1b[0m first to set up LAN or Public mode.");
    console.log("");
    process.exit(1);
  }

  const mode = readFileSync(MODE_FILE, "utf-8").trim();
  log(`Detected mode: ${mode}`);

  // Load env file if it exists
  let envVars: Record<string, string | undefined> = {};
  if (existsSync(ENV_FILE)) {
    const envContent = readFileSync(ENV_FILE, "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      envVars[key] = val;
    }
  }

  // Build the compose command
  if (mode === "lan") {
    log("Starting LAN mode (app container with host port)...");
    // Use both the base compose and LAN override for port mapping
    await runCompose(
      ["-f", "docker/docker-compose.yml", "-f", "docker/docker-compose.lan.yml", "up", "--build", "-d"],
      envVars,
    );
  } else if (mode === "public") {
    log("Starting Public mode (app + Caddy + Fail2Ban)...");
    await runCompose(
      ["-f", "docker/docker-compose.yml", "--profile", "public", "up", "--build", "-d"],
      envVars,
    );
  } else {
    warn(`Unknown mode: ${mode}. Expected "lan" or "public".`);
    process.exit(1);
  }

  console.log("");
  log("Containers started successfully.");
  console.log("");
  console.log("  \x1b[1mUseful commands:\x1b[0m");
  console.log("    \x1b[2mdocker compose logs -f app\x1b[0m      # View app logs");
  console.log("    \x1b[2mdocker compose ps\x1b[0m                 # List containers");
  console.log("    \x1b[2mdocker compose down\x1b[0m              # Stop all containers");
  if (mode === "public") {
    console.log("    \x1b[2mdocker compose logs -f caddy\x1b[0m    # View Caddy logs");
    console.log("    \x1b[2mdocker compose logs fail2ban\x1b[0m    # View Fail2Ban logs");
  }
  console.log("");
}

main().catch((err) => {
  console.error(`\n\x1b[31mFatal error:\x1b[0m ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
