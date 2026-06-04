<script lang="ts">
  let { label, value, unit = '%' }: {
    label: string;
    value: number;
    unit?: string;
  } = $props();
</script>

<div class="card">
  <h3 class="label">{label}</h3>
  <div class="value">
    <span class="num">{value.toFixed(1)}</span>
    <span class="unit">{unit}</span>
  </div>
  <div class="bar-track">
    <div
      class="bar-fill"
      style="width: {Math.min(value, 100)}%"
    ></div>
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

  .value {
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
  }

  .num {
    font-size: 2rem;
    font-weight: 700;
    font-family: var(--font-mono);
    color: var(--text);
    line-height: 1;
  }

  .unit {
    font-size: 0.875rem;
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  .bar-track {
    height: 6px;
    background: var(--bg);
    border-radius: 3px;
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 3px;
    transition: width 0.4s ease;
  }
</style>
