<script lang="ts">
  import { onDestroy } from 'svelte';
  import { connected, swStatus, wakeLockStatus, theme } from '$lib/stores';
  import type { ThemeId } from '$lib/theme';
  import { DEFAULT_THEME } from '$lib/theme';
  import type { WakeLockStatus } from '$lib/types';
  import EinkCheckIcon from './EinkCheckIcon.svelte';
  import EinkCrossIcon from './EinkCrossIcon.svelte';
  import FooterBrandMenu from './FooterBrandMenu.svelte';

  let isConnected = $state(false);
  let swState = $state('unsupported');
  let wakeState = $state<WakeLockStatus>('unsupported');
  let currentTheme = $state<ThemeId>(DEFAULT_THEME);

  const isEink = $derived(currentTheme === 'eink');

  const pwaReady = $derived(swState === 'active' || swState === 'updated');
  const pwaLabel = $derived(
    !pwaReady
      ? 'NOT-PWA'
      : wakeState === 'active'
        ? 'PWA-AWAKE'
        : 'PWA',
  );

  const unsubscribeConnected = connected.subscribe((val) => { isConnected = val; });
  const unsubscribeSwStatus = swStatus.subscribe((val) => { swState = val; });
  const unsubscribeWakeLockStatus = wakeLockStatus.subscribe((val) => { wakeState = val; });
  const unsubscribeTheme = theme.subscribe((val) => { currentTheme = val; });

  onDestroy(() => {
    unsubscribeConnected();
    unsubscribeSwStatus();
    unsubscribeWakeLockStatus();
    unsubscribeTheme();
  });
</script>

<footer>
  <div class="status">
    {#if isEink}
      <span class="status-icon">
        {#if isConnected}
          <EinkCheckIcon size="10px" />
        {:else}
          <EinkCrossIcon size="10px" />
        {/if}
      </span>
    {:else}
      <span class="dot {isConnected ? 'alive' : 'dead'}"></span>
    {/if}
    <span class="label">{isConnected ? 'Connected' : 'Disconnected'}</span>
  </div>
  <FooterBrandMenu />
  <div class="pwa-status">
    <span class="label">{pwaLabel}</span>
    <span
      class="sw-dot"
      class:not-pwa={!pwaReady}
      class:pwa-sleep={pwaReady && wakeState !== 'active'}
      class:pwa-awake={pwaReady && wakeState === 'active'}
    ></span>
  </div>
</footer>

<style lang="scss">
  footer {
    position: relative;
    padding: var(--space-xl) var(--space-3xl);
    padding-bottom: calc(var(--space-xl) + env(safe-area-inset-bottom, 0px));
    border-top: 1px solid var(--border);
    background: var(--surface);
    font-size: var(--text-xl);
    color: var(--text-muted);
  }

  .status {
    position: absolute;
    left: var(--space-xl);
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  @keyframes blink {
    0%, 49% { opacity: 1; }
    50%, 100% { opacity: 0; }
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    transition: background 0.3s;

    &.alive {
      background: var(--success);
      box-shadow: var(--status-glow-connected);
      animation: blink 2s infinite;
    }

    &.dead {
      background: var(--danger);
    }
  }

  .status-icon {
    color: var(--text);
    flex-shrink: 0;
  }

  .label {
    font-family: var(--font-mono);
    font-size: var(--text-md);
    text-transform: uppercase;
  }

  .pwa-status {
    position: absolute;
    right: var(--space-xl);
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .sw-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    transition: background 0.3s;

    &.not-pwa {
      background: var(--danger);
    }

    &.pwa-sleep {
      background: var(--warning);
      box-shadow: var(--status-glow-warning);
    }

    &.pwa-awake {
      background: var(--success);
      box-shadow: var(--status-glow-active);
    }
  }
</style>
