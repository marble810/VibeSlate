import type { Snapshot } from './types';
import { snapshot as snapshotStore, connected, history } from './stores';

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

  es.onerror = () => {
    connected.set(false);
  };

  return () => {
    connected.set(false);
    es.close();
  };
}
