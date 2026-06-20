import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { OpenAIProviderConfig } from './config';
import { CodexAppServerManager } from './codex-app-server-manager';
import type {
  AccountLoginCompletedNotification,
  GetAccountRateLimitsResponse,
  GetAccountResponse,
  JsonRpcNotification,
  LoginAccountResponse,
  RateLimitSnapshot,
} from './codex-app-server-protocol';
import { redactEmail, redactSecrets, sha256File } from './secret-redaction';
import type { OpenAIAuthStatus, OpenAIData, OpenAILoginStartResponse } from './types';

export class OpenAICodexProvider {
  private readonly manager: CodexAppServerManager;
  private authStatus: OpenAIAuthStatus;
  private pendingLoginId: string | null = null;

  constructor(private readonly config: OpenAIProviderConfig) {
    const lockPath = join(dirname(config.auth_status_path), 'locks', 'codex-authd.lock');
    this.manager = new CodexAppServerManager({
      codexCliPath: config.codex_cli_path,
      codexHome: config.codex_home,
      lockPath,
    });
    this.manager.onNotification((notification) => this.handleNotification(notification));
    this.authStatus = this.makeStatus('not_configured', null, null, null);
  }

  getAuthStatus(): OpenAIAuthStatus {
    return this.authStatus;
  }

  async refreshAuthStatus(): Promise<OpenAIAuthStatus> {
    try {
      const account = await this.manager.readAccount(true);
      this.updateStatusFromAccount(account);
    } catch (error) {
      this.setUnavailable(error);
    }
    return this.authStatus;
  }

  async fetchOpenAIData(): Promise<OpenAIData | null> {
    try {
      const account = await this.manager.readAccount(true);
      this.updateStatusFromAccount(account);

      if (!account.account || account.account.type !== 'chatgpt') return null;

      const rateLimits = await this.manager.readRateLimits();
      const data = normalizeRateLimits(account, rateLimits);
      this.authStatus = this.makeStatus(
        'authenticated',
        account.account.email ?? null,
        data.planType,
        null,
      );
      this.persistAuthStatus();
      return data;
    } catch (error) {
      this.setAuthError(error);
      return null;
    }
  }

  async startLogin(): Promise<OpenAILoginStartResponse> {
    const response = await this.manager.startLogin();
    if (response.type !== 'chatgptDeviceCode') {
      throw new Error(`Unexpected Codex login response: ${response.type}`);
    }
    assertDeviceCodeResponse(response);

    this.pendingLoginId = response.loginId;
    this.authStatus = this.makeStatus('login_pending', null, null, null);
    this.persistAuthStatus();

    return {
      type: 'chatgptDeviceCode',
      loginId: response.loginId,
      verificationUrl: response.verificationUrl,
      userCode: response.userCode,
    };
  }

  async cancelLogin(loginId?: string | null): Promise<{ status: 'canceled' | 'notFound' | 'noPendingLogin' }> {
    const targetLoginId = loginId || this.pendingLoginId;
    if (!targetLoginId) return { status: 'noPendingLogin' };

    const result = await this.manager.cancelLogin(targetLoginId);
    if (this.pendingLoginId === targetLoginId) this.pendingLoginId = null;
    await this.refreshAuthStatus();
    return { status: result.status };
  }

  async logout(): Promise<void> {
    await this.manager.logout();
    this.pendingLoginId = null;
    this.authStatus = this.makeStatus('not_configured', null, null, null);
    this.persistAuthStatus();
  }

  stop(): void {
    this.manager.stop();
  }

  private handleNotification(notification: JsonRpcNotification): void {
    if (notification.method === 'account/login/completed') {
      const params = notification.params as AccountLoginCompletedNotification;
      if (params.loginId && params.loginId === this.pendingLoginId) this.pendingLoginId = null;
      if (params.success) {
        this.authStatus = this.makeStatus('authenticated', null, null, null);
      } else {
        this.authStatus = this.makeStatus('expired_recoverable', null, null, params.error || 'LOGIN_FAILED');
      }
      this.persistAuthStatus();
    }
  }

  private updateStatusFromAccount(response: GetAccountResponse): void {
    if (this.pendingLoginId) {
      this.authStatus = this.makeStatus('login_pending', null, null, null);
      this.persistAuthStatus();
      return;
    }

    const account = response.account;
    if (!account || response.requiresOpenaiAuth) {
      this.authStatus = this.makeStatus('not_configured', null, null, null);
      this.persistAuthStatus();
      return;
    }

    if (account.type === 'chatgpt') {
      this.authStatus = this.makeStatus(
        'authenticated',
        account.email ?? null,
        account.planType ?? null,
        null,
      );
      this.persistAuthStatus();
      return;
    }

    this.authStatus = this.makeStatus('not_configured', null, null, 'UNSUPPORTED_ACCOUNT_TYPE');
    this.persistAuthStatus();
  }

