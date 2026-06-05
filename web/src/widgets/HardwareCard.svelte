<script lang="ts">
  import Card from '$components/Card.svelte';
  import ProgressBar from '$components/ProgressBar.svelte';
  import Trendline from '$components/Trendline.svelte';

  let {
    cpu,
    ram,
    cpuHistory = [],
    ramHistory = [],
  }: {
    cpu: number;
    ram: number;
    cpuHistory?: number[];
    ramHistory?: number[];
  } = $props();

  let cpuClamped = $derived(Math.min(Math.max(cpu, 0), 100));
  let ramClamped = $derived(Math.min(Math.max(ram, 0), 100));
</script>

<Card label="Hardware">
  <div class="hardware-grid">
    <!-- CPU -->
    <div class="metric">
      <div class="metric-row">
        <h4 class="metric-label">CPU</h4>
        <div class="right-block">
          <div class="top-line">
            <span class="num">{cpu.toFixed(1)}</span>
            <span class="unit">%</span>
          </div>
          <ProgressBar value={cpuClamped} color="var(--accent)" />
        </div>
      </div>
      <Trendline data={cpuHistory} mode="line" color="var(--accent)" min={0} max={100} />
    </div>

    <!-- RAM -->
    <div class="metric">
      <div class="metric-row">
        <h4 class="metric-label">RAM</h4>
        <div class="right-block">
          <div class="top-line">
            <span class="num">{ram.toFixed(1)}</span>
            <span class="unit">%</span>
          </div>
          <ProgressBar value={ramClamped} color="var(--accent)" />
        </div>
      </div>
      <Trendline data={ramHistory} mode="line" color="var(--accent)" min={0} max={100} />
    </div>
  </div>
</Card>

<style lang="scss">
  .hardware-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .metric {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .metric-row {
    display: flex;
    align-items: stretch;
  }

  .metric-label {
    font-size: 0.7rem;
    font-weight: 500;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    flex-shrink: 0;
  }

  .right-block {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    margin-left: auto;
    width: auto;
    gap: 0.05rem;
  }

  .top-line {
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
  }

  .num {
    font-size: 1.25rem;
    font-weight: 700;
    font-family: var(--font-mono);
    color: var(--text);
    line-height: 1;
  }

  .unit {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-family: var(--font-mono);
  }
</style>
