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
  // Try config.json / config.jsonc first
  const configDir = new URL('..', import.meta.url).pathname;
  const cfgPaths = [`${configDir}/config.json`, `${configDir}/config.jsonc`];

  let fileCfg: Record<string, unknown> | null = null;
  for (const p of cfgPaths) {
    fileCfg = parseJsonFile(p);
    if (fileCfg) break;
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

  return {
    deepseek_token: dsToken,
    query_interval_seconds: interval,
    openai_refresh_token: oaRefresh,
    openai_account_id: oaAccount,
    opencode_workspace_id: finalOpencodeWsId,
    opencode_auth_cookie: finalOpencodeCookie,
  };
}
