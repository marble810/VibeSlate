/**
 * VibeSlate - Docker OpenAI Login
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, spawnSync } from 'bun';

const ROOT = join(import.meta.dirname, '..');
const COMPOSE_FILE = join(ROOT, 'docker', 'docker-compose.yml');
const COMPOSE_EXAMPLE = join(ROOT, 'docker', 'docker-compose.example.yml');
const ENV_FILE = join(ROOT, 'docker', '.env');
const ENV_EXAMPLE = join(ROOT, 'docker', '.env.example');

function log(message: string) {
  console.log(`\x1b[36m[docker-openai-login]\x1b[0m ${message}`);
}

function fail(message: string): never {
  console.error(`\x1b[31m[docker-openai-login]\x1b[0m ${message}`);
  process.exit(1);
}

function composeArgs(args: string[]): string[] {
  return ['compose', '--project-directory', '.', '-f', 'docker/docker-compose.yml', ...args];
}

function printHelp() {
  console.log(`VibeSlate Docker OpenAI login

Usage:
  bun run docker:openai:login [--timeout-seconds N]

This wraps:
  docker compose -f docker/docker-compose.yml exec --workdir /app app bun run openai:auth:login

Start the app first with:
  bun run docker:up`);
}

function assertLocalDockerFiles() {
  if (!existsSync(COMPOSE_FILE)) {
    fail(`Missing docker/docker-compose.yml. Copy ${COMPOSE_EXAMPLE} to ${COMPOSE_FILE}.`);
  }
  if (!existsSync(ENV_FILE)) {
    fail(`Missing docker/.env. Copy ${ENV_EXAMPLE} to ${ENV_FILE}.`);
  }
}

function assertAppContainerRunning() {
  const ps = spawnSync({
    cmd: ['docker', ...composeArgs(['ps', '--services', '--filter', 'status=running'])],
    cwd: ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  if (ps.exitCode !== 0) {
    fail(ps.stderr.toString().trim() || 'Failed to inspect Docker Compose services.');
  }

  const running = ps.stdout.toString().split(/\r?\n/).map((line) => line.trim());
  if (!running.includes('app')) {
    fail('The app container is not running. Start it with: bun run docker:up');
  }
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  assertLocalDockerFiles();
  assertAppContainerRunning();

  log('Starting OpenAI device-code login inside the app container...');
  const proc = spawn(['docker', ...composeArgs([
    'exec',
    '--workdir',
    '/app',
    'app',
    'bun',
    'run',
    'openai:auth:login',
    ...process.argv.slice(2),
  ])], {
    cwd: ROOT,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });

  const exitCode = await proc.exited;
  process.exit(exitCode);
}

main().catch((error) => {
  console.error(`\x1b[31mFatal error:\x1b[0m ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
