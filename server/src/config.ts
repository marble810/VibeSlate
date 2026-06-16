/**
 * Load server configuration with auto-discovery from known local sources,
 * falling back to config.json / config.jsonc / env vars.
 */

import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';

const home = homedir();

export interface ServerConfig {
  deepseek_token: string;
  query_interval_seconds: number;
  openai_refresh_token: string;
  openai_account_id: string;
  opencode_workspace_id: string;
  opencode_auth_cookie: string;
  ui: UiConfig;
  auth: PasswordAuthConfig;
  tls: TlsConfig;
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

function discoverDeepSeekToken(): string | null {
  const dpskmonPaths = [
    `${process.cwd()}/deepseek-monitor-tui.json`,
    `${home}/.config/deepseek-monitor-tui/config.json`,
  ];
  for (const p of dpskmonPaths) {
    const cfg = parseJsonFile(p);
    if (cfg?.platform_token) {
      console.log(`[config] Auto-discovered DeepSeek token from ${p}`);
      return cfg.platform_token as string;
    }
  }
  return null;
}

function discoverOpenAITokens(): { refresh_token: string; account_id: string } | null {
  const codexAuthPath = `${home}/.codex/auth.json`;
  const cfg = parseJsonFile(codexAuthPath);
  if (cfg?.tokens && typeof cfg.tokens === 'object') {
    const t = cfg.tokens as Record<string, unknown>;
    if (t.refresh_token && t.account_id) {
      console.log(`[config] Auto-discovered OpenAI tokens from ${codexAuthPath}`);
      return {
        refresh_token: t.refresh_token as string,
        account_id: t.account_id as string,
      };
    }
  }

  const piCfgPath = `${home}/.pi/extensions/pi-chatgpt-limit.json`;
  const piCfg = parseJsonFile(piCfgPath);
  if (piCfg?.openai_refresh_token) {
    console.log(`[config] Auto-discovered OpenAI tokens from ${piCfgPath}`);
  }

  return null;
}

// ── Main loader ──

/**
 * Load OpenAI token state from a runtime persistence file.
 * Returns null if file doesn't exist, is bad JSON, or has invalid values.
 */
function loadOpenAITokenState(path: string): { openai_refresh_token: string; openai_account_id: string } | null {
  if (!existsSync(path)) return null;

  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    const refresh = (parsed as Record<string, unknown>).openai_refresh_token;
    const account = (parsed as Record<string, unknown>).openai_account_id;

    if (typeof refresh !== 'string' || refresh.length === 0) return null;

    return {
      openai_refresh_token: refresh,
      openai_account_id: typeof account === 'string' ? account : '',
    };
  } catch {
    console.warn(`[config] Warning: OpenAI token state file at ${path} is invalid — ignoring.`);
    return null;
  }
}

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
    };
  }

  const deepseek = (fileCfg?.deepseek_token as string) || discoverDeepSeekToken() || '';
  const openaiRefresh = (fileCfg?.openai_refresh_token as string) || '';
  const openaiAccount = (fileCfg?.openai_account_id as string) || '';
  const interval = (fileCfg?.query_interval_seconds as number) || 60;
  const opencodeWsId = (fileCfg?.opencode_workspace_id as string) || '';
  const opencodeCookie = (fileCfg?.opencode_auth_cookie as string) || '';
  const uiCfg = asObject(fileCfg?.ui);
  const authCfg = asObject(fileCfg?.auth);
  const tlsCfg = asObject(fileCfg?.tls);

  let finalOpencodeWsId = opencodeWsId;
  let finalOpencodeCookie = opencodeCookie;
  if (!finalOpencodeWsId || !finalOpencodeCookie) {
    const discovered = discoverOpenCodeGoCredentials();
    if (discovered) {
      if (!finalOpencodeWsId) finalOpencodeWsId = discovered.workspace_id;
      if (!finalOpencodeCookie) finalOpencodeCookie = discovered.auth_cookie;
    }
  }
  let finalRefresh = openaiRefresh;
  let finalAccount = openaiAccount;
  if (!finalRefresh || !finalAccount) {
    const discovered = discoverOpenAITokens();
    if (discovered && !finalRefresh) finalRefresh = discovered.refresh_token;
    if (discovered && !finalAccount) finalAccount = discovered.account_id;
  }

  const dsToken = deepseek || process.env.DEEPSEEK_PLATFORM_TOKEN || '';
  let oaRefresh = finalRefresh || process.env.OPENAI_REFRESH_TOKEN || '';
  let oaAccount = finalAccount || process.env.OPENAI_ACCOUNT_ID || '';

  // ── Runtime token state override (Docker token persistence) ──
  const tokenStatePath = process.env.OPENAI_TOKEN_STATE_FILE;
  if (tokenStatePath) {
    const stateTokens = loadOpenAITokenState(tokenStatePath);
    if (stateTokens) {
      if (stateTokens.openai_refresh_token) oaRefresh = stateTokens.openai_refresh_token;
      if (stateTokens.openai_account_id) oaAccount = stateTokens.openai_account_id;
    }
  }
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
    console.warn('  → Or create server/config.json for local development');
  }
  if (!oaRefresh) {
    console.warn('[config] OpenAI token not found.');
    console.warn('  → Set OPENAI_REFRESH_TOKEN and OPENAI_ACCOUNT_ID in docker/.env');
    console.warn('  → Or create server/config.json for local development');
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
    openai_refresh_token: oaRefresh,
    openai_account_id: oaAccount,
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
