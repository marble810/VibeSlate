/**
 * VibeSlate — Interactive Init (runs inside Docker container)
 *
 * Usage:
 *   docker compose run --rm init
 *
 * Guides the user through:
 *   1. Provider token status check
 *   2. Password auth (optional)
 *   3. mkcert LAN HTTPS (optional)
 */

import { existsSync, mkdirSync } from "node:fs";
import { createInterface } from "node:readline";
import { spawn } from "bun";

const CERT_DIR = "/app/data/certs";
const ROOT_CA = `${CERT_DIR}/rootCA.pem`;
const CERT_FILE = `${CERT_DIR}/cert.pem`;
const KEY_FILE = `${CERT_DIR}/key.pem`;

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

async function ask(
  rl: ReturnType<typeof createInterface>,
  prompt: string,
): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (a) => resolve(a.trim()));
  });
}

async function confirm(
  rl: ReturnType<typeof createInterface>,
  prompt: string,
  defaultYes = false,
): Promise<boolean> {
  const suffix = defaultYes ? "Y/n" : "y/N";
  return new Promise((resolve) => {
    rl.question(`${prompt} [${suffix}] `, (a) => {
      resolve((a.trim() || (defaultYes ? "y" : "n")).toLowerCase().startsWith("y"));
    });
  });
}

