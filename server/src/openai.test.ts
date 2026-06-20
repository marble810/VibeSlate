import { describe, expect, test } from 'bun:test';
import { normalizeRateLimits } from './openai';
import type { GetAccountRateLimitsResponse, GetAccountResponse, RateLimitSnapshot } from './codex-app-server-protocol';

const fallbackSnapshot: RateLimitSnapshot = {
  limitId: 'fallback',
  limitName: 'Fallback',
  primary: { usedPercent: 25.25, windowDurationMins: 300, resetsAt: 1_800_000_000 },
  secondary: { usedPercent: 10, windowDurationMins: 10_080, resetsAt: 1_800_604_800 },
  credits: { hasCredits: true, unlimited: false, balance: '12.34' },
  individualLimit: null,
  planType: 'plus',
  rateLimitReachedType: null,
};

const codexSnapshot: RateLimitSnapshot = {
  ...fallbackSnapshot,
  limitId: 'codex',
  primary: { usedPercent: 70, windowDurationMins: 300, resetsAt: 1_900_000_000 },
  secondary: null,
  credits: null,
  planType: 'pro',
  rateLimitReachedType: 'rate_limit_reached',
};

describe('OpenAI app-server normalization', () => {
  test('prefers rateLimitsByLimitId.codex over fallback rateLimits', () => {
    const account: GetAccountResponse = {
      account: { type: 'chatgpt', email: 'user@example.com', planType: 'team' },
      requiresOpenaiAuth: false,
    };
    const response: GetAccountRateLimitsResponse = {
      rateLimits: fallbackSnapshot,
      rateLimitsByLimitId: {
        codex: codexSnapshot,
      },
    };

    const normalized = normalizeRateLimits(account, response);

    expect(normalized.planType).toBe('team');
    expect(normalized.primaryUsedPercent).toBe(70);
    expect(normalized.secondaryUsedPercent).toBe(0);
    expect(normalized.hasCredits).toBe(false);
    expect(normalized.limitReached).toBe(true);
  });

  test('falls back to backward-compatible rateLimits payload', () => {
    const account: GetAccountResponse = {
      account: null,
      requiresOpenaiAuth: false,
    };
    const response: GetAccountRateLimitsResponse = {
      rateLimits: fallbackSnapshot,
      rateLimitsByLimitId: null,
    };

    const normalized = normalizeRateLimits(account, response);

    expect(normalized.planType).toBe('plus');
    expect(normalized.primaryUsedPercent).toBe(25.25);
    expect(normalized.secondaryResetsAt).toBe(1_800_604_800);
    expect(normalized.creditBalance).toBe('12.34');
  });
});
