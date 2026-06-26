<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { customAccent, deepseekData, openaiAuthStatus, openaiData, opencodeData, theme } from '$lib/stores';
  import { connectSSE } from '$lib/sse';
  import {
    DEFAULT_CUSTOM_ACCENT,
    applyThemeToDocument,
    normalizeHexColor,
    readStoredTheme,
  } from '$lib/theme';
  import type { ThemeSelection, ThemeTransitionKind } from '$lib/theme';
  import { connectWakeLock } from '$lib/wakeLock';
  import type { DeepSeekData, OpenAIAuthStatus, OpenAIData, OpenCodeGoData } from '$lib/types';
  import Footer from './components/Footer.svelte';
  import DeepSeekCard from './widgets/DeepSeekCard.svelte';
  import OpenAICard from './widgets/OpenAICard.svelte';
  import OpenCodeCard from './widgets/OpenCodeCard.svelte';

  let dsData = $state<DeepSeekData | null>(null);
  let oaData = $state<OpenAIData | null>(null);
  let oaAuth = $state<OpenAIAuthStatus | null>(null);
  let ocData = $state<OpenCodeGoData | null>(null);
  let disconnectSSE: (() => void) | null = null;
  let disconnectWakeLock: (() => void) | null = null;
  let activeSelection = $state<ThemeSelection>(readStoredTheme());
  let activeCustomAccent = $state(DEFAULT_CUSTOM_ACCENT);

  function transitionKindForSelection(
    previous: ThemeSelection,
    next: ThemeSelection,
  ): ThemeTransitionKind {
    return previous.family === next.family ? 'palette' : 'theme';
  }

  function syncTheme(transitionKind: ThemeTransitionKind = 'theme') {
    applyThemeToDocument(activeSelection, activeCustomAccent, transitionKind);
  }

  async function loadUiConfig() {
    try {
      const response = await fetch('/api/ui-config', {
        credentials: 'same-origin',
      });
      if (!response.ok) return;

      const data = await response.json() as { custom_accent?: unknown };
      const configuredAccent = normalizeHexColor(data.custom_accent);
      if (configuredAccent) {
        customAccent.set(configuredAccent);
      }
    } catch {
      // Keep the default custom accent when config cannot be loaded.
    }
  }

  const unsubscribeDeepSeek = deepseekData.subscribe((val) => { dsData = val; });
  const unsubscribeOpenAI = openaiData.subscribe((val) => { oaData = val; });
  const unsubscribeOpenAIAuth = openaiAuthStatus.subscribe((val) => { oaAuth = val; });
  const unsubscribeOpenCode = opencodeData.subscribe((val) => { ocData = val; });
  const unsubscribeTheme = theme.subscribe((val) => {
    const previousSelection = activeSelection;
    activeSelection = val;
    syncTheme(transitionKindForSelection(previousSelection, val));
  });
  const unsubscribeCustomAccent = customAccent.subscribe((val) => {
    activeCustomAccent = val;
    syncTheme('palette');
  });

  onDestroy(() => {
    unsubscribeDeepSeek();
    unsubscribeOpenAI();
    unsubscribeOpenAIAuth();
    unsubscribeOpenCode();
    unsubscribeTheme();
    unsubscribeCustomAccent();
  });

  onMount(() => {
    loadUiConfig();
    disconnectSSE = connectSSE();
    disconnectWakeLock = connectWakeLock();

    return () => {
      disconnectSSE?.();
      disconnectWakeLock?.();
    };
  });

  let hasData = $derived(!!dsData || !!oaData || !!oaAuth || !!ocData);
</script>

<main class="grid">
  {#if hasData}
    {#if dsData}
      <DeepSeekCard label="DeepSeek" data={dsData} />
    {:else}
      <div class="waiting-card">等待 DeepSeek 数据…</div>
    {/if}
    <OpenAICard label="OpenAI" data={oaData} authStatus={oaAuth} />
    {#if ocData}
      <OpenCodeCard label="OpenCode Go" data={ocData} />
    {:else}
      <div class="waiting-card">等待 OpenCode Go 数据…</div>
    {/if}
  {:else}
    <div class="waiting">Waiting for data…</div>
  {/if}
</main>

<Footer />

<style lang="scss">
  .waiting {
    grid-column: 1 / -1;
    text-align: center;
    padding: var(--space-4xl) var(--space-xl);
    font-size: var(--text-3xl);
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  .waiting-card {
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: var(--space-2xl) 0;
    color: var(--text-muted);
    font-size: var(--text-2xl);
    font-family: var(--font-mono);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    min-height: 120px;
  }
</style>
