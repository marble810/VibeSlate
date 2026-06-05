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
    <table class="data-table">
      <thead>
        <tr>
          <th></th>
          <th class="mono right">1d</th>
          <th class="mono right">30d</th>
        </tr>
      </thead>
      <tbody>
        <!-- Cost -->
        <tr>
          <td class="key">Cost</td>
          <td class="value mono right">¥{data.oneDay.cost.toFixed(4)}</td>
          <td class="value mono right">¥{data.thirtyDays.cost.toFixed(4)}</td>
        </tr>

        <!-- Model breakdowns -->
        {#each Object.keys(data.oneDay.models) as modelKey}
          {#if !isHidden(modelKey)}
            {@const m1 = data.oneDay.models[modelKey]}
            {@const m30 = data.thirtyDays.models[modelKey] ?? { cached: 0, nonCached: 0, output: 0 }}
            <tr class="model-header divider">
              <td class="model-name" colspan="3">{modelLabel(modelKey)}</td>
            </tr>
            <tr>
              <td class="key">Cached</td>
              <td class="value mono right">{fmtToken(m1.cached)}</td>
              <td class="value mono right">{fmtToken(m30.cached)}</td>
            </tr>
            <tr>
              <td class="key">Non-cached</td>
              <td class="value mono right">{fmtToken(m1.nonCached)}</td>
              <td class="value mono right">{fmtToken(m30.nonCached)}</td>
            </tr>
            <tr>
              <td class="key">Output</td>
              <td class="value mono right">{fmtToken(m1.output)}</td>
              <td class="value mono right">{fmtToken(m30.output)}</td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  {:else}
    <div class="empty">等待 DeepSeek 数据…</div>
  {/if}
</Card>

<style lang="scss">
  .data-table {
    width: 100%;
    border-collapse: collapse;

    th {
      font-size: var(--text-md);
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      padding-bottom: var(--space-sm);
    }

    td {
      padding: var(--space-xs) 0;
      vertical-align: middle;
    }
  }

  .key {
    font-size: var(--text-md);
    color: var(--text-muted);
    padding-left: var(--space-sm);
  }

  .value.mono {
    font-family: var(--font-mono);
    font-size: var(--font-size-data-value);
    font-weight: 600;
    color: var(--text);
  }

  .right {
    text-align: right;
  }

  .divider td {
    border-top: 1px solid var(--border);
    padding-top: var(--space-xs);
    padding-bottom: var(--space-xs);
  }

  .model-name {
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--accent);
    padding-left: var(--space-sm);
  }

  .balance {
    font-family: var(--font-mono);
    font-size: var(--text-xl);
    font-weight: 600;
    color: var(--accent);
  }

  .empty {
    text-align: center;
    padding: var(--space-2xl) 0;
    color: var(--text-muted);
    font-size: var(--text-2xl);
    font-family: var(--font-mono);
  }
</style>
