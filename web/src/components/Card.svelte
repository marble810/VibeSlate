<script lang="ts">
  interface Props {
    label?: string;
    badge?: () => any;
  }

  let { label, badge, children }: Props = $props();
</script>

<div class="card">
  {#if label}
    <div class="title-row">
      <h3 class="label">{label}</h3>
      {#if badge}
        {@render badge()}
      {/if}
    </div>
  {/if}
  {@render children()}
</div>

<style lang="scss">
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--card-padding, var(--space-lg));
    display: flex;
    flex-direction: column;
    gap: var(--card-gap);
  }

  .title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: var(--space-xs);
  }

  .label {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 500;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
</style>
