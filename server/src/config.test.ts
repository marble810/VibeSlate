import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  legacyOpenAITokenKeys,
  loadConfig,
  discoverOpenCodeGoCredentials,
} from './config';

// ── Existing tests ──

describe('config legacy OpenAI detection', () => {
  test('detects legacy file and env token keys', () => {
    const keys = legacyOpenAITokenKeys(
      {
        openai_refresh_token: 'set',
        openai_account_id: 'acct',
      },
      {
        OPENAI_TOKEN_STATE_FILE: '/tmp/token.json',
      } as NodeJS.ProcessEnv,
    );

    expect(keys).toEqual(['openai_refresh_token', 'openai_account_id', 'OPENAI_TOKEN_STATE_FILE']);
  });

  test('ignores empty legacy keys', () => {
    expect(legacyOpenAITokenKeys({ openai_refresh_token: '' }, {} as NodeJS.ProcessEnv)).toEqual([]);
  });
});

// ── OpenCode Go credential resolution via loadConfig ──

// ── every env var consumed by loadConfig / loadOpenAIProviderConfig / assertNoLegacyOpenAITokenConfig ──
const LOADCONFIG_ENV_KEYS = [
  'MARBLE_CONFIG_FILE',
  'MARBLE_DATA_DIR',
  'OPENCODE_WORKSPACE_ID',
  'OPENCODE_AUTH_COOKIE',
  'DEEPSEEK_PLATFORM_TOKEN',
  'OPENAI_ENABLED',
  'OPENAI_AUTH_MODE',
  'OPENAI_CODEX_HOME',
  'OPENAI_CODEX_CLI_PATH',
  'OPENAI_POLL_INTERVAL_SECONDS',
  'OPENAI_SQLITE_PATH',
  'OPENAI_AUTH_STATUS_PATH',
  'OPENAI_REFRESH_TOKEN',
  'OPENAI_ACCOUNT_ID',
  'OPENAI_TOKEN_STATE_FILE',
  'AUTH_ENABLED',
  'AUTH_PASSWORD_HASH',
  'AUTH_SESSION_TTL_SECONDS',
  'AUTH_COOKIE_NAME',
  'AUTH_COOKIE_SECURE',
  'TLS_ENABLED',
  'TLS_CERT_FILE',
  'TLS_KEY_FILE',
  'TLS_ROOT_CA_FILE',
  'UI_CUSTOM_ACCENT',
];

