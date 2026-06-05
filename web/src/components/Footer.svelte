<script lang="ts">
  import { connected, swStatus } from '$lib/stores';

  let isConnected = $state(false);
  let swState = $state('unsupported');

  connected.subscribe((val) => { isConnected = val; });
  swStatus.subscribe((val) => { swState = val; });
</script>

<footer>
  <div class="status">
    <span class="dot {isConnected ? 'alive' : 'dead'}"></span>
    <span class="label">{isConnected ? 'Connected' : 'Disconnected'}</span>
  </div>
  <div class="branding">
    <span class="version">marble-panel</span>
    <span class="version-tag">v0.1.0</span>
  </div>
  <div class="pwa-status">
    {#if swState === 'active'}
      <span class="sw-dot active"></span>
      <span class="label">PWA</span>
    {:else if swState === 'updated'}
      <span class="sw-dot updated"></span>
      <span class="label">Updated</span>
    {:else if swState === 'registering'}
      <span class="label sw-label">Installing…</span>
    {/if}
  </div>
</footer>

<style lang="scss">
  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-md) var(--space-xl);
    border-top: 1px solid var(--border);
    background: var(--surface);
    font-size: var(--text-xl);
    color: var(--text-muted);
  }

  .status {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    transition: background 0.3s;

    &.alive {
      background: var(--success);
      box-shadow: 0 0 6px var(--success);
    }

    &.dead {
      background: var(--danger);
    }
  }

  .branding {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .label {
    font-family: var(--font-mono);
    font-size: var(--text-md);
    text-transform: uppercase;
  }

  .version {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    color: var(--text);
  }

  .version-tag {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    opacity: 0.5;
  }

  .pwa-status {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .sw-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;

    &.active {
      background: var(--success);
      box-shadow: 0 0 4px var(--success);
    }

    &.updated {
      background: var(--accent);
      box-shadow: 0 0 4px var(--accent);
    }
  }

  .sw-label {
    opacity: 0.5;
  }
</style>
