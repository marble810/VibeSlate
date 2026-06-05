import { spawn } from "bun";
import { join } from "node:path";

const bun = process.execPath;
const root = join(import.meta.dirname, "..");
const serverDir = join(root, "server");
const port = Number(process.env.PORT ?? "12001");
const targetUrl = `http://127.0.0.1:${port}`;

type RunOptions = {
  cwd?: string;
  env?: Record<string, string | undefined>;
  inherit?: boolean;
  allowFailure?: boolean;
};

function log(message: string) {
  console.log(`[tailscale] ${message}`);
}

async function run(command: string, args: string[], options: RunOptions = {}) {
  const proc = spawn([command, ...args], {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...options.env },
    stdout: options.inherit ? "inherit" : "pipe",
    stderr: options.inherit ? "inherit" : "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    options.inherit ? Promise.resolve("") : new Response(proc.stdout).text(),
    options.inherit ? Promise.resolve("") : new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0 && !options.allowFailure) {
    const detail = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${exitCode}${detail ? `\n${detail}` : ""}`);
  }

  return { exitCode, stdout, stderr };
}

async function fetchText(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1_500);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return { ok: response.ok, text: await response.text() };
  } catch {
    return { ok: false, text: "" };
  } finally {
    clearTimeout(timer);
  }
}

async function waitForServer(url: string, timeoutMs = 15_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const result = await fetchText(url);
    if (result.ok && result.text.includes("Marble Panel")) return;
    await Bun.sleep(300);
  }

  throw new Error(`Timed out waiting for Marble Panel at ${url}`);
}

async function marbleServerStatus() {
  const result = await fetchText(targetUrl);
  if (!result.ok) return "down" as const;
  if (result.text.includes("Marble Panel")) return "marble" as const;
  return "occupied" as const;
}

async function ensureTailscaleRunning() {
  await run("tailscale", ["version"]);

  const status = await run("tailscale", ["status", "--json"], { allowFailure: true });
  if (status.exitCode === 0) {
    try {
      const parsed = JSON.parse(status.stdout) as { BackendState?: string };
      if (parsed.BackendState === "Running") return;
    } catch {
      // Fall through and run tailscale up.
    }
  }

  log("starting Tailscale");
  await run("tailscale", ["up"], { inherit: true });
}

function extractServeUrl(status: string) {
  return status.match(/https:\/\/\S+\.ts\.net/)?.[0] ?? null;
}

let serverProcess: ReturnType<typeof spawn> | null = null;

async function main() {
  log("building production web assets");
  await run(bun, ["run", "build"], { inherit: true });

  const status = await marbleServerStatus();
  if (status === "occupied") {
    throw new Error(`Port ${port} is already serving something other than Marble Panel.`);
  }

  if (status === "marble") {
    log(`using existing Marble Panel server at ${targetUrl}`);
  } else {
    log(`starting Marble Panel server at ${targetUrl}`);
    serverProcess = spawn([bun, "src/index.ts"], {
      cwd: serverDir,
      env: { ...process.env, PORT: String(port) },
      stdout: "inherit",
      stderr: "inherit",
    });

    serverProcess.exited.then((code) => {
      if (code !== 0) process.exitCode = code;
      if (serverProcess) process.exit(code);
    });

    await waitForServer(targetUrl);
  }

  await ensureTailscaleRunning();

  log(`configuring Tailscale Serve -> ${targetUrl}`);
  await run("tailscale", ["serve", "--bg", "--yes", targetUrl], { inherit: true });

  const serveStatus = await run("tailscale", ["serve", "status"]);
  const serveUrl = extractServeUrl(serveStatus.stdout);

  console.log("");
  log("ready");
  if (serveUrl) console.log(`  ${serveUrl}/`);
  console.log(`  proxy target: ${targetUrl}`);
  console.log("  stop proxy: bun run tailscale:stop");

  if (serverProcess) {
    console.log("");
    log("server is running in the foreground. Press Ctrl-C to stop the local server.");
    await serverProcess.exited;
  }
}

function cleanup() {
  if (serverProcess) serverProcess.kill();
  process.exit();
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  if (serverProcess) serverProcess.kill();
  process.exit(1);
});
