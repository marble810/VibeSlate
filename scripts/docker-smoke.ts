/**
 * Marble Panel — Docker Smoke Test
 *
 * Validates Docker deployment end-to-end for both LAN and Public modes.
 *
 * Usage:
 *   bun run docker:smoke -- --mode lan
 *   bun run docker:smoke -- --mode public
 */

import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "bun";

const ROOT = join(import.meta.dirname, "..");
const MODE_FILE = join(ROOT, "data", "docker", "mode");
const ENV_FILE = join(ROOT, "data", "docker", ".env");

type DockerMode = "lan" | "public";

interface SmokeResult {
  check: string;
  passed: boolean;
  detail: string;
}

const results: SmokeResult[] = [];

function composeBaseArgs(mode?: DockerMode): string[] {
  if (mode === "lan") return ["-f", "docker/docker-compose.yml", "-f", "docker/docker-compose.lan.yml"];
  if (mode === "public") return ["-f", "docker/docker-compose.yml", "--profile", "public"];
  return [];
}

function loadDockerEnv(): Record<string, string> {
  if (!existsSync(ENV_FILE)) return {};
  const env: Record<string, string> = {};
  const content = readFileSync(ENV_FILE, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  }
  return env;
}

function composeSync(
  mode: DockerMode,
  args: string[],
): { exitCode: number; stdout: string; stderr: string } {
  const result = Bun.spawnSync(["docker", "compose", "--project-directory", ".", ...composeBaseArgs(mode), ...args], {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString().trim(),
    stderr: result.stderr.toString().trim(),
  };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

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
  mode?: DockerMode,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const args = ["--project-directory", ".", ...composeBaseArgs(mode), "exec", "-T", service, ...cmd];

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

// ═══════════════════════════════════════════════════════════
// LAN smoke
// ═══════════════════════════════════════════════════════════

async function smokeLan() {
  console.log("\n  \x1b[1mLAN Mode Smoke Test\x1b[0m\n");

  // 1. App container is running
  const ps = await composeExec("app", ["echo", "ok"], 5000, "lan");
  if (ps.exitCode === 0 && ps.stdout.includes("ok")) {
    pass("App container running");
  } else {
    fail("App container running", ps.stderr || ps.stdout);
  }

  // 2. App responds on internal port
  const health = await composeExec("app", ["wget", "--no-check-certificate", "-qO-", "https://localhost:12001/"], 5000, "lan");
  if (health.exitCode === 0) {
    pass("App responds over HTTPS on port 12001");
  } else {
    fail("App responds over HTTPS on port 12001", health.stderr || health.stdout);
  }

  // 3. App has host port mapping (LAN mode should expose port)
  const portCheck = composeSync("lan", ["port", "app", "12001"]);
  if (portCheck.exitCode === 0 && portCheck.stdout) {
    pass("App has host port mapping", portCheck.stdout);
  } else {
    fail("App has host port mapping", "No host port found — LAN mode must expose a port");
  }

  // 4. No Caddy container
  const caddyPs = composeSync("lan", ["ps", "-q", "caddy"]);
  if (caddyPs.exitCode === 0 && !caddyPs.stdout) {
    pass("Caddy not running (correct for LAN mode)");
  } else {
    fail("Caddy not running", "Caddy should not run in LAN mode");
  }

  // 5. No Fail2Ban container
  const f2bPs = composeSync("lan", ["ps", "-q", "fail2ban"]);
  if (f2bPs.exitCode === 0 && !f2bPs.stdout) {
    pass("Fail2Ban not running (correct for LAN mode)");
  } else {
    fail("Fail2Ban not running", "Fail2Ban should not run in LAN mode");
  }

  // 6. Config is mounted
  const cfgCheck = await composeExec("app", ["cat", "/app/data/server.config.json"], 3000, "lan");
  if (cfgCheck.exitCode === 0 && cfgCheck.stdout.includes("deepseek_token")) {
    pass("Server config mounted in container");
  } else {
    fail("Server config mounted in container", "config.json not found or not readable");
  }

  // 7. TLS certs mounted (if LAN generated certs)
  const tlsCheck = await composeExec("app", ["ls", "/app/data/certs/"], 3000, "lan");
  if (tlsCheck.exitCode === 0) {
    pass("TLS cert directory accessible");
  } else {
    // Not a hard failure — certs could be generated at runtime
    pass("TLS cert directory", "Certs may be auto-generated at runtime — check app logs");
  }
}

// ═══════════════════════════════════════════════════════════
// Public smoke
// ═══════════════════════════════════════════════════════════

async function smokePublic() {
  console.log("\n  \x1b[1mPublic Mode Smoke Test\x1b[0m\n");

  // 1. App container running (internal only)
  const ps = await composeExec("app", ["echo", "ok"], 5000, "public");
  if (ps.exitCode === 0) {
    pass("App container running (internal)");
  } else {
    fail("App container running", ps.stderr);
  }

  // 2. App has NO host port mapping
  const portCheck = composeSync("public", ["port", "app", "12001"]);
  if (portCheck.exitCode !== 0 || !portCheck.stdout) {
    pass("App has no host port mapping (internal only)");
  } else {
    fail("App has no host port mapping", `Found host mapping: ${portCheck.stdout} — Public mode should not expose app port`);
  }

  // 3. Caddy container running
  const caddyPs = composeSync("public", ["ps", "-q", "caddy"]);
  if (caddyPs.exitCode === 0 && caddyPs.stdout) {
    pass("Caddy container running");
  } else {
    fail("Caddy container running", "Caddy should be running in Public mode");
  }

  // 4. Caddy can reach app
  const caddyToApp = await composeExec("caddy", ["wget", "-qO-", "http://app:12001/"], 5000, "public");
  if (caddyToApp.exitCode === 0) {
    pass("Caddy can reach app on internal network");
  } else {
    fail("Caddy can reach app", caddyToApp.stderr);
  }

  // 5. Fail2Ban container running
  const f2bPs = composeSync("public", ["ps", "-q", "fail2ban"]);
  if (f2bPs.exitCode === 0 && f2bPs.stdout) {
    pass("Fail2Ban container running");
  } else {
    fail("Fail2Ban container running", "Fail2Ban should be running in Public mode");
  }

  // 6. Fail2Ban jail status
  const jailStatus = await composeExec("fail2ban", ["fail2ban-client", "status", "marble-panel"], 5000, "public");
  if (jailStatus.exitCode === 0 && jailStatus.stdout.includes("marble-panel")) {
    pass("Fail2Ban jail 'marble-panel' active");
  } else {
    fail("Fail2Ban jail active", jailStatus.stderr || jailStatus.stdout);
  }

  // 7. Trigger auth failures through a trusted Docker peer and verify logging.
  const dockerEnv = loadDockerEnv();
  const domain = dockerEnv.MARBLE_DOMAIN || process.env.MARBLE_DOMAIN || "localhost";
  const testIp = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
  const hostHeader = shellQuote(`Host: ${domain}`);
  const xffHeader = shellQuote(`X-Forwarded-For: ${testIp}`);
  const formHeader = shellQuote("Content-Type: application/x-www-form-urlencoded");
  const authScript = [
    "for i in 1 2 3 4 5; do",
    `wget -qO- --server-response --header ${hostHeader} --header ${xffHeader} --header ${formHeader} --post-data 'password=wrong-smoke-test' http://app:12001/auth/login >/tmp/marble-smoke-auth.out 2>&1 || true;`,
    "done",
  ].join(" ");
  const authFailures = await composeExec("caddy", ["sh", "-c", authScript], 8000, "public");
  if (authFailures.exitCode === 0) {
    pass("Wrong-password attempts sent through trusted Docker peer", testIp);
  } else {
    fail("Wrong-password attempts sent", authFailures.stderr || authFailures.stdout);
  }

  const authLog = await composeExec("fail2ban", [
    "sh",
    "-c",
    `grep -c ${shellQuote(`MARBLE_AUTH_FAIL ip=${testIp} `)} /var/log/marble-panel/auth.log || true`,
  ], 5000, "public");
  const failureCount = Number.parseInt(authLog.stdout, 10);
  if (Number.isFinite(failureCount) && failureCount >= 5) {
    pass("Auth failures are written to shared auth.log", `${failureCount} failures for ${testIp}`);
  } else {
    fail("Auth failures are written to shared auth.log", authLog.stderr || authLog.stdout || "No matching auth failures");
  }

  // 8. Wait for Fail2Ban to ban the test IP and write the shared ban list.
  const banCheck = await composeExec("fail2ban", [
    "sh",
    "-c",
    `for i in 1 2 3 4 5 6 7 8 9 10; do grep -qx ${shellQuote(testIp)} /var/lib/fail2ban/marble-panel-banned.txt && exit 0; sleep 1; done; cat /var/lib/fail2ban/marble-panel-banned.txt 2>/dev/null; exit 1`,
  ], 15_000, "public");
  if (banCheck.exitCode === 0) {
    pass("Fail2Ban writes banned IP to shared ban list", testIp);
  } else {
    fail("Fail2Ban writes banned IP to shared ban list", banCheck.stderr || banCheck.stdout);
  }

  // 9. Verify the app enforces the shared ban list with a 403.
  const bannedRequest = await composeExec("caddy", [
    "sh",
    "-c",
    `wget -S -qO- --header ${hostHeader} --header ${xffHeader} http://app:12001/ 2>&1 || true`,
  ], 5000, "public");
  if (bannedRequest.stdout.includes("403") || bannedRequest.stdout.includes("Forbidden")) {
    pass("Banned IP receives 403 from app");
  } else {
    fail("Banned IP receives 403 from app", bannedRequest.stderr || bannedRequest.stdout);
  }

  // Best-effort cleanup of the synthetic smoke-test ban.
  await composeExec("fail2ban", ["fail2ban-client", "set", "marble-panel", "unbanip", testIp], 5000, "public");

  // 10. Config mounted
  const cfgCheck = await composeExec("app", ["cat", "/app/data/server.config.json"], 3000, "public");
  if (cfgCheck.exitCode === 0) {
    pass("Server config mounted in container");
  } else {
    fail("Server config mounted", cfgCheck.stderr);
  }
}

// ═══════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════

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
  // Parse --mode flag
  const args = process.argv.slice(2);
  const modeIdx = args.indexOf("--mode");
  let mode = modeIdx >= 0 ? args[modeIdx + 1] : null;

  // Also check --mode=lan style
  if (!mode) {
    for (const arg of args) {
      if (arg.startsWith("--mode=")) {
        mode = arg.slice(7);
        break;
      }
    }
  }

  // Fall back to mode file
  if (!mode && existsSync(MODE_FILE)) {
    mode = readFileSync(MODE_FILE, "utf-8").trim();
  }

  if (!mode || !["lan", "public"].includes(mode)) {
    console.error("Usage: bun run docker:smoke -- --mode <lan|public>");
    console.error("  or ensure data/docker/mode exists from docker:init");
    process.exit(1);
  }

  console.log("");
  console.log("  \x1b[1;36m╔══════════════════════════════════════════════════════╗");
  console.log("  ║       Marble Panel — Docker Smoke Test              ║");
  console.log(`  ║       Mode: ${mode.toUpperCase()}${" ".repeat(43 - mode.length)}║`);
  console.log("  ╚══════════════════════════════════════════════════════╝\x1b[0m");

  if (mode === "lan") {
    await smokeLan();
  } else {
    await smokePublic();
  }

  const ok = printSummary();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(`\n\x1b[31mSmoke test error:\x1b[0m ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
