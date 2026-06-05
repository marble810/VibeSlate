/**
 * OpenAI Codex usage API client with OAuth token auto-refresh.
 *
 * Token flow:
 *   1. User puts refresh_token + account_id in config.json
 *      (extracted once from ~/.codex/auth.json)
 *   2. Server calls auth.openai.com/oauth/token to get access_token
 *   3. Server calls chatgpt.com/backend-api/wham/usage with access_token
 *   4. When access_token expires, refresh_token is used again
 *   5. New refresh_token (rotated) is logged for manual config update
 *
 * This does NOT require codex CLI to be installed — pure HTTP.
 */

import type { OpenAIData, WhamUsageResponse } from './types';

// ── OAuth constants (from codex-rs source) ──

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const TOKEN_URL = 'https://auth.openai.com/oauth/token';
const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';

// ── Token state (in-memory, survives across calls in same process) ──

interface TokenState {
  accessToken: string;
  accountId: string;
  refreshToken: string; // latest (rotated) refresh token
  expiresAt: number; // epoch ms
}

let tokenState: TokenState | null = null;

/**
 * Try to auto-save a rotated refresh token back to config.json.
 * Only saves if the config file already exists (won't create one).
 */
function autoSaveRefreshToken(newToken: string) {
  const configDir = new URL('..', import.meta.url).pathname;
  const paths = [`${configDir}/config.json`, `${configDir}/config.jsonc`];

  for (const p of paths) {
    if (!existsSync(p)) continue;
    try {
      const raw = readFileSync(p, 'utf-8');
      // Replace the openai_refresh_token value (handles both plain and JSONC)
      const updated = raw.replace(
        /"openai_refresh_token"\s*:\s*"[^"]*"/,
        `"openai_refresh_token": "${newToken}"`,
      );
      if (updated !== raw) {
        writeFileSync(p, updated, 'utf-8');
        console.log(`[openai]   ✓ Updated ${p}`);
        return;
      }
    } catch {
      // Can't write — not critical
    }
  }
  // Fallback: print for manual update
  console.warn(`[openai]   ⚠ Could not auto-save. New token: "${newToken}"`);
}

/**
 * Exchange refresh_token for a new access_token.
 * Returns the new tokens. Also logs if refresh_token was rotated.
 */
async function refreshToken(
  refreshToken: string,
): Promise<{ access_token: string; refresh_token: string; account_id: string } | null> {
  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    if (resp.status === 401) {
      console.error('[openai] Refresh token rejected (401) — token expired or revoked');
    } else {
      console.error(`[openai] Token refresh HTTP ${resp.status}: ${body.slice(0, 200)}`);
    }
    return null;
  }

  const data = await resp.json();

  // Detect rotated refresh_token
  if (data.refresh_token && data.refresh_token !== refreshToken) {
    console.warn(
      '[openai] Refresh token rotated — auto-saving to config.json',
    );
    // Try to auto-save to known config paths
    autoSaveRefreshToken(data.refresh_token);
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken,
    account_id: data.account_id || '',
  };
}

/** Fetch usage data from /backend-api/wham/usage. */
async function fetchUsage(accessToken: string, accountId: string): Promise<WhamUsageResponse | null> {
  const resp = await fetch(USAGE_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'ChatGPT-Account-Id': accountId,
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (resp.status === 401 || resp.status === 403) {
    throw new Error('AUTH_EXPIRED');
  }

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`wham/usage HTTP ${resp.status}: ${body.slice(0, 200)}`);
  }

  return resp.json();
}

/**
 * Main entry: get OpenAI usage data, refreshing tokens as needed.
 *
 * @param initialRefreshToken - stored in config.json
 * @param initialAccountId    - stored in config.json (fallback if not in token response)
 */
export async function fetchOpenAIData(
  initialRefreshToken: string,
  initialAccountId: string,
): Promise<OpenAIData | null> {
  if (!initialRefreshToken) return null;

  try {
    // Use the latest refresh token (may have been rotated since startup)
    const currentRefreshToken = tokenState?.refreshToken || initialRefreshToken;

    // Refresh token if needed (first call or expired)
    if (!tokenState || Date.now() > tokenState.expiresAt - 60_000) {
      const fresh = await refreshToken(currentRefreshToken);
      if (!fresh) return null;

      tokenState = {
        accessToken: fresh.access_token,
        accountId: fresh.account_id || initialAccountId,
        refreshToken: fresh.refresh_token, // track rotated token
        // Assume 1h expiry, refresh 1min before
        expiresAt: Date.now() + 59 * 60_000,
      };
    }

    // Fetch usage
    const usage = await fetchUsage(tokenState.accessToken, tokenState.accountId);
    if (!usage) return null;

    return mapUsageResponse(usage);
  } catch (err) {
    if (err instanceof Error && err.message === 'AUTH_EXPIRED') {
      // Token expired mid-request, clear state for next retry
      tokenState = null;
      console.warn('[openai] Access token expired, will refresh on next cycle');
    } else {
      console.error('[openai] Fetch failed:', err instanceof Error ? err.message : err);
    }
    return null;
  }
}

/** Map raw WHAM response to our simplified data model. */
function mapUsageResponse(raw: WhamUsageResponse): OpenAIData {
  const primary = raw.rate_limit?.primary_window;
  const secondary = raw.rate_limit?.secondary_window;
  const credits = raw.credits;

  return {
    planType: raw.plan_type || 'unknown',
    primaryUsedPercent: primary?.used_percent ?? 0,
    primaryResetsAt: primary?.reset_at ?? 0,
    secondaryUsedPercent: secondary?.used_percent ?? 0,
    secondaryResetsAt: secondary?.reset_at ?? 0,
    hasCredits: credits?.has_credits ?? false,
    creditBalance: credits?.balance ?? '0',
    limitReached: raw.rate_limit?.limit_reached ?? false,
    ts: Math.floor(Date.now() / 1000),
  };
}
