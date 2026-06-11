// Marble Panel LAN HTTPS Installer
// See PLAN/LAN_SCOPE_PLAN.md for the active scope plan.
//
// Usage:
//   bun run lan:https
//
// Phases 1-3: Foundation, Bootstrap Downloads, TUI

import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, unlinkSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { networkInterfaces } from "node:os";

const ROOT = join(import.meta.dirname, "..");
const DATA_DIR = join(ROOT, "data", "lan-tls");
const HTTPS_PORT = 12001;
const BOOTSTRAP_PORT = 12080;

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════

interface Manifest {
  generatedAt: string;
  lanIp: string;
  hostname: string;
  altNames: string[];
  appUrl: string;
  appUrlIp: string;
  bootstrapUrl: string;
  caFingerprint: string;
  caSubject: string;
  certPath: string;
  keyPath: string;
  rootCaPath: string;
  profilePath: string;
  token: string;
}

// ═══════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════

function log(msg: string) {
  console.log(`\x1b[36m[lan-https]\x1b[0m ${msg}`);
}

function warn(msg: string) {
  console.log(`\x1b[33m[lan-https]\x1b[0m ${msg}`);
}

function generateToken(): string {
  return randomBytes(12).toString("hex");
}

function decodeBytes(bytes: Uint8Array | null | undefined): string {
  if (!bytes) return "";
  return new TextDecoder().decode(bytes).trim();
}

async function sh(
  cmd: string,
  args: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([cmd, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout: stdout.trim(), stderr: stderr.trim() };
}

function spawnBg(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: Record<string, string | undefined> },
) {
  return Bun.spawn([cmd, ...args], {
    cwd: opts.cwd ?? ROOT,
    env: { ...process.env, ...opts.env },
    stdout: "inherit",
    stderr: "inherit",
  });
}

function setRawMode(enabled: boolean): void {
  if (typeof process.stdin.setRawMode === "function") {
    process.stdin.setRawMode(enabled);
  }
}

// ═══════════════════════════════════════════════════════════
// Step 1: Check mkcert
// ═══════════════════════════════════════════════════════════

async function checkMkcert(): Promise<{ caroot: string }> {
  const result = await sh("mkcert", ["-CAROOT"]);
  if (result.exitCode !== 0) {
    throw new Error(
      "mkcert not found.\n\n" +
        "Install mkcert:\n" +
        "  macOS:  brew install mkcert\n" +
        "  Linux:  apt install mkcert / pacman -S mkcert\n\n" +
        "Then run: mkcert -install",
    );
  }
  const caroot = result.stdout;
  log(`mkcert found → CAROOT: ${caroot}`);
  return { caroot };
}

async function ensureMkcertInstalled(caroot: string): Promise<void> {
  const rootCaPath = join(caroot, "rootCA.pem");
  if (!existsSync(rootCaPath)) {
    log("Installing mkcert local CA (may require sudo)...");
    const install = await sh("mkcert", ["-install"]);
    if (install.exitCode !== 0) {
      warn(`mkcert -install had issues: ${install.stderr}`);
      log("Attempting to continue — cert generation may still work.");
    }
  }
}

// ═══════════════════════════════════════════════════════════
// Step 2: Detect LAN IP
// ═══════════════════════════════════════════════════════════

