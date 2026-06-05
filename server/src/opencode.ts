/**
 * OpenCode Go usage scraper.
 *
 * OpenCode Go has NO public API. Usage data is rendered server-side by SolidJS
 * and embedded in the dashboard HTML as SSR hydration output.
 *
 * We fetch https://opencode.ai/workspace/{workspaceId}/go and parse:
 *   rollingUsage: { usagePercent, resetInSec }  → 5h window
 *   weeklyUsage:   { usagePercent, resetInSec }  → weekly window
 *   monthlyUsage:  { usagePercent, resetInSec }  → monthly window
 *
 * Credentials needed:
 *   - workspaceId  (from browser URL when visiting the Go dashboard)
 *   - auth cookie  (from browser DevTools → Application → Cookies)
 */

import type { OpenCodeGoData } from './types';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const SCRAPE_TIMEOUT_MS = 10_000;

// ── Regex patterns (SolidJS SSR hydration output) ──

function scrapeNumber(html: string, fieldRe: RegExp): number | null {
  const m = fieldRe.exec(html);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

// Handle both field orderings (usagePercent then resetInSec, or vice versa)
function scrapeWindow(
  html: string,
  windowName: string,
): { usagePercent: number; resetInSec: number } | null {
  // Pattern: windowName:$R[N]={...usagePercent:X...resetInSec:Y...}
  const rePctFirst = new RegExp(
    String.raw`${windowName}:\$R\[\d+\]=\{` +
      String.raw`[^}]*usagePercent:(-?\d+(?:\.\d+)?)` +
      String.raw`[^}]*resetInSec:(-?\d+(?:\.\d+)?)` +
      String.raw`[^}]*\}`,
  );
  const reResetFirst = new RegExp(
    String.raw`${windowName}:\$R\[\d+\]=\{` +
      String.raw`[^}]*resetInSec:(-?\d+(?:\.\d+)?)` +
      String.raw`[^}]*usagePercent:(-?\d+(?:\.\d+)?)` +
      String.raw`[^}]*\}`,
  );

  let m = rePctFirst.exec(html);
  if (m) {
    return { usagePercent: Number(m[1]), resetInSec: Number(m[2]) };
  }
  m = reResetFirst.exec(html);
  if (m) {
    return { usagePercent: Number(m[2]), resetInSec: Number(m[1]) };
  }
  return null;
}

/** Fetch and parse the OpenCode Go dashboard page. */
async function scrapeDashboard(
  workspaceId: string,
  authCookie: string,
): Promise<OpenCodeGoData | null> {
  const url = `https://opencode.ai/workspace/${encodeURIComponent(workspaceId)}/go`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS);

  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html',
        // Pass cookie as-is if it contains 'auth=' (full cookie string),
        // otherwise prepend 'auth='
        Cookie: authCookie.includes('auth=')
          ? authCookie
          : `auth=${authCookie}`,
      },
      signal: controller.signal,
    });

    if (resp.status === 401 || resp.status === 403) {
      throw new Error('AUTH_FAILED');
    }

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(
        `Dashboard HTTP ${resp.status}: ${body.slice(0, 200)}`,
      );
    }

    const html = await resp.text();

    const rolling = scrapeWindow(html, 'rollingUsage');
    const weekly = scrapeWindow(html, 'weeklyUsage');
    const monthly = scrapeWindow(html, 'monthlyUsage');

    if (!rolling && !weekly && !monthly) {
      throw new Error(
        'Dashboard HTML changed — no usage windows found. ' +
          'The page structure may have been updated.',
      );
    }

    const now = Math.floor(Date.now() / 1000);

    return {
      rollingPercent: rolling?.usagePercent ?? 0,
      rollingResetsAt: rolling ? now + rolling.resetInSec : 0,
      weeklyPercent: weekly?.usagePercent ?? 0,
      weeklyResetsAt: weekly ? now + weekly.resetInSec : 0,
      monthlyPercent: monthly?.usagePercent ?? 0,
      monthlyResetsAt: monthly ? now + monthly.resetInSec : 0,
      ts: now,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch OpenCode Go usage. Returns null on failure (server continues without it).
 */
export async function fetchOpenCodeGoData(
  workspaceId: string,
  authCookie: string,
): Promise<OpenCodeGoData | null> {
  if (!workspaceId || !authCookie) return null;

  try {
    const data = await scrapeDashboard(workspaceId, authCookie);
    if (data) {
      console.log(
        `[opencode-go] Updated — 5h: ${data.rollingPercent}%, ` +
          `weekly: ${data.weeklyPercent}%, ` +
          `monthly: ${data.monthlyPercent}%`,
      );
    }
    return data;
  } catch (err) {
    if (err instanceof Error && err.message === 'AUTH_FAILED') {
      console.error('[opencode-go] Auth failed — cookie expired or invalid');
    } else {
      console.error(
        '[opencode-go] Fetch failed:',
        err instanceof Error ? err.message : err,
      );
    }
    return null;
  }
}