describe('OpenCode Go credential resolution via loadConfig', () => {
  let tmpDir: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vibeslate-config-test-'));
    for (const key of LOADCONFIG_ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    for (const key of LOADCONFIG_ENV_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key]!;
      }
    }
  });

  function writeConfig(content: Record<string, unknown>): string {
    const path = join(tmpDir, 'config.json');
    writeFileSync(path, JSON.stringify(content));
    process.env.MARBLE_CONFIG_FILE = path;
    return path;
  }

  function suppressDsWarning() {
    process.env.DEEPSEEK_PLATFORM_TOKEN = 'test-ds-token';
  }

  test('env fallback: uses OPENCODE_WORKSPACE_ID and OPENCODE_AUTH_COOKIE when config has no opencode fields', () => {
    writeConfig({});
    suppressDsWarning();
    process.env.OPENCODE_WORKSPACE_ID = 'env-ws-id';
    process.env.OPENCODE_AUTH_COOKIE = 'env-auth-ck';

    const cfg = loadConfig([]);
    expect(cfg.opencode_workspace_id).toBe('env-ws-id');
    expect(cfg.opencode_auth_cookie).toBe('env-auth-ck');
  });

  test('config-over-env precedence: config values override env vars when both are set', () => {
    writeConfig({
      opencode_workspace_id: 'cfg-ws-id',
      opencode_auth_cookie: 'cfg-auth-ck',
    });
    suppressDsWarning();
    process.env.OPENCODE_WORKSPACE_ID = 'env-ws-id';
    process.env.OPENCODE_AUTH_COOKIE = 'env-auth-ck';

    const cfg = loadConfig([]);
    expect(cfg.opencode_workspace_id).toBe('cfg-ws-id');
    expect(cfg.opencode_auth_cookie).toBe('cfg-auth-ck');
  });

  test('partial fill: config has workspace_id, env provides auth_cookie', () => {
    writeConfig({ opencode_workspace_id: 'cfg-ws-id' });
    suppressDsWarning();
    process.env.OPENCODE_AUTH_COOKIE = 'env-auth-ck';
    // OPENCODE_WORKSPACE_ID is intentionally unset

    const cfg = loadConfig([]);
    expect(cfg.opencode_workspace_id).toBe('cfg-ws-id');
    expect(cfg.opencode_auth_cookie).toBe('env-auth-ck');
  });

  test('partial fill: config has auth_cookie, env provides workspace_id', () => {
    writeConfig({ opencode_auth_cookie: 'cfg-auth-ck' });
    suppressDsWarning();
    process.env.OPENCODE_WORKSPACE_ID = 'env-ws-id';
    // OPENCODE_AUTH_COOKIE is intentionally unset

    const cfg = loadConfig([]);
    expect(cfg.opencode_workspace_id).toBe('env-ws-id');
    expect(cfg.opencode_auth_cookie).toBe('cfg-auth-ck');
  });

  test('partial fill: env provides one field, the other stays empty when no discovery matches', () => {
    writeConfig({});
    suppressDsWarning();
    process.env.OPENCODE_WORKSPACE_ID = 'env-ws-id';
    // OPENCODE_AUTH_COOKIE is intentionally unset, and we block discovery

    const cfg = loadConfig([]);
    expect(cfg.opencode_workspace_id).toBe('env-ws-id');
    expect(cfg.opencode_auth_cookie).toBe('');
  });

  test('empty string in config does not block env fallback', () => {
    writeConfig({
      opencode_workspace_id: '',
      opencode_auth_cookie: '',
    });
    suppressDsWarning();
    process.env.OPENCODE_WORKSPACE_ID = 'env-ws-id';
    process.env.OPENCODE_AUTH_COOKIE = 'env-auth-ck';

    const cfg = loadConfig([]);
    expect(cfg.opencode_workspace_id).toBe('env-ws-id');
    expect(cfg.opencode_auth_cookie).toBe('env-auth-ck');
  });

  test('returns empty strings when no source provides credentials', () => {
    writeConfig({});
    suppressDsWarning();
    // No env vars set, and we block discovery

    const cfg = loadConfig([]);
    expect(cfg.opencode_workspace_id).toBe('');
    expect(cfg.opencode_auth_cookie).toBe('');
  });

  test('discovery fills missing credentials through loadConfig', () => {
    writeConfig({});
    suppressDsWarning();
    // Neither config nor env provide opencode credentials
    const discoveryPath = join(tmpDir, 'disco', 'opencode-go.json');
    mkdirSync(join(discoveryPath, '..'), { recursive: true });
    writeFileSync(discoveryPath, JSON.stringify({
      workspace_id: 'disc-ws',
      auth_cookie: 'disc-ck',
    }));

    const cfg = loadConfig([discoveryPath]);
    expect(cfg.opencode_workspace_id).toBe('disc-ws');
    expect(cfg.opencode_auth_cookie).toBe('disc-ck');
  });

  test('discovery only fills missing fields (partial-fill via discovery)', () => {
    writeConfig({ opencode_workspace_id: 'cfg-ws-id' });
    suppressDsWarning();
    // Config provides workspace_id, discovery provides cookie
    const discoveryPath = join(tmpDir, 'disco', 'opencode-go.json');
    mkdirSync(join(discoveryPath, '..'), { recursive: true });
    writeFileSync(discoveryPath, JSON.stringify({
      workspace_id: 'should-not-override',
      auth_cookie: 'disc-ck',
    }));

    const cfg = loadConfig([discoveryPath]);
    expect(cfg.opencode_workspace_id).toBe('cfg-ws-id');
    expect(cfg.opencode_auth_cookie).toBe('disc-ck');
  });
});

