<script lang="ts">
  import Card from '$components/Card.svelte';
  import ProgressBar from '$components/ProgressBar.svelte';
  import type { OpenAIData } from '$lib/types';

  let {
    label,
    data,
  }: {
    label: string;
    data: OpenAIData | null;
  } = $props();

  function fmtPercent(pct: number): string {
    return `${Math.min(pct, 100).toFixed(1)}%`;
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
</script>

<Card {label}>
  {#snippet badge()}
    <span class="plan-badge">{data.planType.toUpperCase()}</span>
  {/snippet}

  {#if data}
    <div class="windows">
      <!-- Primary window (5h) -->
      <div class="window">
        <div class="window-header">
          <span class="window-label">5h 窗口</span>
          {#if data.primaryResetsAt}
            <span class="window-reset">重置 {resetLabel(data.primaryResetsAt)}</span>
          {/if}
          <span class="window-value">{fmtPercent(data.primaryUsedPercent)}</span>
        </div>
        <ProgressBar value={data.primaryUsedPercent} />
      </div>

      <!-- Secondary window (weekly) -->
      {#if data.secondaryUsedPercent > 0 || data.secondaryResetsAt}
        <div class="window">
          <div class="window-header">
            <span class="window-label">周窗口</span>
            {#if data.secondaryResetsAt}
              <span class="window-reset">重置 {resetLabel(data.secondaryResetsAt)}</span>
            {/if}
            <span class="window-value">{fmtPercent(data.secondaryUsedPercent)}</span>
          </div>
          <ProgressBar value={data.secondaryUsedPercent} />
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
      <div class="limit-alert">⚠ 限额已用尽</div>
    {/if}
  {:else}
    <div class="empty">等待 OpenAI 数据…</div>
  {/if}
</Card>

<style lang="scss">
  .plan-badge {
    font-size: 0.65rem;
    font-weight: 600;
    font-family: var(--font-mono);
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    padding: 0.15em 0.5em;
    border-radius: var(--radius-sm);
    letter-spacing: 0.03em;
  }

  .windows {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .window {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .window-header {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }

  .window-label {
    font-size: 0.75rem;
    color: var(--text);
  }

  .window-value {
    font-family: var(--font-mono);
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text);
    margin-left: auto;
  }

  .window-reset {
    font-size: 0.65rem;
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  .credits {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .credits-label {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .credits-value {
    font-family: var(--font-mono);
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text);
  }

  .limit-alert {
    text-align: center;
    font-size: 0.8rem;
    color: var(--danger);
    font-weight: 500;
  }

  .empty {
    text-align: center;
    padding: 1.5rem 0;
    color: var(--text-muted);
    font-size: 0.85rem;
    font-family: var(--font-mono);
  }
</style>