  private setAuthError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const normalized = message.toLowerCase();
    if (normalized.includes('lock already exists')) {
      this.authStatus = this.makeStatus('duplicated_auth_detected', null, null, 'CODEX_AUTH_LOCKED');
    } else if (normalized.includes('revoked')) {
      this.authStatus = this.makeStatus('revoked', null, null, 'AUTH_REVOKED');
    } else if (normalized.includes('expired') || normalized.includes('auth')) {
      this.authStatus = this.makeStatus('expired_recoverable', null, null, 'AUTH_RECOVERABLE');
    } else {
      this.authStatus = this.makeStatus(
        'codex_app_server_unavailable',
        null,
        null,
        redactSecrets(message).slice(0, 160),
      );
    }
    this.persistAuthStatus();
  }

  private setUnavailable(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const state = message.toLowerCase().includes('lock already exists')
      ? 'duplicated_auth_detected'
      : 'codex_app_server_unavailable';
    this.authStatus = this.makeStatus(state, null, null, redactSecrets(message).slice(0, 160));
    this.persistAuthStatus();
  }

  private makeStatus(
    state: OpenAIAuthStatus['state'],
    email: string | null,
    planType: string | null,
    errorCode: string | null,
  ): OpenAIAuthStatus {
    const now = Math.floor(Date.now() / 1000);
    return {
      state,
      email_redacted: redactEmail(email),
      plan_type: planType,
      last_success_at: state === 'authenticated' ? now : this.authStatus?.last_success_at ?? null,
      last_error_code: errorCode,
      auth_json_hash: authJsonHash(this.config.codex_home),
      ts: now,
    };
  }

  private persistAuthStatus(): void {
    try {
      mkdirSync(dirname(this.config.auth_status_path), { recursive: true });
      writeFileSync(this.config.auth_status_path, JSON.stringify(this.authStatus, null, 2), 'utf-8');
    } catch (error) {
      console.warn(
        `[openai] Failed to persist auth status: ${
          error instanceof Error ? redactSecrets(error.message) : 'unknown error'
        }`,
      );
    }
  }
}

export function normalizeRateLimits(
  accountResponse: GetAccountResponse,
  rateLimitsResponse: GetAccountRateLimitsResponse,
): OpenAIData {
  const snapshot =
    rateLimitsResponse.rateLimitsByLimitId?.codex ||
    rateLimitsResponse.rateLimits;
  return normalizeRateLimitSnapshot(accountResponse, snapshot);
}

export function normalizeRateLimitSnapshot(
  accountResponse: GetAccountResponse,
  snapshot: RateLimitSnapshot,
): OpenAIData {
  const accountPlan =
    accountResponse.account?.type === 'chatgpt' ? accountResponse.account.planType : null;
  const planType = accountPlan || snapshot.planType || 'unknown';
  const primary = snapshot.primary;
  const secondary = snapshot.secondary;
  const credits = snapshot.credits;

  return {
    planType,
    primaryUsedPercent: clampPercent(primary?.usedPercent ?? 0),
    primaryResetsAt: normalizeReset(primary?.resetsAt),
    secondaryUsedPercent: clampPercent(secondary?.usedPercent ?? 0),
    secondaryResetsAt: normalizeReset(secondary?.resetsAt),
    hasCredits: credits?.hasCredits ?? false,
    creditBalance: credits?.balance ?? '0',
    limitReached: snapshot.rateLimitReachedType != null,
    ts: Math.floor(Date.now() / 1000),
  };
}

function assertDeviceCodeResponse(response: LoginAccountResponse): asserts response is LoginAccountResponse & {
  loginId: string;
  verificationUrl: string;
  userCode: string;
} {
  if (!response.loginId || !response.verificationUrl || !response.userCode) {
    throw new Error('Codex device-code login response is missing required fields');
  }
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(value, 100));
}

function normalizeReset(value: number | null | undefined): number {
  if (!value || !Number.isFinite(value)) return 0;
  return Math.floor(value);
}

function authJsonHash(codexHome: string): string | null {
  const authPath = join(codexHome, 'auth.json');
  if (!existsSync(authPath)) return null;

  try {
    if (!statSync(authPath).isFile()) return null;
  } catch {
    return null;
  }
  return sha256File(authPath);
}
