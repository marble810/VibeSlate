import { writable } from 'svelte/store';
import type { Snapshot, OpenAIData, OpenCodeGoData } from './types';

/** Latest snapshot received from SSE */
export const snapshot = writable<Snapshot | null>(null);

/** Whether the SSE connection is alive */
export const connected = writable<boolean>(false);

/** Accumulated historical snapshots for sparklines */
export const history = writable<Snapshot[]>([]);

/** Latest DeepSeek API data (separate SSE event) */
export const deepseekData = writable<DeepSeekData | null>(null);

/** Latest OpenAI API data (separate SSE event) */
export const openaiData = writable<OpenAIData | null>(null);

/** Latest OpenCode Go data (separate SSE event) */
export const opencodeData = writable<OpenCodeGoData | null>(null);
