import type { Snapshot, DeepSeekData, OpenAIData, OpenCodeGoData } from './types';
import {
  snapshot as snapshotStore,
  connected,
  history,
  deepseekData as deepseekStore,
  openaiData as openaiStore,
  opencodeData as opencodeStore,
} from './stores';

const MAX_HISTORY = 120; // 2 min at 1/s

/**
 * Creates an EventSource connection to the backend SSE endpoint.
 * Returns an abort function to close the connection.
 */
export function connectSSE(url: string = '/events'): () => void {
  const es = new EventSource(url);

  es.onopen = () => {
    connected.set(true);
  };

  // ── Snapshot event: CPU, RAM, OpenAI (mock) ──
  es.addEventListener('snapshot', (event: MessageEvent) => {
    try {
      const data: Snapshot = JSON.parse(event.data);
      snapshotStore.set(data);

      history.update((prev) => {
        const next = [...prev, data];
        if (next.length > MAX_HISTORY) {
          return next.slice(next.length - MAX_HISTORY);
        }
        return next;
      });
    } catch (err) {
      console.error('[SSE] Failed to parse snapshot:', err);
    }
  });

  // ── DeepSeek event: real API data ──
  es.addEventListener('deepseek', (event: MessageEvent) => {
    try {
      const data: DeepSeekData = JSON.parse(event.data);
      deepseekStore.set(data);
    } catch (err) {
      console.error('[SSE] Failed to parse deepseek data:', err);
    }
  });

  // ── OpenAI event: real API data ──
  es.addEventListener('openai', (event: MessageEvent) => {
    try {
      const data: OpenAIData = JSON.parse(event.data);
      openaiStore.set(data);
    } catch (err) {
      console.error('[SSE] Failed to parse openai data:', err);
    }
  });

  // ── OpenCode Go event: real API data ──
  es.addEventListener('opencode', (event: MessageEvent) => {
    try {
      const data: OpenCodeGoData = JSON.parse(event.data);
      opencodeStore.set(data);
    } catch (err) {
      console.error('[SSE] Failed to parse opencode data:', err);
    }
  });

  es.onerror = () => {
    connected.set(false);
  };

  return () => {
    connected.set(false);
    es.close();
  };
}
