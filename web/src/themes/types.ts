import type { ThemeFamily } from '$lib/theme';

/** CSS bundle identity — aligns with ThemeFamily for current families. */
export type ThemeBundleId = ThemeFamily;

/**
 * Meta for a theme CSS plugin (styles live in sibling .scss; no colors in TS).
 * Presentation / component overrides are out of scope (see TASK-6).
 */
export interface ThemeCssMeta {
  /** Store family id this bundle serves */
  id: ThemeBundleId;
  /** Product label for docs/menus (optional; UI may hardcode until menu is data-driven) */
  label: string;
  /** data-theme values this bundle defines */
  dataThemes: readonly string[];
}