/**
 * Marble Panel — Docker Init
 *
 * One-time setup that asks LAN/Public mode and generates
 * Docker runtime configuration under data/docker/.
 *
 * Usage:
 *   bun run docker:init
 */

import { join } from "node:path";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import {
  checkMkcert,
  ensureMkcertInstalled,
  detectLanIp,
  getHostname,
  toLocalHostname,
  generateLeafCert,
  copyRootCa,
  generateMobileconfig,
  sh,
  log,
  warn,
} from "./lib/lan-tls.ts";

const PREFIX = "docker-init";
const ROOT = join(import.meta.dirname, "..");
const DOCKER_DATA = join(ROOT, "data", "docker");
const CERTS_DIR = join(DOCKER_DATA, "certs");

// ═══════════════════════════════════════════════════════════
// Shared helpers
// ═══════════════════════════════════════════════════════════

function printBanner() {
  console.log("");
  console.log("  \x1b[1;36m╔══════════════════════════════════════════════════════╗");
  console.log("  ║       Marble Panel — Docker Deployment Init          ║");
  console.log("  ╚══════════════════════════════════════════════════════╝\x1b[0m");
  console.log("");
}

function printSection(title: string) {
  console.log(`\n  \x1b[1m${title}\x1b[0m`);
  console.log("  " + "─".repeat(50));
}

async function ask(rl: ReturnType<typeof createInterface>, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(`  ${prompt}`, (answer: string) => resolve(answer.trim()));
  });
}

async function askWithDefault(
  rl: ReturnType<typeof createInterface>,
  prompt: string,
  defaultVal: string,
): Promise<string> {
  return new Promise((resolve) => {
    rl.question(`  ${prompt} [${defaultVal}]: `, (answer: string) => {
      resolve(answer.trim() || defaultVal);
    });
  });
}

async function confirm(
  rl: ReturnType<typeof createInterface>,
  prompt: string,
  defaultYes = true,
): Promise<boolean> {
  const suffix = defaultYes ? "Y/n" : "y/N";
  const answer = await askWithDefault(rl, `${prompt} (${suffix})`, defaultYes ? "y" : "n");
  return answer.toLowerCase().startsWith("y");
}