function detectLanIp(): string | null {
  const interfaces = networkInterfaces();

  // Preference order: en0/en1 (macOS Wi-Fi/Ethernet) > eth* > wlan* > any
  const preferred = [/^en\d+$/, /^eth\d*$/, /^wlan\d*$/];

  for (const pattern of preferred) {
    for (const [name, addrs] of Object.entries(interfaces)) {
      if (!addrs || !pattern.test(name)) continue;
      for (const addr of addrs) {
        if (!addr.internal && addr.family === "IPv4") return addr.address;
      }
    }
  }

  // Fallback: any non-internal IPv4
  for (const [, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (!addr.internal && addr.family === "IPv4") return addr.address;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
// Step 3: Get hostname
// ═══════════════════════════════════════════════════════════

async function getHostname(): Promise<string> {
  const result = await sh("hostname", []);
  return result.exitCode === 0 && result.stdout ? result.stdout : "marble-panel";
}

function toLocalHostname(hostname: string): string | null {
  const trimmed = hostname.trim().replace(/\.$/, "");
  const base = trimmed.replace(/(\.local)+$/i, "");
  if (!base || base === "localhost") return null;
  return `${base}.local`;
}

// ═══════════════════════════════════════════════════════════
// Step 4: Generate leaf cert
// ═══════════════════════════════════════════════════════════

async function generateLeafCert(
  _caroot: string,
  altNames: string[],
): Promise<{ certPath: string; keyPath: string }> {
  mkdirSync(DATA_DIR, { recursive: true });
  const certPath = join(DATA_DIR, "app-cert.pem");
  const keyPath = join(DATA_DIR, "app-key.pem");

  // Reuse existing cert only if it is still valid and covers the current SAN set.
  if (existsSync(certPath) && existsSync(keyPath)) {
    const verify = await sh("openssl", [
      "x509",
      "-in",
      certPath,
      "-noout",
      "-checkend",
      "86400", // 24h grace
    ]);
    const coversAltNames = await certificateCoversAltNames(certPath, altNames);
    if (verify.exitCode === 0 && coversAltNames) {
      log("Existing leaf cert still valid — reusing.");
      return { certPath, keyPath };
    }
    if (verify.exitCode !== 0) {
      log("Leaf cert expired or near expiry — regenerating.");
    } else {
      log("Leaf cert SAN no longer matches current LAN settings — regenerating.");
    }
  }

  log(`Generating leaf cert for: ${altNames.join(" ")}`);
  if (existsSync(certPath)) unlinkSync(certPath);
  if (existsSync(keyPath)) unlinkSync(keyPath);
  const mkcert = await sh("mkcert", [
    "-cert-file",
    certPath,
    "-key-file",
    keyPath,
    ...altNames,
  ]);
  if (mkcert.exitCode !== 0) {
    throw new Error(`mkcert cert generation failed:\n${mkcert.stderr}`);
  }
  log("Leaf cert generated successfully.");
  return { certPath, keyPath };
}

async function certificateCoversAltNames(
  certPath: string,
  altNames: string[],
): Promise<boolean> {
  const inspect = await sh("openssl", ["x509", "-in", certPath, "-noout", "-text"]);
  if (inspect.exitCode !== 0) return false;

  const names = new Set<string>();
  for (const match of inspect.stdout.matchAll(/DNS:([^,\n]+)/g)) {
    names.add(match[1].trim());
  }
  for (const match of inspect.stdout.matchAll(/IP Address:([^,\n]+)/g)) {
    names.add(match[1].trim());
  }

  return altNames.every((name) => names.has(name));
}

// ═══════════════════════════════════════════════════════════
// Step 5: Copy root CA & compute fingerprint
// ═══════════════════════════════════════════════════════════

function copyRootCa(caroot: string): { rootCaPath: string; fingerprint: string; subject: string } {
  const srcPem = join(caroot, "rootCA.pem");
  if (!existsSync(srcPem)) {
    throw new Error(
      `Root CA not found at ${srcPem}. Run "mkcert -install" first.`,
    );
  }

  const destPem = join(DATA_DIR, "rootCA.pem");
  const destCrt = join(DATA_DIR, "rootCA.crt");
  const destCer = join(DATA_DIR, "rootCA.cer");

  const pemBytes = readFileSync(srcPem);
  writeFileSync(destPem, pemBytes);
  writeFileSync(destCrt, pemBytes); // .crt = same PEM content

  // Generate DER-encoded .cer via openssl
  const der = Bun.spawnSync([
    "openssl",
    "x509",
    "-outform",
    "der",
    "-in",
    srcPem,
    "-out",
    destCer,
  ]);
  if (der.exitCode !== 0) {
    warn("Failed to generate DER cert for Android fallback.");
  }

  // SHA-256 fingerprint (colon-separated hex pairs)
  const hash = createHash("sha256").update(pemBytes).digest("hex");
  const fingerprint = hash.match(/.{2}/g)!.join(":").toUpperCase();
  const subjectResult = Bun.spawnSync([
    "openssl",
    "x509",
    "-in",
    srcPem,
    "-noout",
    "-subject",
  ]);
  const subject = decodeBytes(subjectResult.stdout).replace(/^subject=\s*/, "");

  log(`Root CA SHA256: ${fingerprint}`);
  log(`Root CA subject: ${subject}`);
  return { rootCaPath: destPem, fingerprint, subject };
}

// ═══════════════════════════════════════════════════════════
// Step 6: Build web dist
// ═══════════════════════════════════════════════════════════

async function buildWeb(): Promise<void> {
  log("Building web production assets...");
  const bun = process.execPath;
  const proc = Bun.spawn([bun, "run", "build"], {
    cwd: ROOT,
    env: { ...process.env, MARBLE_PWA_ENABLED: "true" },
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error("Web build failed.");
  }
}

function checkWebDist(): string {
  const candidates = [
    join(ROOT, "web", "dist"),
    "/app/web/dist",
  ];
  for (const p of candidates) {
    try {
      if (statSync(p).isDirectory()) return p;
    } catch {
      /* not found */
    }
  }
  throw new Error("Web dist not found after build.");
}

// ═══════════════════════════════════════════════════════════
// Step 7: Generate iOS mobileconfig
// ═══════════════════════════════════════════════════════════

function generateMobileconfig(
  rootCaPath: string,
  appUrl: string,
  _lanIp: string,
  _fingerprint: string,
): string {
  // Convert PEM root CA → DER bytes → base64 for plist <data>
  const pemContent = readFileSync(rootCaPath, "utf-8");
  const b64 = pemContent
    .replace(/-----BEGIN CERTIFICATE-----/, "")
    .replace(/-----END CERTIFICATE-----/, "")
    .replace(/\s/g, "");
  const derBytes = Buffer.from(b64, "base64");
  const derBase64 = derBytes.toString("base64");
  const derWrapped = derBase64.match(/.{1,52}/g)?.join("\n") ?? derBase64;

  // Read icon-180.png if available
  const iconPath = join(ROOT, "web", "public", "icons", "icon-180.png");
  let iconBase64 = "";
  if (existsSync(iconPath)) {
    iconBase64 = readFileSync(iconPath).toString("base64");
  }
  const iconWrapped =
    iconBase64.match(/.{1,52}/g)?.join("\n") ?? iconBase64;

  const uuid = () =>
    randomBytes(16)
      .toString("hex")
      .replace(
        /(.{8})(.{4})(.{4})(.{4})(.{12})/,
        "$1-$2-$3-$4-$5",
      );

  const profileUuid = uuid();
  const certUuid = uuid();
  const clipUuid = uuid();

  // Escape XML special chars in the app URL
  const escapedUrl = appUrl.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>PayloadCertificateFileName</key>
      <string>Marble-Panel-Local-CA.crt</string>
      <key>PayloadContent</key>
      <data>
${derWrapped}
</data>
      <key>PayloadDescription</key>
      <string>Trusts certificates signed by Marble Panel Local CA for LAN HTTPS access.</string>
      <key>PayloadDisplayName</key>
      <string>Marble Panel Local CA</string>
      <key>PayloadIdentifier</key>
      <string>local.marble-panel.ca.${certUuid}</string>
      <key>PayloadType</key>
      <string>com.apple.security.root</string>
      <key>PayloadUUID</key>
      <string>${certUuid}</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
    </dict>
    <dict>
      <key>FullScreen</key>
      <true/>
      <key>Icon</key>
      <data>
${iconWrapped}
</data>
      <key>IsRemovable</key>
      <true/>
      <key>Label</key>
      <string>Marble Panel</string>
      <key>PayloadDescription</key>
      <string>Adds Marble Panel to the Home Screen as a full-screen web app.</string>
      <key>PayloadDisplayName</key>
      <string>Marble Panel Web Clip</string>
      <key>PayloadIdentifier</key>
      <string>local.marble-panel.clip.${clipUuid}</string>
      <key>PayloadType</key>
      <string>com.apple.webClip.managed</string>
      <key>PayloadUUID</key>
      <string>${clipUuid}</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
      <key>Precomposed</key>
      <true/>
      <key>URL</key>
      <string>${escapedUrl}/</string>
    </dict>
  </array>
  <key>PayloadDescription</key>
  <string>Install Marble Panel LAN HTTPS certificate and Home Screen Web Clip.</string>
  <key>PayloadDisplayName</key>
  <string>Marble Panel</string>
  <key>PayloadIdentifier</key>
  <string>local.marble-panel.${profileUuid}</string>
  <key>PayloadOrganization</key>
  <string>Marble Panel</string>
  <key>PayloadRemovalDisallowed</key>
  <false/>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>${profileUuid}</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
</dict>
</plist>`;
}

// ═══════════════════════════════════════════════════════════
// Step 8: Bootstrap HTML page
// ═══════════════════════════════════════════════════════════

function bootstrapHtml(manifest: Manifest): string {
  const t = manifest.token;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Marble Panel — LAN Setup</title>
<style>
  :root { color-scheme: dark; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #000; color: #e0e0e0;
    max-width: 600px; margin: 0 auto; padding: 24px 16px;
    line-height: 1.6;
  }
  h1 { font-size: 1.5rem; margin-bottom: 4px; }
  h2 { font-size: 1.15rem; margin-top: 36px; border-top: 1px solid #333; padding-top: 20px; }
  code {
    background: #1a1a2e; padding: 2px 6px; border-radius: 4px;
    font-size: 0.9em; word-break: break-all; color: #e0e0e0;
  }
  .fp { font-family: monospace; font-size: 0.8rem; color: #777; }
  .warn {
    background: #1a1200; border-left: 3px solid #f90;
    padding: 10px 14px; margin: 18px 0; border-radius: 4px;
    font-size: 0.85rem; color: #ccc;
  }
  a { color: #7eb8ff; }
  ol { padding-left: 20px; }
  li { margin: 10px 0; }
  .badge { display: inline-block; background: #1a1a2e; padding: 4px 10px; border-radius: 12px; font-size: 0.8rem; }
</style>
</head>
<body>

<h1>&#x1f510; Marble Panel LAN Setup</h1>

<p><span class="badge">App</span> <code>${manifest.appUrl}/</code></p>
<p><span class="badge">CA</span> <span class="fp">${manifest.caFingerprint}</span></p>
<p><span class="badge">CA Name</span> <code>${manifest.caSubject}</code></p>

<div class="warn">
  <strong>&#x26a1; Private Network Only</strong><br>
  This page is served over HTTP on your local network. Only the <em>public</em> root CA certificate is available here — no private keys are included.
</div>

<h2>&#x1f4f1; iOS &mdash; Install Certificate &amp; Web Clip</h2>
<ol>
  <li>Open this page in <strong>Safari</strong>.</li>
  <li><a href="/${t}/ios/Marble-Panel.mobileconfig">Download Configuration Profile</a></li>
  <li><strong>Settings &gt; Profile Downloaded</strong> &gt; Tap <strong>Install</strong>.</li>
  <li><strong>Settings &gt; General &gt; About &gt; Certificate Trust Settings</strong>.</li>
  <li>Enable <strong>Full Trust</strong> for the root CA named like:<br><code>${manifest.caSubject}</code></li>
  <li>Return to Home Screen &mdash; <strong>Marble Panel</strong> icon appears.</li>
</ol>

<h2>&#x1f916; Android &mdash; Install Certificate</h2>
<ol>
  <li>Download the CA certificate:<br>
  <a href="/${t}/android/rootCA.crt">rootCA.crt</a>
  &ensp;<span style="color:#666">|</span>&ensp;
  <a href="/${t}/android/rootCA.cer">rootCA.cer</a> (fallback)</li>
  <li>Open <strong>Settings &gt; Security &gt; Install certificate</strong>.<br>
  <span style="color:#888;font-size:0.85rem;">(Wording varies by Android version and vendor.)</span></li>
  <li>Select <strong>CA certificate</strong> and choose the downloaded file.</li>
  <li>Open Chrome and go to: <code>${manifest.appUrl}/</code></li>
  <li>Use <strong>Chrome &gt; Add to Home Screen</strong> for PWA install.</li>
</ol>

<h2>&#x1f5a5; Desktop</h2>
<ol>
  <li>Download: <a href="/${t}/ca/rootCA.pem">rootCA.pem</a></li>
  <li>Install in your system trust store.</li>
  <li>Open <code>${manifest.appUrl}/</code></li>
</ol>

<p style="margin-top: 48px; color: #444; font-size: 0.78em;">
  Marble Panel LAN HTTPS Bootstrap &middot; Temporary Session
</p>

</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════
// Step 9: Start HTTPS app server
// ═══════════════════════════════════════════════════════════

function startHttpsServer(
  certPath: string,
  keyPath: string,
  _webDist: string,
): ReturnType<typeof Bun.spawn> {
  return spawnBg("bun", ["src/index.ts"], {
    cwd: join(ROOT, "server"),
    env: {
      PORT: String(HTTPS_PORT),
      HOST: "0.0.0.0",
      TLS_CERT_FILE: certPath,
      TLS_KEY_FILE: keyPath,
    },
  });
}

// ═══════════════════════════════════════════════════════════
// Step 10: Start HTTP bootstrap server
// ═══════════════════════════════════════════════════════════

function startBootstrapServer(manifest: Manifest): {
  server: ReturnType<typeof Bun.serve>;
  url: string;
} {
  const token = manifest.token;

  // Pre-load static assets
  const html = bootstrapHtml(manifest);
  const profileBuf = readFileSync(join(DATA_DIR, "Marble-Panel.mobileconfig"));
  const rootCaPem = readFileSync(join(DATA_DIR, "rootCA.pem"));
  const rootCaCrt = readFileSync(join(DATA_DIR, "rootCA.crt"));
  let rootCaCer: Buffer | null = null;
  try {
    rootCaCer = readFileSync(join(DATA_DIR, "rootCA.cer"));
  } catch {
    // DER conversion may have failed
  }

  const server = Bun.serve({
    port: BOOTSTRAP_PORT,
    hostname: "0.0.0.0",
    fetch(req) {
      const url = new URL(req.url);
      const pathname = url.pathname;

      // GET /<token>/ or /<token>
      if (pathname === `/${token}/` || pathname === `/${token}`) {
        return new Response(html, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      }

      // GET /<token>/ios/Marble-Panel.mobileconfig
      if (pathname === `/${token}/ios/Marble-Panel.mobileconfig`) {
        return new Response(profileBuf, {
          headers: {
            "Content-Type": "application/x-apple-aspen-config",
            "Content-Disposition":
              'attachment; filename="Marble-Panel.mobileconfig"',
            "Cache-Control": "no-store",
          },
        });
      }

      // GET /<token>/android/rootCA.crt
      if (pathname === `/${token}/android/rootCA.crt`) {
        return new Response(rootCaCrt, {
          headers: {
            "Content-Type": "application/x-x509-ca-cert",
            "Content-Disposition":
              'attachment; filename="Marble-Panel-Local-CA.crt"',
            "Cache-Control": "no-store",
          },
        });
      }

      // GET /<token>/android/rootCA.cer
      if (pathname === `/${token}/android/rootCA.cer`) {
        if (!rootCaCer) return new Response("Not Found", { status: 404 });
        return new Response(rootCaCer, {
          headers: {
            "Content-Type": "application/x-x509-ca-cert",
            "Content-Disposition":
              'attachment; filename="Marble-Panel-Local-CA.cer"',
            "Cache-Control": "no-store",
          },
        });
      }

      // GET /<token>/ca/rootCA.pem
      if (pathname === `/${token}/ca/rootCA.pem`) {
        return new Response(rootCaPem, {
          headers: {
            "Content-Type": "application/x-pem-file",
            "Content-Disposition":
              'attachment; filename="Marble-Panel-Local-CA.pem"',
            "Cache-Control": "no-store",
          },
        });
      }

      // GET /<token>/status
      if (pathname === `/${token}/status`) {
        return Response.json({
          appUrl: manifest.appUrl,
          appUrlIp: manifest.appUrlIp,
          caFingerprint: manifest.caFingerprint,
          generatedAt: manifest.generatedAt,
        });
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  const url = manifest.lanIp !== "127.0.0.1"
    ? `http://${manifest.lanIp}:${BOOTSTRAP_PORT}/${token}/`
    : `http://localhost:${BOOTSTRAP_PORT}/${token}/`;

  return { server, url };
}

// ═══════════════════════════════════════════════════════════
// TUI
// ═══════════════════════════════════════════════════════════

async function renderTui(manifest: Manifest): Promise<void> {
  // Dynamic import for QR code generation
  const QRCode = await import("qrcode");

  const iosUrl = `http://${manifest.lanIp}:${BOOTSTRAP_PORT}/${manifest.token}/ios/Marble-Panel.mobileconfig`;
  const androidUrl = `http://${manifest.lanIp}:${BOOTSTRAP_PORT}/${manifest.token}/android/rootCA.crt`;
  const appUrlQr = manifest.appUrlIp + "/";

  const iosQr = await QRCode.toString(iosUrl, {
    type: "terminal",
    small: true,
  });
  const androidQr = await QRCode.toString(androidUrl, {
    type: "terminal",
    small: true,
  });
  const appQr = await QRCode.toString(appUrlQr, {
    type: "terminal",
    small: true,
  });

  console.clear();

  const out: string[] = [];

  out.push("");
  out.push("  \x1b[1;36m╔══════════════════════════════════════════════════════════╗");
  out.push("  ║            Marble Panel LAN HTTPS                        ║");
  out.push("  ╚══════════════════════════════════════════════════════════╝\x1b[0m");
  out.push("");
  out.push(`  \x1b[1mApp URL\x1b[0m       ${manifest.appUrl}/`);
  out.push(`  \x1b[1mApp URL (IP)\x1b[0m   ${manifest.appUrlIp}/`);
  out.push(`  \x1b[1mBootstrap\x1b[0m     ${manifest.bootstrapUrl}`);
  out.push(`  \x1b[1mCA SHA256\x1b[0m     \x1b[2m${manifest.caFingerprint}\x1b[0m`);
  out.push(`  \x1b[1mCA Name\x1b[0m       \x1b[2m${manifest.caSubject}\x1b[0m`);
  out.push("");
  out.push("  \x1b[1m── Services ──────────────────────────────────────────\x1b[0m");
  out.push("  Web build       \x1b[32mready\x1b[0m");
  out.push("  HTTPS app       \x1b[32mrunning\x1b[0m");
  out.push("  Bootstrap       \x1b[32mrunning\x1b[0m");
  out.push("  mkcert CA       \x1b[32mfound\x1b[0m");
  out.push("");

  // iOS Section
  out.push("  \x1b[1;37m── iOS — cert + Web Clip ─────────────────────────────\x1b[0m");
  out.push("");
  for (const line of iosQr.split("\n")) {
    out.push(`  ${line}`);
  }
  out.push("");
  out.push("  \x1b[2m1.\x1b[0m Use \x1b[1mSafari\x1b[0m to scan this QR.");
  out.push("  \x1b[2m2.\x1b[0m Download the Marble Panel profile.");
  out.push("  \x1b[2m3.\x1b[0m Settings > Profile Downloaded > Install.");
  out.push("  \x1b[2m4.\x1b[0m Settings > General > About > Certificate Trust Settings.");
  out.push("  \x1b[2m5.\x1b[0m Enable Full Trust for the listed mkcert root CA.");
  out.push("  \x1b[2m6.\x1b[0m Open Marble Panel from Home Screen.");
  out.push("");

  // Android Section
  out.push("  \x1b[1;37m── Android — cert only ───────────────────────────────\x1b[0m");
  out.push("");
  for (const line of androidQr.split("\n")) {
    out.push(`  ${line}`);
  }
  out.push("");
  out.push("  \x1b[2m1.\x1b[0m Scan this QR to download the CA certificate.");
  out.push("  \x1b[2m2.\x1b[0m Install it as a CA certificate in Android settings.");
  out.push("  \x1b[2m3.\x1b[0m Open the HTTPS App URL in Chrome.");
  out.push("  \x1b[2m4.\x1b[0m Use Chrome Install / Add to Home Screen for PWA.");
  out.push("");

  // App QR
  out.push("  \x1b[1;37m── App QR ────────────────────────────────────────────\x1b[0m");
  out.push("");
  for (const line of appQr.split("\n")) {
    out.push(`  ${line}`);
  }
  out.push("");

  // Controls
  out.push(
    "  \x1b[2m───────────────────────────────────────────────────────\x1b[0m",
  );
  out.push(
    "  \x1b[2m[r]\x1b[0m refresh  \x1b[2m[o]\x1b[0m URLs  \x1b[2m[c]\x1b[0m fingerprint  \x1b[2m[s]\x1b[0m stop bootstrap  \x1b[2m[q]\x1b[0m quit",
  );
  out.push("");

  console.log(out.join("\n"));
}

// ═══════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════

async function main() {
  console.log("");
  log("Marble Panel LAN HTTPS Installer starting...");
  console.log("");

  // 1. Check mkcert
  log("Checking mkcert...");
  const { caroot } = await checkMkcert();
  await ensureMkcertInstalled(caroot);

  // 2. Detect network
  const lanIp = detectLanIp();
  const hostname = await getHostname();

  if (!lanIp) {
    warn("No LAN IP detected! Mobile install will not work.");
    warn("Falling back to localhost-only mode.");
  } else {
    log(`LAN IP: ${lanIp}`);
  }
  log(`Hostname: ${hostname}`);

  // 3. Build cert SAN list
  const altNames = ["marble-panel.local", "localhost", "127.0.0.1"];
  const localHostname = toLocalHostname(hostname);
  if (localHostname && localHostname !== "marble-panel.local") {
    altNames.push(localHostname);
  }
  if (lanIp) {
    altNames.push(lanIp);
  }

  // 4. Generate certs
  const { certPath, keyPath } = await generateLeafCert(caroot, altNames);

  // 5. Copy root CA
  const { rootCaPath, fingerprint, subject } = copyRootCa(caroot);

  // 6. Build web
  await buildWeb();
  checkWebDist();

  // 7. Determine URLs
  const appHost = "marble-panel.local";
  const appUrl = `https://${appHost}:${HTTPS_PORT}`;
  const appUrlIp = lanIp
    ? `https://${lanIp}:${HTTPS_PORT}`
    : `https://localhost:${HTTPS_PORT}`;

  // 8. Generate token
  const token = generateToken();

  const manifest: Manifest = {
    generatedAt: new Date().toISOString(),
    lanIp: lanIp ?? "127.0.0.1",
    hostname,
    altNames,
    appUrl,
    appUrlIp,
    bootstrapUrl: lanIp
      ? `http://${lanIp}:${BOOTSTRAP_PORT}/${token}/`
      : `http://localhost:${BOOTSTRAP_PORT}/${token}/`,
    caFingerprint: fingerprint,
    caSubject: subject,
    certPath,
    keyPath,
    rootCaPath,
    profilePath: join(DATA_DIR, "Marble-Panel.mobileconfig"),
    token,
  };

  // 9. Generate iOS mobileconfig
  log("Generating iOS mobileconfig...");
  const mobileconfig = generateMobileconfig(
    rootCaPath,
    appUrlIp,
    lanIp ?? "127.0.0.1",
    fingerprint,
  );
  writeFileSync(join(DATA_DIR, "Marble-Panel.mobileconfig"), mobileconfig);
  log("mobileconfig written.");

  // 10. Write manifest
  writeFileSync(
    join(DATA_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  log("manifest.json written.");

  // 11. Start HTTPS app server
  log("Starting HTTPS app server...");
  const appProc = startHttpsServer(certPath, keyPath, checkWebDist());

  // Wait briefly for server startup
  const appExit = await Promise.race([
    appProc.exited,
    Bun.sleep(1500).then(() => null),
  ]);
  if (appExit !== null) {
    throw new Error(`HTTPS app server exited during startup with code ${appExit}. Is port ${HTTPS_PORT} in use?`);
  }

  // 12. Start bootstrap server
  log("Starting HTTP bootstrap server...");
  const { server: bootstrapServer } = startBootstrapServer(manifest);
  log(`Bootstrap URL: ${manifest.bootstrapUrl}`);

  // 13. Render TUI
  await renderTui(manifest);

  // 14. Keyboard handling
  setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  let bootstrapRunning = true;

  const handleKey = async (key: string) => {
    // Ctrl-C or q = quit
    if (key === "\x03" || key === "q") {
      log("Shutting down all services...");
      if (bootstrapRunning) {
        bootstrapServer.stop();
        bootstrapRunning = false;
      }
      appProc.kill("SIGTERM");
      // Give a moment for cleanup
      await Bun.sleep(200);
      setRawMode(false);
      process.exit(0);
    }

    // r = refresh TUI
    if (key === "r") {
      await renderTui(manifest);
    }

    // o = print URLs
    if (key === "o") {
      console.log("");
      console.log(`  \x1b[1mApp URL:\x1b[0m        ${manifest.appUrl}/`);
      console.log(`  \x1b[1mApp URL (IP):\x1b[0m    ${manifest.appUrlIp}/`);
      console.log(`  \x1b[1mBootstrap URL:\x1b[0m   ${manifest.bootstrapUrl}`);
      console.log("");
    }

    // c = show fingerprint
    if (key === "c") {
      console.log("");
      console.log(`  \x1b[1mCA SHA256 Fingerprint:\x1b[0m`);
      console.log(`  ${manifest.caFingerprint}`);
      console.log("");
    }

    // s = stop bootstrap
    if (key === "s") {
      if (bootstrapRunning) {
        bootstrapServer.stop();
        bootstrapRunning = false;
        log("Bootstrap server stopped. HTTPS app still running.");
      } else {
        log("Bootstrap server already stopped.");
      }
    }
  };

  process.stdin.on("data", (data: string) => {
    handleKey(data);
  });

  // Cleanup on signals
  const cleanup = () => {
    try {
      if (bootstrapRunning) bootstrapServer.stop();
    } catch {
      /* ignore */
    }
    try {
      appProc.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  };

  process.on("SIGINT", () => {
    setRawMode(false);
    cleanup();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    setRawMode(false);
    cleanup();
    process.exit(0);
  });

  // Keep alive
  await new Promise(() => {});
}

main().catch((err) => {
  console.error(`\n\x1b[31mFatal error:\x1b[0m ${err instanceof Error ? err.message : err}`);
  setRawMode(false);
  process.exit(1);
});
