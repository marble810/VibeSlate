export type JsonRpcId = number;

export interface JsonRpcRequest {
  method: string;
  id: JsonRpcId;
  params?: unknown;
}

export interface JsonRpcNotification {
  method: string;
  params?: unknown;
}

export interface JsonRpcSuccess {
  id: JsonRpcId;
  result: unknown;
}

export interface JsonRpcFailure {
  id: JsonRpcId;
  error: {
    code?: number;
    message?: string;
    data?: unknown;
  };
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure;
export type JsonRpcMessage = JsonRpcResponse | JsonRpcNotification;

export interface CodexAccount {
  type: 'apiKey' | 'chatgpt' | 'amazonBedrock';
  email?: string;
  planType?: string;
}

export interface GetAccountResponse {
  account: CodexAccount | null;
  requiresOpenaiAuth: boolean;
}

export interface LoginAccountResponse {
  type: 'apiKey' | 'chatgpt' | 'chatgptDeviceCode' | 'chatgptAuthTokens';
  loginId?: string;
  verificationUrl?: string;
  userCode?: string;
  authUrl?: string;
}

export interface CancelLoginAccountResponse {
  status: 'canceled' | 'notFound';
}

export interface CreditsSnapshot {
  hasCredits: boolean;
  unlimited: boolean;
  balance: string | null;
}

export interface RateLimitWindow {
  usedPercent: number;
  windowDurationMins: number | null;
  resetsAt: number | null;
}

export interface RateLimitSnapshot {
  limitId: string | null;
  limitName: string | null;
  primary: RateLimitWindow | null;
  secondary: RateLimitWindow | null;
  credits: CreditsSnapshot | null;
  individualLimit: unknown | null;
  planType: string | null;
  rateLimitReachedType: string | null;
}

export interface GetAccountRateLimitsResponse {
  rateLimits: RateLimitSnapshot;
  rateLimitsByLimitId: Record<string, RateLimitSnapshot | undefined> | null;
}

export interface AccountLoginCompletedNotification {
  loginId: string | null;
  success: boolean;
  error: string | null;
}
