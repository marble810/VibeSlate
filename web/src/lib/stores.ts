import { writable } from 'svelte/store';
import type { DeepSeekData, OpenAIAuthStatus, OpenAIData, OpenCodeGoData, WakeLockStatus } from './types';
import {
  DEFAULT_CUSTOM_ACCENT,
  normalizeHexColor,
  persistTheme,
  readStoredTheme,
} from './theme';
import type { ThemeId } from './theme';

export type { ThemeId } from './theme';

/** Whether the SSE connection is alive */
export const connected = writable<boolean>(false);

function createThemeStore() {
  const store = writable<ThemeId>(readStoredTheme());

  return {
    subscribe: store.subscribe,
    set(themeId: ThemeId) {
      persistTheme(themeId);
      store.set(themeId);
    },
  };
}

/** Current theme */
export const theme = createThemeStore();

function createCustomAccentStore() {
  const store = writable<string>(DEFAULT_CUSTOM_ACCENT);

  return {
    subscribe: store.subscribe,
    set(accent: string) {
      const normalized = normalizeHexColor(accent);
      if (!normalized) return;

      store.set(normalized);
    },
  };
}

/** Current custom accent color from server config */
export const customAccent = createCustomAccentStore();

/** Latest DeepSeek API data (separate SSE event) */
export const deepseekData = writable<DeepSeekData | null>(null);

/** Latest OpenAI API data (separate SSE event) */
export const openaiData = writable<OpenAIData | null>(null);

/** Latest OpenAI Codex auth state (separate SSE event) */
export const openaiAuthStatus = writable<OpenAIAuthStatus | null>(null);

/** Latest OpenCode Go data (separate SSE event) */
export const opencodeData = writable<OpenCodeGoData | null>(null);

/** PWA Service Worker status */
export const swStatus = writable<'unsupported' | 'registering' | 'active' | 'updated'>('unsupported');

/** Screen Wake Lock status for kiosk / iOS Home Screen PWA */
export const wakeLockStatus = writable<WakeLockStatus>('unsupported');
