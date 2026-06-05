/**
 * DeepSeek Platform API client.
 *
 * Uses internal platform.deepseek.com endpoints (same as the browser dashboard).
 * Requires a Bearer token extracted from browser DevTools → Network → Authorization header.
 *
 * Endpoints:
 *   POST /api/v0/users/get_user_summary  — balance + monthly stats
 *   GET  /api/v0/usage/amount?month=X&year=YYYY — daily token/request counts
 *   GET  /api/v0/usage/cost?month=X&year=YYYY   — daily cost data (CNY)
 */

import type {
  UserSummaryResponse,
  UsageAmountResponse,
  UsageCostResponse,
  UsageItem,
  DayUsage,
  ModelTokenBreakdown,
  DeepSeekData,
} from './types';

const BASE = 'https://platform.deepseek.com';

// Browser-like headers to avoid WAF blocking
function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'x-app-version': '20240425.0',
    Referer: 'https://platform.deepseek.com/usage',
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Sec-Ch-Ua': '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"macOS"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
  };
}

/** Fetch user summary (balance + monthly totals). */
async function fetchUserSummary(token: string): Promise<UserSummaryResponse> {
  const resp = await fetch(`${BASE}/api/v0/users/get_user_summary`, {
    headers: headers(token),
  });

  if (resp.status === 401 || resp.status === 403) {
    throw new Error('AUTH_FAILED');
  }

  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('text/html')) {
    throw new Error('WAF blocked request (got HTML instead of JSON)');
  }

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`user_summary HTTP ${resp.status}: ${body.slice(0, 200)}`);
  }

  const json: UserSummaryResponse = await resp.json();
  if (json.code !== 0) {
    throw new Error(`user_summary API error (code ${json.code}): ${json.msg}`);
  }
  return json;
}

/** Fetch daily usage for a given month. month=1-12, year=2026. */
async function fetchUsageAmount(
  token: string,
  year: number,
  month: number,
): Promise<UsageAmountResponse> {
  const url = `${BASE}/api/v0/usage/amount?month=${month}&year=${year}`;
  const resp = await fetch(url, { headers: headers(token) });

  if (resp.status === 401 || resp.status === 403) throw new Error('AUTH_FAILED');
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`usage_amount HTTP ${resp.status}: ${body.slice(0, 200)}`);
  }

  const json: UsageAmountResponse = await resp.json();
  if (json.code !== 0) {
    throw new Error(`usage_amount API error (code ${json.code}): ${json.msg}`);
  }
  return json;
}

/** Fetch daily cost for a given month. */
async function fetchUsageCost(
  token: string,
  year: number,
  month: number,
): Promise<UsageCostResponse> {
  const url = `${BASE}/api/v0/usage/cost?month=${month}&year=${year}`;
  const resp = await fetch(url, { headers: headers(token) });

  if (resp.status === 401 || resp.status === 403) throw new Error('AUTH_FAILED');
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`usage_cost HTTP ${resp.status}: ${body.slice(0, 200)}`);
  }

  const json: UsageCostResponse = await resp.json();
  if (json.code !== 0) {
    throw new Error(`usage_cost API error (code ${json.code}): ${json.msg}`);
  }
  return json;
}

/** Classify a usage type string into cached / non-cached / output. */
function classifyTokenType(type: string): keyof ModelTokenBreakdown {
  const t = type.toLowerCase();
  if (t.includes('cached') || t.includes('cache_hit')) return 'cached';
  if (t.includes('output') || t.includes('completion') || t.includes('generated')) return 'output';
  return 'nonCached';
}

/** Parse a model's UsageItem[] into a typed breakdown. */
function parseModelUsage(usage: UsageItem[]): ModelTokenBreakdown {
  const result: ModelTokenBreakdown = { cached: 0, nonCached: 0, output: 0 };
  for (const item of usage) {
    const amount = parseInt(item.amount, 10) || 0;
    result[classifyTokenType(item.type)] += amount;
  }
  return result;
}

