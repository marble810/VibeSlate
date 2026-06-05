import { writable } from 'svelte/store';
import type { DeepSeekData, OpenAIData, OpenCodeGoData } from './types';

/** Whether the SSE connection is alive */
export const connected = writable<boolean>(false);

/** Latest DeepSeek API data (separate SSE event) */
export const deepseekData = writable<DeepSeekData | null>(null);

/** Latest OpenAI API data (separate SSE event) */
export const openaiData = writable<OpenAIData | null>(null);

/** Latest OpenCode Go data (separate SSE event) */
export const opencodeData = writable<OpenCodeGoData | null>(null);

/** PWA Service Worker status */
export const swStatus = writable<'unsupported' | 'registering' | 'active' | 'updated'>('unsupported');