// ── discoverOpenCodeGoCredentials unit tests ──

describe('discoverOpenCodeGoCredentials', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vibeslate-discovery-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeDiscoveryFile(relPath: string, content: Record<string, unknown>): string {
    const fullPath = join(tmpDir, relPath);
    mkdirSync(join(fullPath, '..'), { recursive: true });
    writeFileSync(fullPath, JSON.stringify(content));
    return fullPath;
  }

  test('discovers credentials using workspace_id and auth_cookie keys', () => {
    const path = writeDiscoveryFile('opencode-bar/opencode-go.json', {
      workspace_id: 'disc-ws',
      auth_cookie: 'disc-ck',
    });

    const result = discoverOpenCodeGoCredentials([path]);
    expect(result).not.toBeNull();
    expect(result!.workspace_id).toBe('disc-ws');
    expect(result!.auth_cookie).toBe('disc-ck');
  });

  test('discovers credentials using workspaceId and authCookie aliases', () => {
    const path = writeDiscoveryFile('opencode-bar/opencode-go.json', {
      workspaceId: 'disc-ws',
      authCookie: 'disc-ck',
    });

    const result = discoverOpenCodeGoCredentials([path]);
    expect(result).not.toBeNull();
    expect(result!.workspace_id).toBe('disc-ws');
    expect(result!.auth_cookie).toBe('disc-ck');
  });

  test('discovers credentials using workspaceID and cookie aliases', () => {
    const path = writeDiscoveryFile('opencode-bar/opencode-go.json', {
      workspaceID: 'disc-ws-id',
      cookie: 'disc-ck',
    });

    const result = discoverOpenCodeGoCredentials([path]);
    expect(result).not.toBeNull();
    expect(result!.workspace_id).toBe('disc-ws-id');
    expect(result!.auth_cookie).toBe('disc-ck');
  });

  test('returns null when file does not exist', () => {
    const result = discoverOpenCodeGoCredentials([join(tmpDir, 'nonexistent.json')]);
    expect(result).toBeNull();
  });

  test('returns null when file has only workspace_id but no cookie', () => {
    const path = writeDiscoveryFile('opencode-bar/opencode-go.json', {
      workspace_id: 'disc-ws',
    });

    const result = discoverOpenCodeGoCredentials([path]);
    expect(result).toBeNull();
  });

  test('returns null when file has only cookie but no workspace_id', () => {
    const path = writeDiscoveryFile('opencode-bar/opencode-go.json', {
      auth_cookie: 'disc-ck',
    });

    const result = discoverOpenCodeGoCredentials([path]);
    expect(result).toBeNull();
  });

  test('returns first valid match from multiple paths', () => {
    const path1 = writeDiscoveryFile('first/opencode-go.json', {
      workspace_id: 'first-ws',
      auth_cookie: 'first-ck',
    });
    const path2 = writeDiscoveryFile('second/opencode-go.json', {
      workspace_id: 'second-ws',
      auth_cookie: 'second-ck',
    });

    const result = discoverOpenCodeGoCredentials([path1, path2]);
    expect(result).not.toBeNull();
    expect(result!.workspace_id).toBe('first-ws');
    expect(result!.auth_cookie).toBe('first-ck');
  });

  test('skips invalid files and finds the next valid match', () => {
    const path1 = writeDiscoveryFile('first/opencode-go.json', {
      workspace_id: 'first-ws',
      // intentionally missing cookie → invalid
    });
    const path2 = writeDiscoveryFile('second/opencode-go.json', {
      workspace_id: 'second-ws',
      auth_cookie: 'second-ck',
    });

    const result = discoverOpenCodeGoCredentials([path1, path2]);
    expect(result).not.toBeNull();
    expect(result!.workspace_id).toBe('second-ws');
    expect(result!.auth_cookie).toBe('second-ck');
  });

  test('uses default search paths when no custom paths provided (does not throw)', () => {
    // Just verify it doesn't throw with default behavior
    const result = discoverOpenCodeGoCredentials();
    expect(result === null || typeof result === 'object').toBe(true);
  });
});
