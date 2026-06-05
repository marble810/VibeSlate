export interface ProviderUsage {
  tokens: number;
  cost: number;
}

export interface Snapshot {
  ts: number;
  cpu: number;
  ram: number;
  deepseek: ProviderUsage;
  openai: ProviderUsage;
}

// ── DeepSeek Platform API response types ──

export interface WalletInfo {
  currency: string;
  balance: string;
  token_estimation: string;
}

export interface UserSummaryResponse {
  code: number;
  msg: string;
  data: {
    biz_code: number;
    biz_msg: string;
    biz_data: {
      current_token: number;
      monthly_usage: string;
      total_usage: number;
      normal_wallets: WalletInfo[];
      bonus_wallets: WalletInfo[];
      total_available_token_estimation: string;
      monthly_costs: { currency: string; amount: string }[];
      monthly_token_usage: string;
    };
  };
}

export interface UsageItem {
  type: string;
  amount: string;
}

export interface ModelUsage {
  model: string;
  usage: UsageItem[];
}

export interface DayUsage {
  date: string;
  data: ModelUsage[];
}

export interface UsageAmountData {
  total: ModelUsage[];
  days: DayUsage[];
}

export interface UsageAmountResponse {
  code: number;
  msg: string;
  data: {
    biz_code: number;
    biz_msg: string;
    biz_data: UsageAmountData;
  };
}

export interface UsageCostResponse {
  code: number;
  msg: string;
  data: {
    biz_code: number;
    biz_msg: string;
    biz_data: UsageAmountData[];
  };
}

export interface ModelTokenBreakdown {
  cached: number;
  nonCached: number;
  output: number;
}

export interface TimeSpanUsage {
  cost: number;
  models: Record<string, ModelTokenBreakdown>;
}

export interface DeepSeekData {
  balance: number;
  oneDay: TimeSpanUsage;
  thirtyDays: TimeSpanUsage;
  ts: number;
}

// ── OpenAI Codex WHAM usage types ──

export interface WhamRateLimitWindow {
  used_percent: number;
  limit_window_seconds: number;
  reset_after_seconds: number;
  reset_at: number;
}

export interface WhamUsageResponse {
  user_id: string;
  account_id: string;
  email: string;
  plan_type: string;
  rate_limit: {
    allowed: boolean;
    limit_reached: boolean;
    primary_window: WhamRateLimitWindow | null;
    secondary_window: WhamRateLimitWindow | null;
  };
  credits: {
    has_credits: boolean;
    unlimited: boolean;
    balance: string;
  } | null;
}

export interface OpenAIData {
  planType: string;
  primaryUsedPercent: number;
  primaryResetsAt: number;
  secondaryUsedPercent: number;
  secondaryResetsAt: number;
  hasCredits: boolean;
  creditBalance: string;
  limitReached: boolean;
  ts: number;
}

export interface OpenCodeGoData {
  rollingPercent: number;
  rollingResetsAt: number;
  weeklyPercent: number;
  weeklyResetsAt: number;
  monthlyPercent: number;
  monthlyResetsAt: number;
  ts: number;
}
