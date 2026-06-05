<script lang="ts">
  import Card from '$components/Card.svelte';
  import type { DeepSeekData } from '$lib/types';

  let {
    label,
    data,
  }: {
    label: string;
    data: DeepSeekData | null;
  } = $props();

  function fmtToken(n: number): string {
    if (n === 0) return '0';
    const abs = Math.abs(n);
    if (abs >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    return n.toLocaleString();
  }

  function modelLabel(key: string): string {
    const map: Record<string, string> = {
      'deepseek-v4-pro': 'v4-pro',
      'deepseek-v4-flash': 'v4-flash',
      'deepseek_pro': 'v4-pro',
      'deepseek_flash': 'v4-flash',
      'deepseek_chat': 'v4-pro',
      'deepseek_reasoner': 'r1',
      'deepseek-chat & deepseek-reasoner': '',
    };
    return map[key] ?? key;
  }

  function isHidden(key: string): boolean {
    return key === 'deepseek-chat' || key === 'deepseek-reasoner' || key === 'deepseek-chat & deepseek-reasoner';
  }
</script>

<Card {label}>
  {#snippet badge()}
    {#if data}
      <span class="balance mono">¥{data.balance.toFixed(2)}</span>
    {/if}
  {/snippet}
  {#if data}
    <div class="two-col">
      <!-- ═══ 1d ═══ -->
      <div class="time-panel">
        <h4 class="panel-header">[1d]</h4>

        <div class="cost-row">
          <span class="label">Cost</span>
          <span class="value mono">¥{data.oneDay.cost.toFixed(4)}</span>
        </div>

        {#each Object.entries(data.oneDay.models) as [modelKey, breakdown]}
          {#if !isHidden(modelKey)}
            <div class="model-section">
              <h5 class="model-name">{modelLabel(modelKey)}</h5>
              <div class="token-rows">
                <div class="token-row">
                  <span class="token-label">Cached</span>
                  <span class="value mono">{fmtToken(breakdown.cached)}</span>
                </div>
                <div class="token-row">
                  <span class="token-label">Non-cached</span>
                  <span class="value mono">{fmtToken(breakdown.nonCached)}</span>
                </div>
                <div class="token-row">
                  <span class="token-label">Output</span>
                  <span class="value mono">{fmtToken(breakdown.output)}</span>
                </div>
              </div>
            </div>
          {/if}
        {/each}
      </div>

      <!-- ═══ 30d ═══ -->
      <div class="time-panel">
        <h4 class="panel-header">[30d]</h4>

        <div class="cost-row">
          <span class="label">Cost</span>
          <span class="value mono">¥{data.thirtyDays.cost.toFixed(4)}</span>
        </div>

        {#each Object.entries(data.thirtyDays.models) as [modelKey, breakdown]}
          {#if !isHidden(modelKey)}
            <div class="model-section">
              <h5 class="model-name">{modelLabel(modelKey)}</h5>
              <div class="token-rows">
                <div class="token-row">
                  <span class="token-label">Cached</span>
                  <span class="value mono">{fmtToken(breakdown.cached)}</span>
                </div>
                <div class="token-row">
                  <span class="token-label">Non-cached</span>
                  <span class="value mono">{fmtToken(breakdown.nonCached)}</span>
                </div>
                <div class="token-row">
                  <span class="token-label">Output</span>
                  <span class="value mono">{fmtToken(breakdown.output)}</span>
                </div>
              </div>
            </div>
          {/if}
        {/each}
      </div>
    </div>
  {:else}
    <div class="empty">等待 DeepSeek 数据…</div>
  {/if}
</Card>

<style lang="scss">
  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .time-panel {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .panel-header {
    font-size: 0.65rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin: 0 0 0.15rem 0;
  }

  .cost-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 0.3rem;
    border-bottom: 1px solid var(--border);
  }

  .cost-row .label {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .value.mono {
    font-family: var(--font-mono);
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text);
  }

  .model-section {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .model-name {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--accent);
    margin: 0.25rem 0 0.05rem 0;
  }

  .token-rows {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .token-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.05rem 0;
  }

  .token-label {
    font-size: 0.72rem;
    color: var(--text-muted);
  }

  .balance {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--accent);
  }

  .empty {
    text-align: center;
    padding: 1.5rem 0;
    color: var(--text-muted);
    font-size: 0.85rem;
    font-family: var(--font-mono);
  }
</style>
