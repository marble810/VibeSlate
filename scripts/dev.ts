// Start both server and frontend dev servers concurrently
import { spawn } from "bun";
import { join } from "node:path";

const bun = process.execPath;
const root = join(import.meta.dirname, "..");

const server = spawn([bun, "--watch", "src/index.ts"], {
  cwd: join(root, "server"),
  stdio: ["inherit", "inherit", "inherit"],
  env: { ...process.env },
});

const web = spawn([bun, "x", "vite"], {
  cwd: join(root, "web"),
  stdio: ["inherit", "inherit", "inherit"],
  env: { ...process.env },
});

const cleanup = () => {
  server.kill();
  web.kill();
  process.exit();
};

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

server.exited.then((code) => {
  console.log(`[server] exited with code ${code}`);
  cleanup();
});

web.exited.then((code) => {
  console.log(`[web] exited with code ${code}`);
  cleanup();
});
