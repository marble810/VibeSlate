<script lang="ts">
  import { connected } from '$lib/stores';

  let isConnected = $state(false);

  connected.subscribe((val) => {
    isConnected = val;
  });
</script>

<footer>
  <div class="status">
    <span class="dot {isConnected ? 'alive' : 'dead'}"></span>
    <span class="label">{isConnected ? 'Connected' : 'Disconnected'}</span>
  </div>
  <span class="version">v0.1.0</span>
</footer>

<style lang="scss">
  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1.5rem;
    border-top: 1px solid var(--border);
    background: var(--surface);
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .dot {
    width: 8px;
    height: 8px;
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

  .label {
    font-family: var(--font-mono);
    font-size: 0.75rem;
  }

  .version {
    font-family: var(--font-mono);
    font-size: 0.7rem;
  }
</style>