/** Aggregate per-model token breakdowns across an array of days. */
function aggregateDaysTokens(
  days: DayUsage[],
  excludeKeys?: Set<string>,
): Record<string, ModelTokenBreakdown> {
  const result: Record<string, ModelTokenBreakdown> = {};
  for (const day of days) {
    for (const model of day.data) {
      if (excludeKeys?.has(model.model)) continue;
      if (!result[model.model]) {
        result[model.model] = { cached: 0, nonCached: 0, output: 0 };
      }
      for (const item of model.usage) {
        const amount = parseInt(item.amount, 10) || 0;
        result[model.model][classifyTokenType(item.type)] += amount;
      }
    }
  }
  return result;
}

/**
 * Fetch all DeepSeek data and return a unified snapshot.
 * Returns null if token is missing or auth fails.
 *
 * The returned structure splits usage into [1d] (last day) and [30d] (month so far)
 * with per-model token breakdowns (cached / non-cached / output) plus total cost.
 */
export async function fetchDeepSeekData(token: string): Promise<DeepSeekData | null> {
  if (!token) return null;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  try {
    const [summary, usage, cost] = await Promise.all([
      fetchUserSummary(token),
      fetchUsageAmount(token, year, month),
      fetchUsageCost(token, year, month),
    ]);

    // ── Balance: sum all wallets (normal + bonus) ──
    let balance = 0;
    const wallets = [
      ...(summary.data.biz_data.normal_wallets || []),
      ...(summary.data.biz_data.bonus_wallets || []),
    ];
    for (const w of wallets) {
      balance += parseFloat(w.balance) || 0;
    }

    // ── Parse token data ──
    const days = usage.data.biz_data.days || [];
    const hiddenModels = new Set([
      'deepseek-chat & deepseek-reasoner',
      'deepseek-chat',
      'deepseek-reasoner',
    ]);

    // 30d: aggregate all days (month so far)
    const thirtyDaysTokens = days.length > 0 ? aggregateDaysTokens(days, hiddenModels) : {};

    // 1d: last day (today)
    const lastDay = days.length > 0 ? days[days.length - 1] : null;
    const oneDayTokens: Record<string, ModelTokenBreakdown> = {};
    if (lastDay) {
      for (const model of lastDay.data) {
        if (!hiddenModels.has(model.model)) {
          oneDayTokens[model.model] = parseModelUsage(model.usage);
        }
      }
    }

    // ── Parse cost data ──
    const costBizData = cost.data.biz_data || [];

    // 30d cost: sum totals across all biz_data entries (multi-wallet)
    let thirtyDaysCost = 0;
    for (const bizData of costBizData) {
      for (const model of bizData.total) {
        for (const item of model.usage) {
          thirtyDaysCost += parseFloat(item.amount) || 0;
        }
      }
    }

    // 1d cost: sum last day (today) across all biz_data entries
    let oneDayCost = 0;
    for (const bizData of costBizData) {
      const costDays = bizData.days || [];
      if (costDays.length > 0) {
        const lastCostDay = costDays[costDays.length - 1];
        for (const model of lastCostDay.data) {
          for (const item of model.usage) {
            oneDayCost += parseFloat(item.amount) || 0;
          }
        }
      }
    }

    return {
      balance,
      oneDay: {
        cost: oneDayCost,
        models: oneDayTokens,
      },
      thirtyDays: {
        cost: thirtyDaysCost,
        models: thirtyDaysTokens,
      },
      ts: Math.floor(Date.now() / 1000),
    };
  } catch (err) {
    if (err instanceof Error && err.message === 'AUTH_FAILED') {
      console.error('[deepseek] Auth failed — token expired or invalid');
    } else {
      console.error('[deepseek] Fetch failed:', err instanceof Error ? err.message : err);
    }
    return null;
  }
}
