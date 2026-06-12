/**
 * Marble Panel — Docker Init
 *
 * Prepares the Docker runtime environment.
 * All config lives in docker-compose.yml — this script only handles:
 *   1. Creating the runtime state directory
 *   2. Optionally generating a password hash
 *
 * Usage:
 *   bun run docker:init
 */

import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { createInterface } from "node:readline";

const PREFIX = "docker-init";
const ROOT = join(import.meta.dirname, "..");
const STATE_DIR = join(ROOT, "data", "docker", "state");

function log(msg: string) {
  console.log(`[${PREFIX}] ${msg}`);
}

function printBanner() {
  console.log("");
  console.log("  \x1b[1;36m╔══════════════════════════════════════════════════════╗");
  console.log("  ║       Marble Panel — Docker Init                    ║");
  console.log("  ╚══════════════════════════════════════════════════════╝\x1b[0m");
  console.log("");
}

async function ask(rl: ReturnType<typeof createInterface>, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(`  ${prompt}`, (answer: string) => resolve(answer.trim()));
  });
}

async function confirm(
  rl: ReturnType<typeof createInterface>,
  prompt: string,
  defaultYes = true,
): Promise<boolean> {
  const suffix = defaultYes ? "Y/n" : "y/N";
  return new Promise((resolve) => {
    rl.question(`  ${prompt} (${suffix}): `, (answer: string) => {
      resolve((answer.trim() || (defaultYes ? "y" : "n")).toLowerCase().startsWith("y"));
    });
  });
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

  // Create state directory
  mkdirSync(STATE_DIR, { recursive: true });
  log(`Runtime state directory: ${STATE_DIR}`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  // Password hash (optional helper)
  const wantHash = await confirm(rl, "\n  Generate a password hash for auth?", false);
  if (wantHash) {
    const pwd = await ask(rl, "  Enter password: ");
    if (pwd) {
      const hash = await Bun.password.hash(pwd);
      console.log(`\n  \x1b[1mPassword hash:\x1b[0m`);
      console.log(`  \x1b[2m${hash}\x1b[0m`);
      console.log(`\n  Copy this into docker-compose.yml:`);
      console.log(`    AUTH_ENABLED=true`);
      console.log(`    AUTH_PASSWORD_HASH=${hash}`);
    }
  }

  rl.close();

  console.log("");
  console.log("  \x1b[1;32m╔══════════════════════════════════════════════════════╗");
  console.log("  ║  Ready. Next steps:                                  ║");
  console.log("  ╚══════════════════════════════════════════════════════╝\x1b[0m");
  console.log("");
  console.log("  1. Edit \x1b[36mdocker/docker-compose.yml\x1b[0m — fill in your provider tokens");
  console.log("  2. \x1b[36mbun run docker:up\x1b[0m");
  console.log("  3. \x1b[36mbun run docker:smoke\x1b[0m");
  console.log("");
}

main().catch((err) => {
  console.error(`\n\x1b[31mFatal error:\x1b[0m ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
