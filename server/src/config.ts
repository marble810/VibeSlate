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
  public: PublicConfig;
  hidden_entry: HiddenEntryConfig;
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

export interface PublicConfig {
  mode: 'lan' | 'public';
  trusted_proxies: string[];
}

export interface HiddenEntryConfig {
  enabled: boolean;
  path: string;
  root_response: '404' | 'redirect';
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

/** Discover OpenCode Go credentials from known config files. */
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
  // 1. deepseek-monitor-tui config (same machine)
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
  // 1. codex CLI auth file
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

  // 2. pi chatgpt-limit config
  const piCfgPath = `${home}/.pi/extensions/pi-chatgpt-limit.json`;
  const piCfg = parseJsonFile(piCfgPath);
  if (piCfg?.openai_refresh_token) {
    console.log(`[config] Auto-discovered OpenAI tokens from ${piCfgPath}`);
  }

  return null;
}

// ── Main loader ──

export function loadConfig(): ServerConfig {
  // Config file resolution order:
  //   1. MARBLE_CONFIG_FILE env var (explicit path, e.g. /app/data/server.config.json)
  //   2. config.json / config.jsonc in server directory (local dev)
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
      ui: {
        ...asObject(fileCfg.ui),
        ...asObject(parsed.ui),
      },
      public: {
        ...asObject(fileCfg.public),
        ...asObject(parsed.public),
      },
      hidden_entry: {
        ...asObject(fileCfg.hidden_entry),
        ...asObject(parsed.hidden_entry),
      },
    };
  }

  // Merge: file config overrides auto-discovery
  const deepseek = (fileCfg?.deepseek_token as string) || discoverDeepSeekToken() || '';
  const openaiRefresh =
    (fileCfg?.openai_refresh_token as string) || '';
  const openaiAccount =
    (fileCfg?.openai_account_id as string) || '';
  const interval =
    (fileCfg?.query_interval_seconds as number) || 60;
  const opencodeWsId = (fileCfg?.opencode_workspace_id as string) || '';
  const opencodeCookie = (fileCfg?.opencode_auth_cookie as string) || '';
  const uiCfg = asObject(fileCfg?.ui);
  const authCfg = asObject(fileCfg?.auth);

  // Auto-discover OpenCode Go only if NOT explicitly set in config
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

  // Fallback to env vars
  const dsToken = deepseek || process.env.DEEPSEEK_PLATFORM_TOKEN || '';
  const oaRefresh = finalRefresh || process.env.OPENAI_REFRESH_TOKEN || '';
  const oaAccount = finalAccount || process.env.OPENAI_ACCOUNT_ID || '';
  const authEnabled = parseBoolean(
    authCfg.enabled,
    parseBoolean(process.env.MARBLE_AUTH_ENABLED, false),
  );
  const authPasswordHash =
    (authCfg.password_hash as string | undefined) || process.env.MARBLE_AUTH_PASSWORD_HASH || '';
  const authSessionTtlSeconds = parsePositiveInteger(
    authCfg.session_ttl_seconds,
    parsePositiveInteger(process.env.MARBLE_AUTH_SESSION_TTL_SECONDS, 7 * 24 * 60 * 60),
  );
  const authCookieName =
    (authCfg.cookie_name as string | undefined) || process.env.MARBLE_AUTH_COOKIE_NAME || 'marble_session';
  const authCookieSecure = parseBoolean(
    authCfg.cookie_secure,
    parseBoolean(process.env.MARBLE_AUTH_COOKIE_SECURE, true),
  );
  const customAccent = parseHexColor(
    uiCfg.custom_accent ?? process.env.MARBLE_UI_CUSTOM_ACCENT,
    '#8b5cf6',
  );

  // ── Public Scope config ──
  const publicCfg = asObject(fileCfg?.public);
  const publicMode = (publicCfg.mode as string | undefined) === 'public' ? 'public' : 'lan';
  const publicTrustedProxies: string[] = Array.isArray(publicCfg.trusted_proxies)
    ? publicCfg.trusted_proxies.filter((v): v is string => typeof v === 'string' && v.length > 0)
    : (process.env.MARBLE_PUBLIC_TRUSTED_PROXIES || '').split(',').map(s => s.trim()).filter(Boolean);

  // Validate trusted_proxies: only IP or IP/CIDR entries are accepted.
  // Service names like "caddy" must be replaced with actual container IP/subnet.
  const ipv4CidrPattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(\/\d{1,2})?$/;
  const ipv6CidrPattern = /^[0-9a-f:]+(\/\d{1,3})?$/i;
  for (const proxy of publicTrustedProxies) {
    if (proxy === 'localhost') {
      console.warn(`[config] Warning: trusted_proxies contains "localhost" — this will NOT match Docker container traffic. Use 127.0.0.1 for host-only or the container subnet (e.g., 172.18.0.0/16).`);
    } else if (!ipv4CidrPattern.test(proxy) && !ipv6CidrPattern.test(proxy)) {
      console.warn(`[config] Warning: trusted_proxies entry "${proxy}" is not an IP or CIDR — it will never match. Replace service names like "caddy" with actual IP addresses or subnets.`);
    }
  }

  // ── Hidden entry gate config ──
  const hiddenCfg = asObject(fileCfg?.hidden_entry);
  const hiddenEnabled = parseBoolean(
    hiddenCfg.enabled,
    parseBoolean(process.env.MARBLE_HIDDEN_ENTRY_ENABLED, false),
  );
  const hiddenPath = (typeof hiddenCfg.path === 'string' && hiddenCfg.path.length > 0
    ? hiddenCfg.path
    : process.env.MARBLE_HIDDEN_ENTRY_PATH || '').replace(/^\/+/, '').replace(/\/+$/, '');
  const hiddenRootResponse = (hiddenCfg.root_response === 'redirect' ? 'redirect' : '404') as '404' | 'redirect';

  // Helpful messages
  if (!dsToken) {
    console.warn('[config] DeepSeek token not found.');
    console.warn('  → Create server/config.json with: {"deepseek_token": "your-bearer-token"}');
    console.warn('  → Or install deepseek-monitor-tui (auto-discovered)');
  }
  if (!oaRefresh) {
    console.warn('[config] OpenAI token not found.');
    console.warn('  → Create server/config.json with: {"openai_refresh_token": "...", "openai_account_id": "..."}');
    console.warn('  → Or install codex CLI (auto-discovered from ~/.codex/auth.json)');
  }
  if (!finalOpencodeWsId || !finalOpencodeCookie) {
    console.warn('[config] OpenCode Go credentials not found.');
    console.warn('  → Create server/config.json with: {"opencode_workspace_id": "wrk_...", "opencode_auth_cookie": "..."}');
    console.warn('  → See config.example.jsonc for detailed instructions');
  }
  if (authEnabled && !authPasswordHash) {
    console.warn('[config] Password auth is enabled, but auth.password_hash is missing.');
    console.warn('  → Generate one with: bun -e \'console.log(await Bun.password.hash("change-me"))\'');
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
    public: {
      mode: publicMode,
      trusted_proxies: publicTrustedProxies,
    },
    hidden_entry: {
      enabled: hiddenEnabled && hiddenPath.length > 0,
      path: hiddenPath,
      root_response: hiddenRootResponse,
    },
  };
}
