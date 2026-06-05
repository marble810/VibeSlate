<script lang="ts">
  import { onMount } from 'svelte';
  import { deepseekData, openaiData, opencodeData } from '$lib/stores';
  import { connectSSE } from '$lib/sse';
  import type { DeepSeekData, OpenAIData, OpenCodeGoData } from '$lib/types';
  import Footer from './components/Footer.svelte';
  import DeepSeekCard from './widgets/DeepSeekCard.svelte';
  import OpenAICard from './widgets/OpenAICard.svelte';
  import OpenCodeCard from './widgets/OpenCodeCard.svelte';

  let dsData = $state<DeepSeekData | null>(null);
  let oaData = $state<OpenAIData | null>(null);
  let ocData = $state<OpenCodeGoData | null>(null);
  let unsub: (() => void) | null = null;

  deepseekData.subscribe((val) => { dsData = val; });
  openaiData.subscribe((val) => { oaData = val; });
  opencodeData.subscribe((val) => { ocData = val; });

  onMount(() => {
    unsub = connectSSE();
    return () => { unsub?.(); };
  });

  let hasData = $derived(!!dsData || !!oaData || !!ocData);
</script>

<main class="grid">
  {#if hasData}
    {#if dsData}
      <DeepSeekCard label="DeepSeek" data={dsData} />
    {:else}
      <div class="waiting-card">等待 DeepSeek 数据…</div>
    {/if}
    {#if oaData}
      <OpenAICard label="OpenAI" data={oaData} />
    {:else}
      <div class="waiting-card">等待 OpenAI 数据…</div>
    {/if}
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
    padding: 3rem 1rem;
    font-size: 1rem;
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  .waiting-card {
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 1.5rem 0;
    color: var(--text-muted);
    font-size: 0.85rem;
    font-family: var(--font-mono);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    min-height: 120px;
  }
</style>
