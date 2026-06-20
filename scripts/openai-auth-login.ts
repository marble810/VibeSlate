/**
 * VibeSlate - OpenAI Auth Login
 *
 * Runs inside the app container or a Bun dev checkout. The script talks to the
 * running VibeSlate backend; the backend owns the Codex app-server process and
 * CODEX_HOME lock.
 */

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { spawnSync } from 'bun';
import { runOpenAIAuthLogin } from './openai-auth-login-client';

interface CliArgs {
  baseUrl: string;
  timeoutSeconds: number;
}

function parseArgs(argv: string[]): CliArgs {
  const port = process.env.PORT || '12001';
  const tlsEnabled = (process.env.TLS_ENABLED || '').toLowerCase() === 'true';
  const defaultBaseUrl = `${tlsEnabled ? 'https' : 'http'}://localhost:${port}`;
  const args: CliArgs = {
    baseUrl: process.env.MARBLE_BASE_URL || defaultBaseUrl,
    timeoutSeconds: Number.parseInt(process.env.OPENAI_LOGIN_TIMEOUT_SECONDS || '600', 10),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--base-url') {
      const value = argv[i + 1];
      if (!value) throw new Error('--base-url requires a value');
      args.baseUrl = value;
      i += 1;
      continue;
    }
    if (arg === '--timeout-seconds') {
      const value = argv[i + 1];
      if (!value) throw new Error('--timeout-seconds requires a value');
      args.timeoutSeconds = Number.parseInt(value, 10);
      i += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isFinite(args.timeoutSeconds) || args.timeoutSeconds <= 0) {
    throw new Error('--timeout-seconds must be a positive integer');
  }

  return args;
}

function printHelp() {
  console.log(`VibeSlate OpenAI auth login

Usage:
  bun run openai:auth:login [--base-url URL] [--timeout-seconds N]

This command starts the same Codex device-code login flow as the OpenAI card.
It calls the running VibeSlate backend; it does not read or copy auth.json.`);
}

async function promptPassword(): Promise<string> {
  if (process.env.VIBESLATE_PASSWORD) return process.env.VIBESLATE_PASSWORD;

  stdout.write('VibeSlate password: ');
  const canHide = stdin.isTTY;
  if (canHide) spawnSync(['sh', '-c', 'stty -echo'], { stdin: 'inherit' });

  const rl = createInterface({ input: stdin, output: stdout, terminal: false });
  try {
    const password = await new Promise<string>((resolve, reject) => {
      rl.once('error', reject);
      rl.question('').then(resolve, reject);
    });
    if (canHide) stdout.write('\n');
    return password;
  } catch (error) {
    throw new Error(
      `Unable to read VibeSlate password from this terminal${
        error instanceof Error && error.message ? `: ${error.message}` : ''
      }. Set VIBESLATE_PASSWORD for this command or use the UI login page.`,
    );
  } finally {
    rl.close();
    if (canHide) spawnSync(['sh', '-c', 'stty echo'], { stdin: 'inherit' });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.baseUrl.startsWith('https://') && process.env.TLS_ROOT_CA_FILE && !process.env.SSL_CERT_FILE) {
    process.env.SSL_CERT_FILE = process.env.TLS_ROOT_CA_FILE;
  }
  const controller = new AbortController();

  process.once('SIGINT', () => {
    controller.abort();
  });

  const result = await runOpenAIAuthLogin({
    baseUrl: args.baseUrl,
    timeoutSeconds: args.timeoutSeconds,
    promptPassword,
    signal: controller.signal,
  });

  if (result.status !== 'authenticated') {
    console.error(result.message);
    process.exit(result.status === 'canceled' ? 130 : 1);
  }
}

main().catch((error) => {
  console.error(`OpenAI auth login failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
