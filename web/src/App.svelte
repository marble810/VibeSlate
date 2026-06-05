<script lang="ts">
  import { onMount } from 'svelte';
  import { snapshot } from '$lib/stores';
  import { connectSSE } from '$lib/sse';
  import type { Snapshot } from '$lib/types';
  import Header from './components/Header.svelte';
  import Footer from './components/Footer.svelte';
  import CpuCard from './widgets/CpuCard.svelte';
  import RamCard from './widgets/RamCard.svelte';
  import DeepSeekCard from './widgets/DeepSeekCard.svelte';
  import OpenAICard from './widgets/OpenAICard.svelte';

  let last = $state<Snapshot | null>(null);
  let unsub: (() => void) | null = null;

  snapshot.subscribe((val) => {
    last = val;
  });

  onMount(() => {
    unsub = connectSSE();
    return () => {
      unsub?.();
    };
  });

  // ── helper: format timestamp ──
  function fmtTs(ts: number): string {
    return new Date(ts * 1000).toLocaleTimeString('zh-CN');
  }
</script>

<Header />

<main class="grid">
  {#if last}
    <CpuCard label="CPU" value={last.cpu} />
    <RamCard label="RAM" value={last.ram} />
    <DeepSeekCard label="DeepSeek" data={last.deepseek} />
    <OpenAICard label="OpenAI" data={last.openai} />
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
