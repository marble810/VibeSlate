/**
 * Shared LAN TLS utilities — used by both lan-https.ts and docker-init.ts.
 *
 * Extracted from scripts/lan-https.ts so Docker LAN mode can reuse
 * mkcert-based certificate generation without duplicating logic.
 */

import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { networkInterfaces } from "node:os";

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

export async function sh(
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

export function log(prefix: string, msg: string) {
  console.log(`\x1b[36m[${prefix}]\x1b[0m ${msg}`);
}

export function warn(prefix: string, msg: string) {
  console.log(`\x1b[33m[${prefix}]\x1b[0m ${msg}`);
}

// ═══════════════════════════════════════════════════════════
// mkcert
// ═══════════════════════════════════════════════════════════

export async function checkMkcert(): Promise<{ caroot: string }> {
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
  return { caroot: result.stdout };
}

export async function ensureMkcertInstalled(
  caroot: string,
  prefix: string,
): Promise<void> {
  const rootCaPath = join(caroot, "rootCA.pem");
  if (!existsSync(rootCaPath)) {
    log(prefix, "Installing mkcert local CA (may require sudo)...");
    const install = await sh("mkcert", ["-install"]);
    if (install.exitCode !== 0) {
      warn(prefix, `mkcert -install had issues: ${install.stderr}`);
      log(prefix, "Attempting to continue — cert generation may still work.");
    }
  }
}

// ═══════════════════════════════════════════════════════════
// Network
// ═══════════════════════════════════════════════════════════

export function detectLanIp(): string | null {
  const interfaces = networkInterfaces();
  const preferred = [/^en\d+$/, /^eth\d*$/, /^wlan\d*$/];

  for (const pattern of preferred) {
    for (const [name, addrs] of Object.entries(interfaces)) {
      if (!addrs || !pattern.test(name)) continue;
      for (const addr of addrs) {
        if (!addr.internal && addr.family === "IPv4") return addr.address;
      }
    }
  }

  for (const [, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (!addr.internal && addr.family === "IPv4") return addr.address;
    }
  }
  return null;
}

export async function getHostname(): Promise<string> {
  const result = await sh("hostname", []);
  return result.exitCode === 0 && result.stdout ? result.stdout : "marble-panel";
}

export function toLocalHostname(hostname: string): string | null {
  const trimmed = hostname.trim().replace(/\.$/, "");
  const base = trimmed.replace(/(\.local)+$/i, "");
  if (!base || base === "localhost") return null;
  return `${base}.local`;
}

// ═══════════════════════════════════════════════════════════
// Certificate generation
// ═══════════════════════════════════════════════════════════

export async function certCoversAltNames(
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

export async function generateLeafCert(
  caroot: string,
  altNames: string[],
  dataDir: string,
  prefix: string,
): Promise<{ certPath: string; keyPath: string }> {
  mkdirSync(dataDir, { recursive: true });
  const certPath = join(dataDir, "app-cert.pem");
  const keyPath = join(dataDir, "app-key.pem");

  if (existsSync(certPath) && existsSync(keyPath)) {
    const verify = await sh("openssl", [
      "x509",
      "-in",
      certPath,
      "-noout",
      "-checkend",
      "86400",
    ]);
    const covers = await certCoversAltNames(certPath, altNames);
    if (verify.exitCode === 0 && covers) {
      log(prefix, "Existing leaf cert still valid — reusing.");
      return { certPath, keyPath };
    }
    if (verify.exitCode !== 0) {
      log(prefix, "Leaf cert expired or near expiry — regenerating.");
    } else {
      log(prefix, "Leaf cert SAN no longer matches — regenerating.");
    }
  }

  log(prefix, `Generating leaf cert for: ${altNames.join(" ")}`);
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
  log(prefix, "Leaf cert generated successfully.");
  return { certPath, keyPath };
}

export function copyRootCa(
  caroot: string,
  destDir: string,
  prefix: string,
): { rootCaPath: string; fingerprint: string; subject: string } {
  const srcPem = join(caroot, "rootCA.pem");
  if (!existsSync(srcPem)) {
    throw new Error(
      `Root CA not found at ${srcPem}. Run "mkcert -install" first.`,
    );
  }

  mkdirSync(destDir, { recursive: true });
  const destPem = join(destDir, "rootCA.pem");
  const destCrt = join(destDir, "rootCA.crt");
  const destCer = join(destDir, "rootCA.cer");

  const pemBytes = readFileSync(srcPem);
  writeFileSync(destPem, pemBytes);
  writeFileSync(destCrt, pemBytes);

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
    warn(prefix, "Failed to generate DER cert for Android fallback.");
  }

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
  const subject = new TextDecoder()
    .decode(subjectResult.stdout)
    .replace(/^subject=\s*/, "");

  log(prefix, `Root CA SHA256: ${fingerprint}`);
  return { rootCaPath: destPem, fingerprint, subject };
}

// ═══════════════════════════════════════════════════════════
// iOS mobileconfig
// ═══════════════════════════════════════════════════════════

export function generateMobileconfig(
  rootCaPath: string,
  appUrl: string,
  _lanIp: string,
  _fingerprint: string,
  iconPath?: string,
): string {
  const pemContent = readFileSync(rootCaPath, "utf-8");
  const b64 = pemContent
    .replace(/-----BEGIN CERTIFICATE-----/, "")
    .replace(/-----END CERTIFICATE-----/, "")
    .replace(/\s/g, "");
  const derBytes = Buffer.from(b64, "base64");
  const derBase64 = derBytes.toString("base64");
  const derWrapped = derBase64.match(/.{1,52}/g)?.join("\n") ?? derBase64;

  let iconBase64 = "";
  if (iconPath && existsSync(iconPath)) {
    iconBase64 = readFileSync(iconPath).toString("base64");
  }
  const iconWrapped =
    iconBase64.match(/.{1,52}/g)?.join("\n") ?? iconBase64;

  const randomBytes = (n: number) => {
    const buf = new Uint8Array(n);
    for (let i = 0; i < n; i++) buf[i] = Math.floor(Math.random() * 256);
    return buf;
  };

  const uuid = () =>
    Buffer.from(randomBytes(16))
      .toString("hex")
      .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");

  const profileUuid = uuid();
  const certUuid = uuid();
  const clipUuid = uuid();

  const escapedUrl = appUrl
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

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
