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

// ── OpenAI Codex app-server usage and auth types ──

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

export type OpenAIAuthState =
  | 'not_configured'
  | 'login_pending'
  | 'authenticated'
  | 'expired_recoverable'
  | 'revoked'
  | 'duplicated_auth_detected'
  | 'codex_app_server_unavailable';

export interface OpenAIAuthStatus {
  state: OpenAIAuthState;
  email_redacted: string | null;
  plan_type: string | null;
  last_success_at: number | null;
  last_error_code: string | null;
  auth_json_hash: string | null;
  ts: number;
}

export interface OpenAILoginStartResponse {
  type: 'chatgptDeviceCode';
  loginId: string;
  verificationUrl: string;
  userCode: string;
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
