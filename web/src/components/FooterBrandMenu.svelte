<script lang="ts">
  import { onDestroy } from 'svelte';
  import { DropdownMenu } from 'bits-ui';
  import { theme } from '$lib/stores';
  import { DEFAULT_THEME, type ThemeId } from '$lib/theme';
  import EinkCheckIcon from './EinkCheckIcon.svelte';

  let currentTheme = $state<ThemeId>(DEFAULT_THEME);
  const unsubscribeTheme = theme.subscribe((val) => { currentTheme = val; });

  function setTheme(id: ThemeId) {
    theme.set(id);
  }

  onDestroy(() => {
    unsubscribeTheme();
  });
</script>

<div class="brand-menu-wrapper">
  <DropdownMenu.Root>
    <DropdownMenu.Trigger class="brand-trigger">
      <img class="logo" src="/icons/icon-192.png" alt="" />
      <span class="version">vibeslate</span>
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        side="top"
        align="center"
        sideOffset={8}
        class="brand-menu-content"
      >
        <section class="menu-block" aria-labelledby="footer-theme-heading">
          <div id="footer-theme-heading" class="menu-block-title">Theme</div>
          <div class="menu-divider"></div>
          <div class="theme-list">
            <DropdownMenu.Item
              class="brand-menu-item"
              closeOnSelect={false}
              onSelect={() => setTheme('default')}
            >
              <span class="item-main">
                <span class="theme-swatch default"></span>
                <span class="item-label">Default</span>
              </span>
              {#if currentTheme === 'default'}
                <span class="item-check">
                  <EinkCheckIcon size="12px" />
                </span>
              {/if}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              class="brand-menu-item"
              closeOnSelect={false}
              onSelect={() => setTheme('custom-accent')}
            >
              <span class="item-main">
                <span class="theme-swatch custom"></span>
                <span class="item-label">Custom Accent</span>
              </span>
              {#if currentTheme === 'custom-accent'}
                <span class="item-check">
                  <EinkCheckIcon size="12px" />
                </span>
              {/if}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              class="brand-menu-item"
              closeOnSelect={false}
              onSelect={() => setTheme('eink')}
            >
              <span class="item-main">
                <span class="theme-swatch eink"></span>
                <span class="item-label">E-INK</span>
              </span>
              {#if currentTheme === 'eink'}
                <span class="item-check">
                  <EinkCheckIcon size="12px" />
                </span>
              {/if}
            </DropdownMenu.Item>
          </div>
          <div class="menu-divider"></div>
        </section>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
</div>

<style lang="scss">
  .brand-menu-wrapper {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
  }

  .brand-menu-wrapper :global(.brand-trigger) {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-md);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    color: inherit;
    font-family: inherit;
    font-size: inherit;
    line-height: inherit;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    outline: none;
  }

  .brand-menu-wrapper :global(.brand-trigger::before) {
    content: '';
    position: absolute;
    left: -14px;
    right: -14px;
    top: -22px;
    bottom: -8px;
    background: transparent;
  }

  .brand-menu-wrapper :global(.brand-trigger:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: var(--space-xs);
    border-radius: var(--radius-sm);
  }

  .logo {
    width: 16px;
    height: 16px;
    image-rendering: pixelated;
    flex-shrink: 0;
  }

  .version {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    color: var(--text);
  }

  :global(.brand-menu-content) {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--space-lg);
    width: min(88vw, 360px);
    min-width: 280px;
    z-index: 1000;
    box-shadow: var(--shadow-lg);
    transform-origin: bottom center;
    will-change: opacity, transform;
  }

  :global(.brand-menu-content[data-state='open']) {
    animation: brand-menu-slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  :global(.brand-menu-content[data-state='closed']) {
    animation: brand-menu-slide-down 0.3s cubic-bezier(0.7, 0, 0.84, 0) both;
  }

  .menu-block {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .menu-block-title {
    font-family: var(--font-sans);
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--text);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .theme-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .menu-divider {
    height: 1px;
    background: var(--border);
  }

  :global(.brand-menu-item) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 44px;
    gap: var(--space-md);
    padding: var(--space-md);
    font-family: var(--font-mono);
    font-size: var(--text-md);
    color: var(--text-muted);
    cursor: pointer;
    user-select: none;
    outline: none;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }

  :global(.brand-menu-item:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  :global(.brand-menu-item[data-highlighted]) {
    color: var(--text);
    border-color: var(--accent);
  }

  .item-main {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    min-width: 0;
  }

  .item-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-check {
    color: var(--text);
    flex-shrink: 0;
  }

  .theme-swatch {
    position: relative;
    width: 16px;
    height: 16px;
    border: 1px solid var(--border);
    border-radius: 50%;
    flex-shrink: 0;

    &.default {
      background: #8b5cf6;
    }

    &.custom {
      background: var(--custom-accent);
    }

    &.eink {
      overflow: hidden;
      background: none;

      &::before,
      &::after {
        content: '';
        position: absolute;
        top: 0;
        bottom: 0;
        width: 50%;
      }

      &::before {
        left: 0;
        background: #ffffff;
      }

      &::after {
        right: 0;
        background: #000000;
      }
    }
  }

  @keyframes -global-brand-menu-slide-up {
    from {
      opacity: 0;
      transform: translateY(12px);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes -global-brand-menu-slide-down {
    from {
      opacity: 1;
      transform: translateY(0);
    }

    to {
      opacity: 0;
      transform: translateY(12px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.brand-menu-content[data-state='open']),
    :global(.brand-menu-content[data-state='closed']) {
      animation-duration: 1ms;
      transform: none;
    }
  }

</style>
