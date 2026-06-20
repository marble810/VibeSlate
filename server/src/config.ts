/**
 * Load server configuration from explicit config files and env vars.
 */

import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';

const home = homedir();

export interface ServerConfig {
  deepseek_token: string;
  query_interval_seconds: number;
  openai: OpenAIProviderConfig;
  opencode_workspace_id: string;
  opencode_auth_cookie: string;
  ui: UiConfig;
  auth: PasswordAuthConfig;
  tls: TlsConfig;
}

export interface OpenAIProviderConfig {
  enabled: boolean;
  auth_mode: 'codex_app_server_device_code';
  codex_home: string;
  codex_cli_path: string;
  poll_interval_seconds: number;
  sqlite_path: string;
  auth_status_path: string;
}

export interface UiConfig {
  custom_accent: string;
}

export interface PasswordAuthConfig {
  enabled: boolean;
  password_hash: string;
  session_ttl_seconds: number;
  cookie_name: string;
  cookie_secure: boolean;
}

export interface TlsConfig {
  enabled: boolean;
  cert_file: string;
  key_file: string;
  root_ca_file: string;
}

// ── JSONC parser (strips comments) ──

function stripJsonComments(raw: string): string {
  let out = raw.replace(/\/\*[\s\S]*?\*\//g, '');
  out = out.replace(/\/\/.*$/gm, '');
  return out;
}

function parseJsonFile(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf-8').trim();
    if (!raw) return null;
    return JSON.parse(stripJsonComments(raw));
  } catch {
    return null;
  }
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parsePositiveInteger(value: unknown, fallback: number): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseHexColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;

  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toLowerCase() : fallback;
}

function parseString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function projectPath(relativePath: string): string {
  return new URL(`../../${relativePath}`, import.meta.url).pathname;
}

function dataRoot(): string {
  return process.env.MARBLE_DATA_DIR || projectPath('data/docker');
}

export function legacyOpenAITokenKeys(config: Record<string, unknown>, env = process.env): string[] {
  const keys: string[] = [];
  for (const key of ['openai_refresh_token', 'openai_account_id']) {
    if (typeof config[key] === 'string' && (config[key] as string).length > 0) keys.push(key);
  }
  for (const key of ['OPENAI_REFRESH_TOKEN', 'OPENAI_ACCOUNT_ID', 'OPENAI_TOKEN_STATE_FILE']) {
    if (typeof env[key] === 'string' && env[key]!.length > 0) keys.push(key);
  }
  return keys;
}

function assertNoLegacyOpenAITokenConfig(config: Record<string, unknown>) {
  const keys = legacyOpenAITokenKeys(config);
  if (keys.length === 0) return;

  throw new Error(
    `[config] Legacy OpenAI token config is not supported: ${keys.join(', ')}. ` +
      'Remove refresh-token/account-id settings and use the Docker Codex device-code login flow. ' +
      'VibeSlate now stores Codex-owned auth only under openai.codex_home.',
  );
}

function loadOpenAIProviderConfig(openaiCfg: Record<string, unknown>): OpenAIProviderConfig {
  const root = dataRoot();
  const enabled = parseBoolean(
    openaiCfg.enabled,
    parseBoolean(process.env.OPENAI_ENABLED, false),
  );
  const authMode = parseString(
    openaiCfg.auth_mode ?? process.env.OPENAI_AUTH_MODE,
    'codex_app_server_device_code',
  );

  if (authMode !== 'codex_app_server_device_code') {
    throw new Error(`[config] Unsupported openai.auth_mode: ${authMode}`);
  }

  return {
    enabled,
    auth_mode: 'codex_app_server_device_code',
    codex_home: parseString(
      openaiCfg.codex_home ?? process.env.OPENAI_CODEX_HOME,
      `${root}/codex-home`,
    ),
    codex_cli_path: parseString(
      openaiCfg.codex_cli_path ?? process.env.OPENAI_CODEX_CLI_PATH,
      projectPath('node_modules/.bin/codex'),
    ),
    poll_interval_seconds: parsePositiveInteger(
      openaiCfg.poll_interval_seconds,
      parsePositiveInteger(process.env.OPENAI_POLL_INTERVAL_SECONDS, 300),
    ),
    sqlite_path: parseString(
      openaiCfg.sqlite_path ?? process.env.OPENAI_SQLITE_PATH,
      `${root}/state/usage.sqlite`,
    ),
    auth_status_path: parseString(
      openaiCfg.auth_status_path ?? process.env.OPENAI_AUTH_STATUS_PATH,
      `${root}/state/auth-status.json`,
    ),
  };
}

// ── Auto-discovery ──

function discoverOpenCodeGoCredentials(): { workspace_id: string; auth_cookie: string } | null {
  const paths = [
    `${home}/.config/opencode-bar/opencode-go.json`,
    `${home}/.config/opencode-quota/opencode-go.json`,
    `${home}/Library/Application Support/opencode-bar/opencode-go.json`,
    `${home}/Library/Application Support/opencode-quota/opencode-go.json`,
  ];
  for (const p of paths) {
    const cfg = parseJsonFile(p);
    if (!cfg) continue;
    const wsId = (cfg.workspaceId || cfg.workspaceID || cfg.workspace_id) as string | undefined;
    const cookie = (cfg.authCookie || cfg.auth_cookie || cfg.cookie) as string | undefined;
    if (wsId && cookie) {
      console.log(`[config] Auto-discovered OpenCode Go credentials from ${p}`);
      return { workspace_id: wsId, auth_cookie: cookie };
    }
  }
  return null;
}

// ── Main loader ──

