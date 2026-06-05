<script lang="ts">
  import Card from '$components/Card.svelte';
  import ProgressBar from '$components/ProgressBar.svelte';
  import type { OpenCodeGoData } from '$lib/types';

  let {
    label,
    data,
  }: {
    label: string;
    data: OpenCodeGoData | null;
  } = $props();

  function fmtPercent(pct: number): string {
    return `${Math.min(pct, 100).toFixed(0)}%`;
  }

  function fmtTime(ts: number): string {
    if (!ts) return '';
    const d = new Date(ts * 1000);
    const now = Date.now() / 1000;
    const diff = ts - now;
    if (diff < 3600) return `${Math.ceil(diff / 60)}min`;
    if (diff < 86400) return `${Math.ceil(diff / 3600)}h`;
    return d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
</script>

<Card {label}>

  {#if data}
    <div class="windows">
      <!-- Rolling (5h) -->
      <div class="window">
        <div class="window-header">
          <span class="window-label">5h 窗口</span>
          {#if data.rollingResetsAt}
            <span class="window-reset">{fmtTime(data.rollingResetsAt)}</span>
          {/if}
          <span class="window-value">{fmtPercent(data.rollingPercent)}</span>
        </div>
        <ProgressBar value={data.rollingPercent} />
      </div>

      <!-- Weekly -->
      <div class="window">
        <div class="window-header">
          <span class="window-label">周窗口</span>
          {#if data.weeklyResetsAt}
            <span class="window-reset">{fmtTime(data.weeklyResetsAt)}</span>
          {/if}
          <span class="window-value">{fmtPercent(data.weeklyPercent)}</span>
        </div>
        <ProgressBar value={data.weeklyPercent} />
      </div>

      <!-- Monthly -->
      <div class="window">
        <div class="window-header">
          <span class="window-label">月窗口</span>
          {#if data.monthlyResetsAt}
            <span class="window-reset">{fmtTime(data.monthlyResetsAt)}</span>
          {/if}
          <span class="window-value">{fmtPercent(data.monthlyPercent)}</span>
        </div>
        <ProgressBar value={data.monthlyPercent} />
      </div>
    </div>
  {:else}
    <div class="empty">等待 OpenCode Go 数据…</div>
  {/if}
</Card>

<style lang="scss">
  .windows {
    display: flex;
    flex-direction: column;
    gap: var(--card-gap);
  }

  .window {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .window-header {
    display: flex;
    align-items: baseline;
    gap: var(--space-md);
  }

  .window-label {
    font-size: var(--text-md);
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

  .empty {
    text-align: center;
    padding: var(--space-2xl) 0;
    color: var(--text-muted);
    font-size: var(--text-2xl);
    font-family: var(--font-mono);
  }
</style>