function checkDockerAvailable(): boolean {
  const result = Bun.spawnSync(["docker", "--version"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return result.exitCode === 0;
}

function checkComposeAvailable(): boolean {
  // Try "docker compose" (v2) first, then "docker-compose" (v1)
  const v2 = Bun.spawnSync(["docker", "compose", "version"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (v2.exitCode === 0) return true;
  const v1 = Bun.spawnSync(["docker-compose", "--version"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return v1.exitCode === 0;
}

// ═══════════════════════════════════════════════════════════
// LAN mode
// ═══════════════════════════════════════════════════════════

async function initLanMode(rl: ReturnType<typeof createInterface>) {
  printSection("LAN Mode Setup");

  // 1. Check mkcert
  log(PREFIX, "Checking mkcert...");
  const { caroot } = await checkMkcert();
  await ensureMkcertInstalled(caroot, PREFIX);

  // 2. Detect network
  const lanIp = detectLanIp();
  const hostname = await getHostname();
  if (!lanIp) {
    warn(PREFIX, "No LAN IP detected! Falling back to localhost-only.");
  } else {
    log(PREFIX, `LAN IP: ${lanIp}`);
  }
  log(PREFIX, `Hostname: ${hostname}`);

  // 3. Build SAN list
  const altNames = ["marble-panel.local", "localhost", "127.0.0.1"];
  const localHostname = toLocalHostname(hostname);
  if (localHostname && localHostname !== "marble-panel.local") {
    altNames.push(localHostname);
  }
  if (lanIp) altNames.push(lanIp);

  // 4. Generate certs
  const { certPath, keyPath } = await generateLeafCert(caroot, altNames, CERTS_DIR, PREFIX);

  // 5. Copy root CA
  const { rootCaPath, fingerprint, subject } = copyRootCa(caroot, CERTS_DIR, PREFIX);

  // 6. Generate mobileconfig
  const appUrl = `https://${localHostname || "marble-panel.local"}:12001`;
  const appUrlIp = lanIp ? `https://${lanIp}:12001` : `https://localhost:12001`;
  const iconPath = join(ROOT, "web", "public", "icons", "icon-180.png");
  const mobileconfig = generateMobileconfig(rootCaPath, appUrlIp, lanIp ?? "127.0.0.1", fingerprint, iconPath);
  writeFileSync(join(CERTS_DIR, "Marble-Panel.mobileconfig"), mobileconfig);

  // 7. Ask about password protection (optional for LAN)
  const enableAuth = await confirm(rl, "Enable password protection?", false);
  let passwordHash = "";
  if (enableAuth) {
    const pwd = await ask(rl, "Enter password: ");
    if (pwd) {
      passwordHash = await Bun.password.hash(pwd);
      log(PREFIX, "Password hash generated.");
    } else {
      warn(PREFIX, "Empty password — auth will be enabled but login will fail.");
    }
  }

  // 8. Generate server config for Docker
  const serverConfig = {
    deepseek_token: process.env.DEEPSEEK_PLATFORM_TOKEN || "",
    query_interval_seconds: 60,
    openai_refresh_token: process.env.OPENAI_REFRESH_TOKEN || "",
    openai_account_id: process.env.OPENAI_ACCOUNT_ID || "",
    opencode_workspace_id: "",
    opencode_auth_cookie: "",
    ui: { custom_accent: "#8b5cf6" },
    auth: {
      enabled: enableAuth,
      password_hash: passwordHash,
      session_ttl_seconds: 604800,
      cookie_name: "marble_session",
      cookie_secure: true,
    },
    public: {
      mode: "lan",
      trusted_proxies: [] as string[],
    },
    hidden_entry: {
      enabled: false,
      path: "",
      root_response: "404",
    },
  };

  mkdirSync(DOCKER_DATA, { recursive: true });
  writeFileSync(join(DOCKER_DATA, "server.config.json"), JSON.stringify(serverConfig, null, 2));

  // 9. Generate .env for compose
  const envLines = [
    "# Marble Panel — Docker LAN Mode",
    `# Generated: ${new Date().toISOString()}`,
    `MARBLE_DOCKER_MODE=lan`,
    `MARBLE_AUTH_ENABLED=${enableAuth}`,
    `TLS_CERT_FILE=/app/data/certs/app-cert.pem`,
    `TLS_KEY_FILE=/app/data/certs/app-key.pem`,
    `MARBLE_APP_PORT=12001`,
    `MARBLE_CONFIG_FILE=/app/data/server.config.json`,
    "",
  ];
  writeFileSync(join(DOCKER_DATA, ".env"), envLines.join("\n"));

  // 10. Write mode marker
  writeFileSync(join(DOCKER_DATA, "mode"), "lan");

  // 11. Print summary
  log(PREFIX, "LAN mode configuration generated.");
  console.log("");
  console.log(`  \x1b[1mConfiguration:\x1b[0m`);
  console.log(`    Mode:      \x1b[32mLAN\x1b[0m`);
  console.log(`    App URL:   ${appUrl}/`);
  if (lanIp) console.log(`    App IP:    ${appUrlIp}/`);
  console.log(`    Auth:      ${enableAuth ? "\x1b[32menabled\x1b[0m" : "\x1b[2mdisabled\x1b[0m"}`);
  console.log(`    Cert dir:  ${CERTS_DIR}`);
  console.log(`    Config:    ${join(DOCKER_DATA, "server.config.json")}`);
  console.log(`    CA FP:     \x1b[2m${fingerprint}\x1b[0m`);

  return { mode: "lan" as const, appUrl, appUrlIp, fingerprint, certPath, keyPath, rootCaPath, lanIp };
}

// ═══════════════════════════════════════════════════════════
// Public mode
// ═══════════════════════════════════════════════════════════

async function initPublicMode(rl: ReturnType<typeof createInterface>) {
  printSection("Public Mode Setup");

  // 1. Domain name
  const domain = await ask(rl, "Public domain name (e.g., panel.example.com): ");
  if (!domain) {
    console.log("\n  \x1b[31mError: domain name is required for Public mode.\x1b[0m");
    process.exit(1);
  }

  // 2. Password (required for Public mode)
  console.log("");
  log(PREFIX, "Password protection is \x1b[1mrequired\x1b[0m for Public mode.");
  const pwd = await ask(rl, "Enter password (min 8 characters): ");
  if (!pwd || pwd.length < 8) {
    console.log("\n  \x1b[31mError: password must be at least 8 characters for Public mode.\x1b[0m");
    process.exit(1);
  }
  const passwordHash = await Bun.password.hash(pwd);
  log(PREFIX, "Password hash generated.");

  // 3. Hidden entry (optional)
  const enableHiddenEntry = await confirm(rl, "Enable hidden entry gate (optional discovery-reduction layer)?", false);
  let hiddenPath = "";
  let hiddenEnabled = false;
  if (enableHiddenEntry) {
    hiddenPath = await askWithDefault(rl, "Hidden path", "marble");
    hiddenPath = hiddenPath.replace(/^\/+/, "").replace(/\/+$/, "");
    if (hiddenPath) {
      hiddenEnabled = true;
      log(PREFIX, `Hidden entry enabled at path: /${hiddenPath}/`);
    }
  }

  // 4. Generate Caddyfile
  const caddyfile = `# Caddy reverse proxy for Marble Panel — ${domain}
# Auto-generated by docker:init — Public Mode
# Date: ${new Date().toISOString()}

{
    admin off
    log {
        output stdout
        format json
    }
}

${domain} {
    header {
        -Server
    }

    reverse_proxy app:12001 {
        header_up X-Forwarded-For {client_ip}
        header_up X-Real-IP {client_ip}
        header_up X-Forwarded-Proto {scheme}
        header_up X-Forwarded-Host {host}
        flush_interval -1
        header_up Connection {>Connection}
        header_up Upgrade {>Upgrade}
    }

    log {
        output file /var/log/caddy/marble-panel-access.log
        format json
    }
}

${domain}:80 {
    redir https://{host}{uri} permanent
}
`;

  const caddyDir = join(DOCKER_DATA, "caddy");
  mkdirSync(caddyDir, { recursive: true });
  writeFileSync(join(caddyDir, "Caddyfile"), caddyfile);

  // 5. Generate server config for Docker
  const serverConfig = {
    deepseek_token: process.env.DEEPSEEK_PLATFORM_TOKEN || "",
    query_interval_seconds: 60,
    openai_refresh_token: process.env.OPENAI_REFRESH_TOKEN || "",
    openai_account_id: process.env.OPENAI_ACCOUNT_ID || "",
    opencode_workspace_id: "",
    opencode_auth_cookie: "",
    ui: { custom_accent: "#8b5cf6" },
    auth: {
      enabled: true,
      password_hash: passwordHash,
      session_ttl_seconds: 604800,
      cookie_name: "marble_session",
      cookie_secure: true,
    },
    public: {
      mode: "public",
      trusted_proxies: ["172.16.0.0/12", "10.0.0.0/8", "192.168.0.0/16"],
    },
    hidden_entry: {
      enabled: hiddenEnabled,
      path: hiddenPath,
      root_response: "404",
    },
  };

  mkdirSync(DOCKER_DATA, { recursive: true });
  writeFileSync(join(DOCKER_DATA, "server.config.json"), JSON.stringify(serverConfig, null, 2));

  // 6. Generate .env for compose
  const envLines = [
    "# Marble Panel — Docker Public Mode",
    `# Generated: ${new Date().toISOString()}`,
    `MARBLE_DOCKER_MODE=public`,
    `MARBLE_DOMAIN=${domain}`,
    `MARBLE_AUTH_ENABLED=true`,
    `MARBLE_HIDDEN_ENTRY_PATH=${hiddenPath}`,
    `MARBLE_CONFIG_FILE=/app/data/server.config.json`,
    "",
  ];
  writeFileSync(join(DOCKER_DATA, ".env"), envLines.join("\n"));

  // 7. Write mode marker
  writeFileSync(join(DOCKER_DATA, "mode"), "public");

  // 8. Print summary
  log(PREFIX, "Public mode configuration generated.");
  console.log("");
  console.log(`  \x1b[1mConfiguration:\x1b[0m`);
  console.log(`    Mode:         \x1b[32mPublic\x1b[0m`);
  console.log(`    Domain:       ${domain}`);
  console.log(`    Auth:         \x1b[32menabled\x1b[0m (required)`);
  console.log(`    Hidden Entry: ${hiddenEnabled ? `\x1b[32m/${hiddenPath}/\x1b[0m` : "\x1b[2mdisabled\x1b[0m"}`);
  console.log(`    Config:       ${join(DOCKER_DATA, "server.config.json")}`);
  console.log(`    Caddyfile:    ${join(caddyDir, "Caddyfile")}`);

  return {
    mode: "public" as const,
    domain,
    hiddenEnabled,
    hiddenPath,
  };
}

// ═══════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════

async function main() {
  printBanner();

  // 0. Prerequisites
  printSection("Prerequisites");
  if (checkDockerAvailable()) {
    console.log("  \x1b[32m✓\x1b[0m Docker available");
  } else {
    console.log("  \x1b[31m✗\x1b[0m Docker not found. Please install Docker first.");
    console.log("    https://docs.docker.com/get-docker/");
    process.exit(1);
  }
  if (checkComposeAvailable()) {
    console.log("  \x1b[32m✓\x1b[0m Docker Compose available");
  } else {
    console.log("  \x1b[31m✗\x1b[0m Docker Compose not found.");
    process.exit(1);
  }

  // 1. Check for existing config
  const modeFile = join(DOCKER_DATA, "mode");
  if (existsSync(modeFile)) {
    const existingMode = readFileSync(modeFile, "utf-8").trim();
    console.log("");
    console.log(`  \x1b[33m⚠\x1b[0m  Existing Docker config found (mode: \x1b[1m${existingMode}\x1b[0m).`);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const overwrite = await confirm(rl, "Overwrite existing configuration?", false);
    if (!overwrite) {
      console.log("\n  Keeping existing configuration.");
      printNextSteps(existingMode);
      rl.close();
      return;
    }
    console.log("");
    rl.close();
  }

  // 2. Choose mode
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log("");
  printSection("Deployment Mode");
  console.log("");
  console.log("  \x1b[1mLan\x1b[0m     — Local network only. Devices connect directly to the app container.");
  console.log("          mkcert + QR code certificate installation. No reverse proxy.");
  console.log("");
  console.log("  \x1b[1mPublic\x1b[0m  — Public internet. Caddy reverse proxy + Fail2Ban protection.");
  console.log("          Requires a domain name. Password auth is mandatory.");
  console.log("");

  const modeAnswer = await askWithDefault(rl, "Choose deployment mode (lan/public)", "lan");
  const mode = modeAnswer.toLowerCase().startsWith("p") ? "public" : "lan";

  // 3. Run mode-specific init
  let result: Awaited<ReturnType<typeof initLanMode>> | Awaited<ReturnType<typeof initPublicMode>>;
  if (mode === "lan") {
    result = await initLanMode(rl);
  } else {
    result = await initPublicMode(rl);
  }

  rl.close();

  // 4. Print next steps
  printNextSteps(mode);

  // 5. QR code for LAN
  if (mode === "lan" && "fingerprint" in result) {
    const { appUrl, appUrlIp } = result;
    try {
      const QRCode = await import("qrcode");
      const appQr = await QRCode.toString(appUrlIp + "/", { type: "terminal", small: true });
      console.log("");
      console.log("  \x1b[1m── QR Code — App URL ─────────────────────────────────\x1b[0m");
      console.log("");
      for (const line of appQr.split("\n")) {
        console.log(`  ${line}`);
      }
      console.log("");
      console.log(`  \x1b[2mApp URL:\x1b[0m ${appUrl}/`);
      console.log(`  \x1b[2mApp IP:\x1b[0m   ${appUrlIp}/`);
    } catch {
      // QR code generation failed — not critical for Docker mode
      console.log(`  \x1b[2mApp URL:\x1b[0m ${appUrl}/`);
      console.log(`  \x1b[2mApp IP:\x1b[0m   ${result.appUrlIp}/`);
    }
  }
}

function printNextSteps(mode: string) {
  console.log("");
  console.log("  \x1b[1;32m╔══════════════════════════════════════════════════════╗");
  console.log("  ║  Setup complete!                                     ║");
  console.log("  ╚══════════════════════════════════════════════════════╝\x1b[0m");
  console.log("");
  console.log(`  \x1b[1mMode:\x1b[0m ${mode === "lan" ? "LAN (local network)" : "Public (internet)"}`);
  console.log("");
  console.log("  \x1b[1mNext steps:\x1b[0m");
  console.log("");
  if (mode === "lan") {
    console.log(`    1. Start:          \x1b[36mbun run docker:up\x1b[0m`);
    console.log(`    2. For cert install: \x1b[36mbun run lan:https\x1b[0m (on host machine)`);
    console.log(`    3. Smoke test:     \x1b[36mbun run docker:smoke -- --mode lan\x1b[0m`);
  } else {
    console.log(`    1. Set DNS:  Point your domain to this server's IP.`);
    console.log(`    2. Start:    \x1b[36mbun run docker:up\x1b[0m`);
    console.log(`    3. Smoke:    \x1b[36mbun run docker:smoke -- --mode public\x1b[0m`);
  }
  console.log("");
  console.log("  \x1b[2mConfig stored in data/docker/\x1b[0m");
  console.log("");
}

main().catch((err) => {
  console.error(`\n\x1b[31mFatal error:\x1b[0m ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
