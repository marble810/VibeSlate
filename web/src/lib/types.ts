// ── Provider data types ──

export type WakeLockStatus = 'unsupported' | 'requesting' | 'active' | 'released' | 'denied';

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
