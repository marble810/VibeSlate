<script lang="ts">
  import Card from '$components/Card.svelte';
  import ProgressBar from '$components/ProgressBar.svelte';
  import type { OpenAIAuthStatus, OpenAIData, OpenAILoginStartResponse } from '$lib/types';

  let {
    label,
    data,
    authStatus,
  }: {
    label: string;
    data: OpenAIData | null;
    authStatus: OpenAIAuthStatus | null;
  } = $props();

  let login = $state<OpenAILoginStartResponse | null>(null);
  let authBusy = $state(false);
  let authError = $state('');
  let authState = $derived(authStatus?.state ?? 'not_configured');

  function fmtPercent(pct: number): string {
    return `${Math.min(pct, 100).toFixed(1)}%`;
  }

  /** Convert used percent to remaining percent */
  function toRemaining(used: number): number {
    return Math.max(0, 100 - used);
  }

  function resetLabel(ts: number): string {
    if (!ts) return '';
    const d = new Date(ts * 1000);
    return d.toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function authBadgeLabel(): string | null {
    if (data) return data.planType.toUpperCase();
    if (authStatus?.plan_type) return authStatus.plan_type.toUpperCase();
    if (!authStatus) return null;
    return authStatus.state.replaceAll('_', ' ').toUpperCase();
  }

  function authStateText(): string {
    switch (authState) {
      case 'login_pending':
        return 'Device login pending';
      case 'authenticated':
        return 'Waiting for OpenAI usage data';
      case 'expired_recoverable':
        return 'Codex login needs refresh';
      case 'revoked':
        return 'Codex login was revoked';
      case 'duplicated_auth_detected':
        return 'Another process is using this Codex home';
      case 'codex_app_server_unavailable':
        return 'Codex app-server unavailable';
      case 'not_configured':
      default:
        return 'Codex login required';
    }
  }

  async function startLogin() {
    authBusy = true;
    authError = '';
    try {
      const response = await fetch('/api/openai/auth/login/start', {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('LOGIN_START_FAILED');
      login = await response.json() as OpenAILoginStartResponse;
    } catch {
      authError = 'Login start failed';
    } finally {
      authBusy = false;
    }
  }

  async function cancelLogin() {
    authBusy = true;
    authError = '';
    try {
      await fetch('/api/openai/auth/login/cancel', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(login?.loginId ? { loginId: login.loginId } : {}),
      });
      login = null;
    } catch {
      authError = 'Cancel failed';
    } finally {
      authBusy = false;
    }
  }

  async function logout() {
    authBusy = true;
    authError = '';
    try {
      await fetch('/api/openai/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });
      login = null;
    } catch {
      authError = 'Logout failed';
    } finally {
      authBusy = false;
    }
  }
</script>

<Card {label}>
  {#snippet badge()}
    {@const badgeLabel = authBadgeLabel()}
    {#if badgeLabel}
      <span class="plan-badge">{badgeLabel}</span>
    {/if}
  {/snippet}

  {#if data}
    <div class="windows">
      <!-- Primary window (5h) -->
      <div class="window">
        <div class="window-header">
          <span class="window-label">5h 剩余</span>
          {#if data.primaryResetsAt}
            <span class="window-reset">重置 {resetLabel(data.primaryResetsAt)}</span>
          {/if}
          <span class="window-value">{fmtPercent(toRemaining(data.primaryUsedPercent))}</span>
        </div>
        <ProgressBar value={toRemaining(data.primaryUsedPercent)} />
      </div>

      <!-- Secondary window (weekly) -->
      {#if data.secondaryUsedPercent > 0 || data.secondaryResetsAt}
        <div class="window">
          <div class="window-header">
            <span class="window-label">周剩余</span>
            {#if data.secondaryResetsAt}
              <span class="window-reset">重置 {resetLabel(data.secondaryResetsAt)}</span>
            {/if}
            <span class="window-value">{fmtPercent(toRemaining(data.secondaryUsedPercent))}</span>
          </div>
          <ProgressBar value={toRemaining(data.secondaryUsedPercent)} />
        </div>
      {/if}
    </div>

    {#if data.hasCredits}
      <div class="credits">
        <span class="credits-label">Credits</span>
        <span class="credits-value">{data.creditBalance}</span>
      </div>
    {/if}

    {#if data.limitReached}
      <div class="limit-alert">⚠ 额度已用尽</div>
    {/if}
  {:else}
    <div class="empty auth-empty">
      <div class="auth-title">{authStateText()}</div>
      {#if login}
        <div class="device-code">
          <a class="device-url" href={login.verificationUrl} target="_blank" rel="noreferrer">
            {login.verificationUrl}
          </a>
          <div class="user-code">{login.userCode}</div>
        </div>
      {/if}

      {#if authStatus?.email_redacted}
        <div class="auth-meta">{authStatus.email_redacted}</div>
      {/if}
      {#if authStatus?.last_error_code}
        <div class="auth-meta">{authStatus.last_error_code}</div>
      {/if}
      {#if authError}
        <div class="auth-error">{authError}</div>
      {/if}

      <div class="auth-actions">
        {#if login || authState === 'login_pending'}
          <button class="auth-action" type="button" onclick={cancelLogin} disabled={authBusy}>
            Cancel
          </button>
        {:else if authState === 'authenticated'}
          <button class="auth-action" type="button" onclick={logout} disabled={authBusy}>
            Logout
          </button>
        {:else}
          <button class="auth-action" type="button" onclick={startLogin} disabled={authBusy}>
            Login
          </button>
        {/if}
      </div>
    </div>
  {/if}
</Card>

<style lang="scss">
  .plan-badge {
    font-size: var(--text-md);
    font-weight: 600;
    font-family: var(--font-mono);
    color: var(--badge-text);
    background: var(--badge-bg);
    border: 1px solid var(--badge-border);
    padding: 0.15em 0.5em;
    border-radius: var(--radius-sm);
    letter-spacing: 0;
  }

  .windows {
    display: flex;
    flex-direction: column;
    gap: var(--card-gap);
  }

  .window {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .window-header {
    display: flex;
    align-items: baseline;
    gap: var(--space-md);
  }

  .window-label {
    font-size: var(--text-lg);
    color: var(--text);
  }

  .window-value {
    font-family: var(--font-mono);
    font-size: var(--font-size-data-value);
    font-weight: 600;
    color: var(--text);
    margin-left: auto;
  }

  .window-reset {
    font-size: var(--text-md);
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  .credits {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .credits-label {
    font-size: var(--text-xl);
    color: var(--text-muted);
  }

  .credits-value {
    font-family: var(--font-mono);
    font-size: var(--text-3xl);
    font-weight: 600;
    color: var(--text);
  }

  .limit-alert {
    text-align: center;
    font-size: var(--text-xl);
    color: var(--danger);
    font-weight: 500;
    padding-top: var(--space-lg);
  }

  .empty {
    text-align: center;
    padding: var(--space-2xl) 0;
    color: var(--text-muted);
    font-size: var(--text-2xl);
    font-family: var(--font-mono);
  }

  .auth-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md);
    padding-right: var(--space-md);
    padding-left: var(--space-md);
  }

  .auth-title {
    color: var(--text);
    font-family: var(--font-sans);
    font-size: var(--text-lg);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0;
  }

  .auth-meta,
  .auth-error,
  .device-url {
    max-width: 100%;
    font-size: var(--text-md);
    line-height: 1.5;
  }

  .auth-meta {
    color: var(--text-muted);
  }

  .auth-error {
    color: var(--danger);
  }

  .device-code {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-sm);
    max-width: 100%;
  }

  .device-url {
    color: var(--accent);
    overflow-wrap: anywhere;
  }

  .user-code {
    color: var(--text);
    font-size: var(--text-3xl);
    font-weight: 700;
    letter-spacing: 0;
  }

  .auth-actions {
    display: flex;
    justify-content: center;
  }

  .auth-action {
    min-height: 32px;
    padding: 0 var(--space-xl);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--badge-bg);
    color: var(--badge-text);
    font-family: var(--font-mono);
    font-size: var(--text-md);
  }

  .auth-action:focus-visible {
    outline: 1px solid var(--accent);
    outline-offset: 2px;
  }

  .auth-action:disabled {
    color: var(--text-muted);
    background: transparent;
  }
</style>
