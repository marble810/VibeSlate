<script lang="ts">
  import { Progress } from 'bits-ui';

  interface Props {
    value: number;
    max?: number;
    color?: string;
    height?: string;
    radius?: string;
  }

  let {
    value,
    max = 100,
    color = 'var(--accent)',
    height = '2px',
    radius = '1px',
  }: Props = $props();
</script>

<div class="progress-wrap" style="--bar-height: {height}; --bar-radius: {radius}; --bar-color: {color};">
  <Progress.Root {value} {max}>
    <div class="progress-indicator" style="width: {Math.min(value / max * 100, 100)}%"></div>
  </Progress.Root>
</div>

<style lang="scss">
  .progress-wrap {
    width: 100%;
    min-width: 0;
    flex: 1;
  }

  .progress-wrap :global([data-progress-root]) {
    height: var(--bar-height);
    background: var(--bg);
    border-radius: var(--bar-radius);
    overflow: hidden;
  }

  .progress-indicator {
    height: 100%;
    background: var(--bar-color);
    border-radius: var(--bar-radius);
    transition: width 0.4s ease;
  }
</style>
