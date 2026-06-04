import { writable } from 'svelte/store';
import type { Snapshot } from './types';

/** Latest snapshot received from SSE */
export const snapshot = writable<Snapshot | null>(null);

/** Whether the SSE connection is alive */
export const connected = writable<boolean>(false);

/** Accumulated historical snapshots for sparklines */
export const history = writable<Snapshot[]>([]);
