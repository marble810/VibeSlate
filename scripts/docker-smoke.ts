/**
 * VibeSlate — Docker Smoke Test
 */

import { join } from "node:path";
import { existsSync } from "node:fs";
import { spawn } from "bun";

const ROOT = join(import.meta.dirname, "..");
const COMPOSE_FILE = join(ROOT, "docker", "docker-compose.yml");
const COMPOSE_EXAMPLE = join(ROOT, "docker", "docker-compose.example.yml");

interface SmokeResult {
  check: string;
  passed: boolean;
  detail: string;
}

const results: SmokeResult[] = [];

function pass(check: string, detail = "") {
  results.push({ check, passed: true, detail });
  console.log(`  \x1b[32m✓\x1b[0m ${check}`);
}

function fail(check: string, detail = "") {
  results.push({ check, passed: false, detail });
  console.log(`  \x1b[31m✗\x1b[0m ${check}${detail ? ` — ${detail}` : ""}`);
}

async function composeExec(
  service: string,
  cmd: string[],
  timeout = 10_000,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const args = ["--project-directory", ".", "-f", "docker/docker-compose.yml", "exec", "-T", service, ...cmd];

  const proc = spawn(["docker", "compose", ...args], {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  const timer = setTimeout(() => {
    proc.kill("SIGTERM");
  }, timeout);
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  clearTimeout(timer);
  return { exitCode, stdout: stdout.trim(), stderr: stderr.trim() };
}

function printSummary() {
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;

  console.log("");
  console.log("  " + "─".repeat(50));
  console.log(`  \x1b[1mResults: ${passed}/${total} passed\x1b[0m`);

  if (failed > 0) {
    console.log(`\n  \x1b[31mFailed checks:\x1b[0m`);
    for (const r of results) {
      if (!r.passed) {
        console.log(`    \x1b[31m✗\x1b[0m ${r.check}${r.detail ? ` — ${r.detail}` : ""}`);
      }
    }
    console.log("");
    console.log(`  \x1b[31mSMOKE TEST FAILED (${failed} failures)\x1b[0m`);
  } else {
    console.log("");
    console.log(`  \x1b[32mALL CHECKS PASSED ✓\x1b[0m`);
  }
  console.log("");

  return failed === 0;
}

async function main() {
  if (!existsSync(COMPOSE_FILE)) {
    console.log("\x1b[31m[docker-smoke]\x1b[0m Missing docker/docker-compose.yml.");
    console.log(`Copy ${COMPOSE_EXAMPLE} to ${COMPOSE_FILE} before running smoke tests.`);
    process.exit(1);
  }

  console.log("");
  console.log("  \x1b[1;36m╔══════════════════════════════════════════════════════╗");
  console.log("  ║         VibeSlate — Docker Smoke Test               ║");
  console.log("  ╚══════════════════════════════════════════════════════╝\x1b[0m");
  console.log("");

  // 1. App container is running
  const ps = await composeExec("app", ["echo", "ok"], 5000);
  if (ps.exitCode === 0 && ps.stdout.includes("ok")) {
    pass("App container running");
  } else {
    fail("App container running", ps.stderr || ps.stdout);
  }

  // 2. App responds on internal port
  const health = await composeExec("app", ["bun", "-e", `
    import fs from "node:fs";
    import http from "node:http";
    import https from "node:https";

    const useTls =
      fs.existsSync("/app/data/certs/cert.pem") &&
      fs.existsSync("/app/data/certs/key.pem");
    const client = useTls ? https : http;
    const req = client.request(
      {
        hostname: "localhost",
        port: 12001,
        path: "/",
        method: "GET",
        rejectUnauthorized: false,
      },
      (res) => {
        process.exit(res.statusCode === 200 || res.statusCode === 401 ? 0 : 1);
      },
    );

    req.on("error", () => process.exit(1));
    req.end();
  `], 10000);
  if (health.exitCode === 0) {
    pass("App responds on port 12001");
  } else {
    fail("App responds on port 12001", health.stderr || health.stdout);
  }

  // 3. State volume is writable
  const stateCheck = await composeExec("app", ["sh", "-c", "echo ok > /app/data/state/.smoke-test && cat /app/data/state/.smoke-test"], 3000);
  if (stateCheck.exitCode === 0 && stateCheck.stdout.includes("ok")) {
    pass("State volume mounted and writable");
  } else {
    fail("State volume mounted and writable", stateCheck.stderr || stateCheck.stdout);
  }

  // 4. Host port mapping
  const portCheck = Bun.spawnSync(
    ["docker", "compose", "--project-directory", ".", "-f", "docker/docker-compose.yml", "port", "app", "12001"],
    { cwd: ROOT, stdout: "pipe", stderr: "pipe" },
  );
  if (portCheck.exitCode === 0 && portCheck.stdout.toString().trim()) {
    pass("App has host port mapping", portCheck.stdout.toString().trim());
  } else {
    fail("App has host port mapping", "No host port found");
  }

  const ok = printSummary();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(`\n\x1b[31mSmoke test error:\x1b[0m ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
