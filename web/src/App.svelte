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
    <DeepSeekCard label="DeepSeek" data={dsData} />
    <OpenAICard label="OpenAI" data={oaData} />
    <OpenCodeCard label="OpenCode Go" data={ocData} />
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
</style>