export function loadConfig(): ServerConfig {
  const explicitCfgPath = process.env.MARBLE_CONFIG_FILE;
  const configDir = new URL('..', import.meta.url).pathname;
  const cfgPaths = explicitCfgPath
    ? [explicitCfgPath]
    : [`${configDir}/config.json`, `${configDir}/config.jsonc`];

  let fileCfg: Record<string, unknown> = {};
  for (const p of cfgPaths) {
    const parsed = parseJsonFile(p);
    if (!parsed) continue;

    fileCfg = {
      ...fileCfg,
      ...parsed,
      auth: {
        ...asObject(fileCfg.auth),
        ...asObject(parsed.auth),
      },
      tls: {
        ...asObject(fileCfg.tls),
        ...asObject(parsed.tls),
      },
      ui: {
        ...asObject(fileCfg.ui),
        ...asObject(parsed.ui),
      },
      openai: {
        ...asObject(fileCfg.openai),
        ...asObject(parsed.openai),
      },
    };
  }

  const deepseek = (fileCfg?.deepseek_token as string) || '';
  const interval = (fileCfg?.query_interval_seconds as number) || 60;
  const opencodeWsId = (fileCfg?.opencode_workspace_id as string) || '';
  const opencodeCookie = (fileCfg?.opencode_auth_cookie as string) || '';
  const openaiCfg = asObject(fileCfg?.openai);
  const uiCfg = asObject(fileCfg?.ui);
  const authCfg = asObject(fileCfg?.auth);
  const tlsCfg = asObject(fileCfg?.tls);
  assertNoLegacyOpenAITokenConfig(fileCfg);

  let finalOpencodeWsId = opencodeWsId;
  let finalOpencodeCookie = opencodeCookie;
  if (!finalOpencodeWsId || !finalOpencodeCookie) {
    const discovered = discoverOpenCodeGoCredentials();
    if (discovered) {
      if (!finalOpencodeWsId) finalOpencodeWsId = discovered.workspace_id;
      if (!finalOpencodeCookie) finalOpencodeCookie = discovered.auth_cookie;
    }
  }
  const dsToken = deepseek || process.env.DEEPSEEK_PLATFORM_TOKEN || '';
  const openai = loadOpenAIProviderConfig(openaiCfg);
  const authEnabled = parseBoolean(
    authCfg.enabled,
    parseBoolean(process.env.AUTH_ENABLED, false),
  );
  const authPasswordHash =
    (authCfg.password_hash as string | undefined) || process.env.AUTH_PASSWORD_HASH || '';
  const authSessionTtlSeconds = parsePositiveInteger(
    authCfg.session_ttl_seconds,
    parsePositiveInteger(process.env.AUTH_SESSION_TTL_SECONDS, 7 * 24 * 60 * 60),
  );
  const authCookieName =
    (authCfg.cookie_name as string | undefined) || process.env.AUTH_COOKIE_NAME || 'marble_session';
  const authCookieSecure = parseBoolean(
    authCfg.cookie_secure,
    parseBoolean(process.env.AUTH_COOKIE_SECURE, true),
  );
  const tlsEnabled = parseBoolean(
    tlsCfg.enabled,
    parseBoolean(process.env.TLS_ENABLED, false),
  );
  const tlsCertFile =
    (tlsCfg.cert_file as string | undefined) ||
    process.env.TLS_CERT_FILE ||
    '/app/data/certs/cert.pem';
  const tlsKeyFile =
    (tlsCfg.key_file as string | undefined) ||
    process.env.TLS_KEY_FILE ||
    '/app/data/certs/key.pem';
  const tlsRootCaFile =
    (tlsCfg.root_ca_file as string | undefined) ||
    process.env.TLS_ROOT_CA_FILE ||
    '/app/data/certs/rootCA.pem';
  const customAccent = parseHexColor(
    uiCfg.custom_accent ?? process.env.UI_CUSTOM_ACCENT,
    '#8b5cf6',
  );

  if (!dsToken) {
    console.warn('[config] DeepSeek token not found.');
    console.warn('  → Set DEEPSEEK_PLATFORM_TOKEN in docker/.env for Docker deployments');
    console.warn('  → Or set deepseek_token in server/config.jsonc for local development');
  }
  if (!openai.enabled) {
    console.warn('[config] OpenAI Codex app-server is disabled.');
    console.warn('  → Set OPENAI_ENABLED=true or openai.enabled=true to enable Docker device-code login');
  }
  if (!finalOpencodeWsId || !finalOpencodeCookie) {
    console.warn('[config] OpenCode Go credentials not found.');
    console.warn('  → Set OPENCODE_WORKSPACE_ID and OPENCODE_AUTH_COOKIE in docker/.env');
    console.warn('  → Or see config.example.jsonc for local development instructions');
  }
  if (authEnabled && !authPasswordHash) {
    console.warn('[config] Password auth is enabled, but auth.password_hash is missing.');
    console.warn('  → Set AUTH_PASSWORD_HASH in docker/.env');
    console.warn('  → Example from a Bun checkout: bun -e \'console.log(await Bun.password.hash("change-me"))\'');
  }

  return {
    deepseek_token: dsToken,
    query_interval_seconds: interval,
    openai,
    opencode_workspace_id: finalOpencodeWsId,
    opencode_auth_cookie: finalOpencodeCookie,
    ui: {
      custom_accent: customAccent,
    },
    auth: {
      enabled: authEnabled,
      password_hash: authPasswordHash,
      session_ttl_seconds: authSessionTtlSeconds,
      cookie_name: authCookieName,
      cookie_secure: authCookieSecure,
    },
    tls: {
      enabled: tlsEnabled,
      cert_file: tlsCertFile,
      key_file: tlsKeyFile,
      root_ca_file: tlsRootCaFile,
    },
  };
}
