<script lang="ts">
  import type { ProviderUsage } from '$lib/types';

  let { label, data }: {
    label: string;
    data: ProviderUsage;
  } = $props();
</script>

<div class="card">
  <h3 class="label">{label}</h3>
  <div class="metrics">
    <div class="metric">
      <span class="metric-label">Tokens</span>
      <span class="metric-value">{data.tokens.toLocaleString()}</span>
    </div>
    <div class="metric">
      <span class="metric-label">Cost</span>
      <span class="metric-value">${data.cost.toFixed(4)}</span>
    </div>
  </div>
</div>

<style lang="scss">
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    transition: border-color 0.2s;

    &:hover {
      border-color: var(--accent-dim);
    }
  }

  .label {
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .metrics {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .metric {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .metric-label {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .metric-value {
    font-family: var(--font-mono);
    font-size: 1rem;
    font-weight: 600;
    color: var(--text);
  }
</style>
