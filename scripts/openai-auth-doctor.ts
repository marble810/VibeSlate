import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { loadConfig, legacyOpenAITokenKeys, type OpenAIProviderConfig } from '../server/src/config';
import { CodexAppServerManager } from '../server/src/codex-app-server-manager';
import { fileModeOctal, redactSecrets, sha256File } from '../server/src/secret-redaction';

interface CheckResult {
  check: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

const results: CheckResult[] = [];

function add(status: CheckResult['status'], check: string, detail: string) {
  results.push({ status, check, detail: redactSecrets(detail) });
}

function rootPath(relativePath: string): string {
  return join(import.meta.dirname, '..', relativePath);
}

function defaultOpenAIConfig(): OpenAIProviderConfig {
  return {
    enabled: true,
    auth_mode: 'codex_app_server_device_code',
    codex_home: process.env.OPENAI_CODEX_HOME || rootPath('data/docker/codex-home'),
    codex_cli_path: process.env.OPENAI_CODEX_CLI_PATH || rootPath('node_modules/.bin/codex'),
    poll_interval_seconds: Number.parseInt(process.env.OPENAI_POLL_INTERVAL_SECONDS || '300', 10),
    sqlite_path: process.env.OPENAI_SQLITE_PATH || rootPath('data/docker/state/usage.sqlite'),
    auth_status_path: process.env.OPENAI_AUTH_STATUS_PATH || rootPath('data/docker/state/auth-status.json'),
  };
}

function loadOpenAIConfig(): OpenAIProviderConfig {
  try {
    return loadConfig().openai;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    add('fail', 'legacy config rejection', message);
    return defaultOpenAIConfig();
  }
}

function checkLegacyEnv() {
  const keys = legacyOpenAITokenKeys({}, process.env);
  if (keys.length > 0) {
    add('fail', 'legacy OpenAI env', `Remove unsupported env keys: ${keys.join(', ')}`);
  } else {
    add('pass', 'legacy OpenAI env', 'No legacy OpenAI token env vars detected');
  }
}

function checkCodexCli(path: string) {
  if (!existsSync(path)) {
    add('fail', 'Codex CLI', `Missing at ${path}`);
    return;
  }

  const version = Bun.spawnSync({
    cmd: [path, '--version'],
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (version.exitCode === 0) {
    add('pass', 'Codex CLI', version.stdout.toString().trim());
  } else {
    add('fail', 'Codex CLI', version.stderr.toString().trim() || 'version check failed');
  }
}

function checkCodexHome(config: OpenAIProviderConfig) {
  mkdirSync(config.codex_home, { recursive: true, mode: 0o700 });
  const homeMode = fileModeOctal(config.codex_home);
  add(homeMode === '0700' ? 'pass' : 'warn', 'CODEX_HOME mode', `${config.codex_home} mode=${homeMode ?? 'unknown'}`);

  const authPath = join(config.codex_home, 'auth.json');
  if (!existsSync(authPath)) {
    add('warn', 'auth.json', 'not present; use the OpenAI card device-code login');
    return;
  }

  const stat = statSync(authPath);
  const mode = fileModeOctal(authPath);
  const hash = sha256File(authPath);
  add(
    mode === '0600' ? 'pass' : 'warn',
    'auth.json metadata',
    `mode=${mode ?? 'unknown'} mtime=${stat.mtime.toISOString()} sha256=${hash ?? 'unreadable'}`,
  );
}

function checkLock(config: OpenAIProviderConfig) {
  const lockPath = join(dirname(config.auth_status_path), 'locks', 'codex-authd.lock');
  if (!existsSync(lockPath)) {
    add('pass', 'auth lock', `not held at ${lockPath}`);
    return false;
  }

  add('warn', 'auth lock', `lock exists at ${lockPath}; running app or stale lock may own this CODEX_HOME`);
  return true;
}

function checkSchema(config: OpenAIProviderConfig) {
  const schema = Bun.spawnSync({
    cmd: ['bun', 'run', 'check:codex-app-server-schema'],
    env: {
      ...process.env,
      OPENAI_CODEX_CLI_PATH: config.codex_cli_path,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (schema.exitCode === 0) {
    add('pass', 'app-server schema', schema.stdout.toString().trim());
  } else {
    add('fail', 'app-server schema', schema.stderr.toString().trim() || schema.stdout.toString().trim());
  }
}

async function checkAppServer(config: OpenAIProviderConfig, lockHeld: boolean) {
  if (lockHeld) {
    add('warn', 'app-server connectivity', 'skipped because lock is currently held');
    return;
  }

  const manager = new CodexAppServerManager({
    codexCliPath: config.codex_cli_path,
    codexHome: config.codex_home,
    lockPath: join(dirname(config.auth_status_path), 'locks', 'codex-authd.lock'),
    requestTimeoutMs: 15_000,
  });

  try {
    const account = await manager.readAccount(false);
    add('pass', 'account/read', account.account?.type || (account.requiresOpenaiAuth ? 'requires OpenAI auth' : 'no account'));

    if (account.account?.type === 'chatgpt') {
      await manager.readRateLimits();
      add('pass', 'account/rateLimits/read', 'available');
    } else {
      add('warn', 'account/rateLimits/read', 'skipped until ChatGPT device-code login is complete');
    }
  } catch (error) {
    add('fail', 'app-server connectivity', error instanceof Error ? error.message : String(error));
  } finally {
    manager.stop();
  }
}

function printResults() {
  for (const result of results) {
    const icon = result.status === 'pass' ? 'PASS' : result.status === 'warn' ? 'WARN' : 'FAIL';
    console.log(`${icon} ${result.check}: ${result.detail}`);
  }

  const failed = results.some((result) => result.status === 'fail');
  process.exit(failed ? 1 : 0);
}

async function main() {
  checkLegacyEnv();
  const config = loadOpenAIConfig();
  checkCodexCli(config.codex_cli_path);
  checkCodexHome(config);
  const lockHeld = checkLock(config);
  checkSchema(config);
  await checkAppServer(config, lockHeld);
  printResults();
}

main().catch((error) => {
  console.error(`FAIL doctor: ${error instanceof Error ? redactSecrets(error.message) : 'unknown error'}`);
  process.exit(1);
});
