/**
 * VibeSlate — LAN Certificate Setup Page
 *
 * Serves a single page at /lan-setup:
 *   - Download root CA certificate
 *   - Platform-specific install instructions
 *   - QR code linking to this page
 *
 * No mobileconfig, no web clips — single universal page.
 */

import { existsSync, readFileSync } from "node:fs";

const CERT_DIR = "/app/data/certs";
const ROOT_CA_PEM = `${CERT_DIR}/rootCA.pem`;

const PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>VibeSlate — Certificate Setup</title>
<style>
  :root { color-scheme: dark; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #0d0d0d; color: #d4d4d4;
    max-width: 520px; margin: 0 auto; padding: 32px 20px;
    line-height: 1.65;
  }
  h1 { font-size: 1.35rem; margin: 0 0 24px; }
  .card {
    background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 10px;
    padding: 20px 24px; margin: 16px 0;
  }
  .step { color: #888; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 6px; }
  a.btn {
    display: inline-block; background: #3b3bff; color: #fff; text-decoration: none;
    padding: 10px 22px; border-radius: 8px; font-weight: 600; font-size: 0.95rem;
    margin: 8px 0;
  }
  a.btn:hover { background: #4f4fff; }
  .qr { margin: 16px 0; text-align: center; }
  .qr svg { max-width: 200px; height: auto; }
  .platform { margin: 10px 0; padding-left: 18px; }
  .platform li { margin: 6px 0; font-size: 0.9rem; }
  code {
    background: #252525; padding: 1px 6px; border-radius: 4px;
    font-size: 0.88em; color: #ccc;
  }
  .url { color: #7eb8ff; word-break: break-all; }
  hr { border: none; border-top: 1px solid #2a2a2a; margin: 24px 0; }
  .footer { font-size: 0.75rem; color: #555; margin-top: 40px; }
</style>
</head>
<body>

<h1>🔐 VibeSlate — Certificate Setup</h1>

<div class="card">
  <div class="step">Step 1</div>
  <strong>Download the CA certificate</strong>
  <p style="margin:6px 0;color:#888;">This certificate signs the HTTPS connection to VibeSlate on your LAN.</p>
  <a class="btn" href="/lan-setup/download">Download rootCA.pem</a>
  <div class="qr">{{QR_SVG}}</div>
</div>

<div class="card">
  <div class="step">Step 2</div>
  <strong>Install on your device</strong>
  <ul class="platform" style="list-style:none;">
    <li><strong>iOS</strong> — Tap Download above &rarr; <strong>Allow</strong> &rarr;
      Settings &rarr; <strong>Profile Downloaded</strong> &rarr; <strong>Install</strong> &rarr;
      Settings &rarr; General &rarr; About &rarr; <strong>Certificate Trust Settings</strong> &rarr; Enable</li>
    <li><strong>Android</strong> — Settings &rarr; Security &rarr; <strong>Install certificate</strong> &rarr;
      CA certificate &rarr; select downloaded file</li>
    <li><strong>macOS</strong> — Double-click <code>rootCA.pem</code> &rarr; Keychain Access &rarr;
      add to <strong>System</strong> &rarr; Get Info &rarr; <strong>Always Trust</strong></li>
    <li><strong>Windows</strong> — Double-click &rarr; <strong>Install Certificate</strong> &rarr;
      Local Machine &rarr; <strong>Trusted Root Certification Authorities</strong></li>
    <li><strong>Linux</strong> — <code>sudo cp rootCA.pem /usr/local/share/ca-certificates/ &amp;&amp; sudo update-ca-certificates</code></li>
  </ul>
</div>

<div class="card">
  <div class="step">Step 3</div>
  <strong>Open VibeSlate</strong>
  <p><span class="url">{{APP_URL}}</span></p>
</div>

<hr>

<div class="footer">
  VibeSlate &middot; This CA is private to your LAN — only trusted devices can verify the connection.
</div>

</body>
</html>`;

/**
 * Generate the /lan-setup page HTML with embedded QR code.
 */
async function renderSetupPage(): Promise<string> {
  let qrSvg = "";
  try {
    const QRCode = await import("qrcode");
    const lanIp = detectLanIp();
    const setupUrl = `http://${lanIp}:12001/lan-setup`;
    qrSvg = await QRCode.toString(setupUrl, { type: "svg", width: 200 });
  } catch {
    qrSvg = '<p style="color:#666;">(QR unavailable)</p>';
  }

  const lanIp = detectLanIp();
  const appUrl = lanIp
    ? `https://${lanIp}:12001`
    : "https://<vibeslate-ip>:12001";

  return PAGE_HTML
    .replace("{{QR_SVG}}", qrSvg)
    .replace("{{APP_URL}}", appUrl);
}

function detectLanIp(): string {
  try {
    const { networkInterfaces } = require("node:os") as typeof import("node:os");
    const ifaces = networkInterfaces();

    for (const [, addrs] of Object.entries(ifaces)) {
      if (!addrs) continue;
      for (const addr of addrs) {
        if (
          !addr.internal &&
          addr.family === "IPv4" &&
          !addr.address.startsWith("172.")
        ) {
          if (
            addr.address.startsWith("192.168.") ||
            addr.address.startsWith("10.")
          ) {
            return addr.address;
          }
        }
      }
    }

    for (const [, addrs] of Object.entries(ifaces)) {
      if (!addrs) continue;
      for (const addr of addrs) {
        if (!addr.internal && addr.family === "IPv4") return addr.address;
      }
    }
  } catch {
    // os.networkInterfaces may not be available
  }

  return "localhost";
}

/**
 * Handle a request to /lan-setup or /lan-setup/download.
 *
 * Returns a Response, or null to let the caller fall through.
 */
export async function handleLanSetup(req: Request): Promise<Response | null> {
  const url = new URL(req.url);

  // GET /lan-setup/download — serve root CA file
  if (url.pathname === "/lan-setup/download") {
    if (!existsSync(ROOT_CA_PEM)) {
      return new Response("No CA certificate configured. Run setup first.", {
        status: 404,
      });
    }

    const pemBytes = readFileSync(ROOT_CA_PEM);
    const ua = (req.headers.get("user-agent") || "").toLowerCase();

    let filename = "VibeSlate-Local-CA.pem";
    let contentType = "application/x-pem-file";

    if (ua.includes("iphone") || ua.includes("ipad")) {
      filename = "VibeSlate-Local-CA.crt";
      contentType = "application/x-x509-ca-cert";
    } else if (ua.includes("android")) {
      filename = "VibeSlate-Local-CA.cer";
      contentType = "application/x-x509-ca-cert";
    }

    return new Response(pemBytes, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // GET /lan-setup — render setup page
  if (url.pathname === "/lan-setup") {
    const html = await renderSetupPage();
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  return null;
}