async function sh(
  cmd: string,
  args: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = spawn([cmd, ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode: code, stdout: out.trim(), stderr: err.trim() };
}

function ok(msg: string) {
  console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
}

function warn(msg: string) {
  console.log(`  \x1b[33m⚠\x1b[0m ${msg}`);
}

function info(msg: string) {
  console.log(`  \x1b[90m${msg}\x1b[0m`);
}

// ═══════════════════════════════════════════════════════════
// Token Status
// ═══════════════════════════════════════════════════════════

function printTokenStatus() {
  const ds = process.env.DEEPSEEK_PLATFORM_TOKEN;
  const oa = process.env.OPENAI_REFRESH_TOKEN;
  const ocWs = process.env.OPENCODE_WORKSPACE_ID;
  const ocCookie = process.env.OPENCODE_AUTH_COOKIE;

  console.log("");
  console.log("  \x1b[1mProvider Tokens\x1b[0m");
  if (ds) ok(`DeepSeek    (${ds.slice(0, 12)}...)`);
  else warn("DeepSeek    — set DEEPSEEK_PLATFORM_TOKEN in docker/docker-compose.yml");

  if (oa) ok(`OpenAI      (${oa.slice(0, 12)}...)`);
  else warn("OpenAI      — set OPENAI_REFRESH_TOKEN in docker/docker-compose.yml");

  if (ocWs && ocCookie) ok("OpenCode Go");
  else info("OpenCode Go — not configured (optional)");
}

// ═══════════════════════════════════════════════════════════
// Password Auth
// ═══════════════════════════════════════════════════════════

async function setupAuth(rl: ReturnType<typeof createInterface>): Promise<void> {
  console.log("");
  console.log("  \x1b[1mPassword Auth\x1b[0m");

  const enabled = process.env.AUTH_ENABLED === "true";
  if (enabled) {
    info("Already enabled. To disable: set AUTH_ENABLED=false in docker/docker-compose.yml");
    return;
  }

  const want = await confirm(rl, "  Enable password protection?");
  if (!want) {
    info("Skipped. Set AUTH_ENABLED=true in docker/docker-compose.yml to enable later.");
    return;
  }

  const pwd = await ask(rl, "  Enter password: ");
  if (!pwd) {
    warn("No password entered — skipping.");
    return;
  }

  const hash = await Bun.password.hash(pwd);
  const composeSafeHash = hash.split("$").join("$$");
  console.log("");
  console.log(`  \x1b[1mAdd these YAML lines under x-vibeslate-env in docker/docker-compose.yml:\x1b[0m`);
  console.log(`    AUTH_ENABLED: "true"`);
  console.log(`    AUTH_PASSWORD_HASH: "${composeSafeHash}"`);
  console.log("");
}

// ═══════════════════════════════════════════════════════════
// mkcert LAN HTTPS
// ═══════════════════════════════════════════════════════════

async function checkMkcert(): Promise<{ caroot: string }> {
  const result = await sh("mkcert", ["-CAROOT"]);
  if (result.exitCode !== 0) {
    throw new Error(
      "mkcert not found. It should be installed in the Docker image.",
    );
  }
  return { caroot: result.stdout };
}

function detectLanIp(): string | null {
  const { networkInterfaces } = require("node:os") as typeof import("node:os");
  const ifaces = networkInterfaces();

  for (const [, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (!addr.internal && addr.family === "IPv4" && !addr.address.startsWith("172.")) {
        // Prefer non-Docker bridge addresses
        if (addr.address.startsWith("192.168.") || addr.address.startsWith("10.")) {
          return addr.address;
        }
      }
    }
  }

  // Fallback: any non-internal IPv4
  for (const [, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (!addr.internal && addr.family === "IPv4") return addr.address;
    }
  }

  return null;
}

async function getHostname(): Promise<string> {
  const result = await sh("hostname", []);
  return result.exitCode === 0 && result.stdout ? result.stdout : "vibeslate";
}

async function setupMkcert(rl: ReturnType<typeof createInterface>): Promise<void> {
  console.log("");
  console.log("  \x1b[1mLAN HTTPS (mkcert)\x1b[0m");
  info("Generates a local CA + leaf cert. Clients scan a QR code to install the CA.");
  info("Skip this if you use Caddy/Nginx/Traefik — your proxy handles TLS.");

  const want = await confirm(rl, "  Enable LAN HTTPS via mkcert?");
  if (!want) {
    info("Skipped. TLS handled by your reverse proxy.");
    return;
  }

  mkdirSync(CERT_DIR, { recursive: true });

  // 1. Check mkcert + generate CA
  const { caroot } = await checkMkcert();
  ok("mkcert ready");

  const caKey = `${caroot}/rootCA-key.pem`;
  const caPem = `${caroot}/rootCA.pem`;
  if (!existsSync(caPem) || !existsSync(caKey)) {
    // First run — trigger CA generation
    const init = await sh("mkcert", ["-cert-file", "/tmp/_init.pem", "-key-file", "/tmp/_init-key.pem", "localhost"]);
    if (init.exitCode !== 0) {
      console.log(`  \x1b[31m✗\x1b[0m Failed to generate CA: ${init.stderr}`);
      return;
    }
    ok("Root CA generated");
  }

  // 2. Detect LAN info
  const lanIp = detectLanIp();
  const hostname = await getHostname();
  const localName = `${hostname}.local`;
  const sanList: string[] = [];

  if (lanIp) {
    sanList.push(lanIp);
    ok(`LAN IP: ${lanIp}`);
  } else {
    warn("Could not detect LAN IP — using localhost only");
    sanList.push("localhost");
  }

  if (hostname && hostname !== "vibeslate") {
    sanList.push(localName);
    ok(`Hostname: ${localName}`);
  }

  sanList.push("localhost");
  ok(`Leaf cert SANs: ${sanList.join(", ")}`);

  // 3. Generate leaf cert
  const mkcert = await sh("mkcert", [
    "-cert-file", CERT_FILE,
    "-key-file", KEY_FILE,
    ...sanList,
  ]);
  if (mkcert.exitCode !== 0) {
    console.log(`  \x1b[31m✗\x1b[0m Cert generation failed: ${mkcert.stderr}`);
    return;
  }
  ok(`Leaf cert saved: ${CERT_FILE}`);

  // 4. Copy root CA to certs dir
  const caDest = ROOT_CA;
  await Bun.write(caDest, Bun.file(caPem));
  ok(`Root CA copied: ${caDest}`);

  // 5. Display QR code
  const setupUrl = lanIp
    ? `http://${lanIp}:12001/lan-setup`
    : `http://localhost:12001/lan-setup`;

  console.log("");
  console.log("  \x1b[1m📱 Scan this QR to install the CA certificate:\x1b[0m");
  console.log("");

  try {
    const QRCode = await import("qrcode");
    const qr = await QRCode.toString(setupUrl, { type: "terminal", small: true });
    console.log(qr);
  } catch {
    info(`(QR generation failed — open this URL on a device:)`);
  }

  console.log(`  \x1b[36m${setupUrl}\x1b[0m`);
  console.log("");
  console.log("  \x1b[1mApply certs:\x1b[0m  start or restart the app with docker compose up -d");
  console.log("");
}

// ═══════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════

async function main() {
  console.log("");
  console.log("  \x1b[1;36m╔══════════════════════════════════════════════════════╗");
  console.log("  ║          VibeSlate — Init                            ║");
  console.log("  ╚══════════════════════════════════════════════════════╝\x1b[0m");

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  printTokenStatus();
  await setupAuth(rl);
  await setupMkcert(rl);

  rl.close();

  console.log("  \x1b[1;32m╔══════════════════════════════════════════════════════╗");
  console.log("  ║  Setup complete.                                     ║");
  console.log("  ╚══════════════════════════════════════════════════════╝\x1b[0m");
  console.log("");
}

main().catch((err) => {
  console.error(`\n\x1b[31mSetup error:\x1b[0m ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
