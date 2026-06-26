/**
 * VibeSlate Theme System
 *
 * Architecture: ThemeFamily → Palette
 *
 * Two peer theme families:
 *   - "default" — dark background, supports palette choice (built-in | custom-color)
 *   - "eink"    — monochrome display, no palette
 *   - "rounded" — Sharp-like dark theme with large corner radius
 *
 * User state is ThemeSelection (persisted as JSON). CSS uses data-theme derived via
 * selectionToDataTheme().
 */

export const THEME_STORAGE_KEY = 'vibeslate:theme';
export const DEFAULT_CUSTOM_ACCENT = '#8b5cf6';

export type ThemeTransitionKind = 'theme' | 'palette';

export const THEME_FAMILIES = ['default', 'eink', 'rounded'] as const;
export type ThemeFamily = (typeof THEME_FAMILIES)[number];

export const DEFAULT_PALETTES = ['built-in', 'custom-color'] as const;
export type DefaultPalette = (typeof DEFAULT_PALETTES)[number];

/** User-facing theme selection — store-level state (family + optional palette). */
export interface ThemeSelection {
  family: ThemeFamily;
  /** Only relevant when family === 'default'. Defaults to 'built-in'. */
  palette?: DefaultPalette;
}

export const DEFAULT_SELECTION: ThemeSelection = {
  family: 'default',
  palette: 'built-in',
};

/** Effective CSS data-theme attribute value (internal mapping from ThemeSelection). */
type DataTheme = 'default' | 'custom-accent' | 'eink' | 'rounded';

/**
 * Map a ThemeSelection to the effective data-theme attribute value.
 */
export function selectionToDataTheme(selection: ThemeSelection): DataTheme {
  if (selection.family === 'eink') return 'eink';
  if (selection.family === 'rounded') return 'rounded';
  return selection.palette === 'custom-color' ? 'custom-accent' : 'default';
}

function normalizeThemeSelection(value: unknown): ThemeSelection {
  if (!value || typeof value !== 'object') return { ...DEFAULT_SELECTION };

  const record = value as Record<string, unknown>;
  const family = record.family;

  if (family === 'eink') {
    return { family: 'eink' };
  }

  if (family === 'rounded') {
    return { family: 'rounded' };
  }

  if (family === 'default') {
    const palette = record.palette;
    if (palette === 'custom-color') {
      return { family: 'default', palette: 'custom-color' };
    }
    return { family: 'default', palette: 'built-in' };
  }

  return { ...DEFAULT_SELECTION };
}

function parseStoredThemeSelection(raw: string): ThemeSelection {
  try {
    return normalizeThemeSelection(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_SELECTION };
  }
}

// ── Storage helpers ──

export function readStoredTheme(): ThemeSelection {
  if (typeof window === 'undefined') return { ...DEFAULT_SELECTION };

  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!stored) return { ...DEFAULT_SELECTION };
    return parseStoredThemeSelection(stored);
  } catch {
    return { ...DEFAULT_SELECTION };
  }
}

export function persistTheme(selection: ThemeSelection): void {
  if (typeof window === 'undefined') return;

  const normalized = normalizeThemeSelection(selection);

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Storage can be unavailable in private mode or locked-down PWA contexts.
  }
}

export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toLowerCase() : null;
}

// ── DOM application ──

const THEME_META_COLORS: Record<DataTheme, string> = {
  default: '#000000',
  'custom-accent': '#000000',
  eink: '#ffffff',
  rounded: '#000000',
};
const THEME_TRANSITION_CLASS = 'theme-fading';

type ViewTransition = {
  finished: Promise<void>;
  skipTransition?: () => void;
};

type DocumentWithViewTransition = Document & {
  startViewTransition?: (updateCallback: () => void) => ViewTransition;
};

let appliedDataTheme: DataTheme | null = null;
let appliedCustomAccent: string | null = null;
let activeTransition:
  | {
      id: number;
      transition: ViewTransition;
    }
  | null = null;
let transitionSequence = 0;

function shouldReduceMotion(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function commitTheme(dataTheme: DataTheme, normalizedAccent: string): void {
  document.documentElement.dataset.theme = dataTheme;
  document.documentElement.style.setProperty('--custom-accent', normalizedAccent);
  appliedDataTheme = dataTheme;
  appliedCustomAccent = normalizedAccent;

  const metaThemeColor = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );
  if (metaThemeColor) {
    metaThemeColor.content = THEME_META_COLORS[dataTheme];
  }
}

/**
 * Apply theme to document from ThemeSelection and optional custom accent.
 */
export function applyThemeToDocument(
  selection: ThemeSelection,
  customAccent = DEFAULT_CUSTOM_ACCENT,
  transitionKind: ThemeTransitionKind = 'theme',
): void {
  if (typeof document === 'undefined') return;

  const dataTheme = selectionToDataTheme(normalizeThemeSelection(selection));
  const normalizedAccent = normalizeHexColor(customAccent) ?? DEFAULT_CUSTOM_ACCENT;
  const shouldAnimate =
    appliedDataTheme !== null
    && (dataTheme !== appliedDataTheme || normalizedAccent !== appliedCustomAccent);

  const transitionDocument = document as DocumentWithViewTransition;

  if (shouldAnimate && !shouldReduceMotion() && transitionDocument.startViewTransition) {
    const root = document.documentElement;
    if (activeTransition) {
      activeTransition.transition.skipTransition?.();
      activeTransition = null;
      root.classList.remove(THEME_TRANSITION_CLASS, 'theme-transition-theme', 'theme-transition-palette');
    }

    const transitionId = ++transitionSequence;
    root.classList.add(THEME_TRANSITION_CLASS, `theme-transition-${transitionKind}`);

    try {
      const transition = transitionDocument.startViewTransition(() => {
        commitTheme(dataTheme, normalizedAccent);
      });
      activeTransition = {
        id: transitionId,
        transition,
      };
      void transition.finished
        .catch(() => undefined)
        .then(() => {
          if (activeTransition?.id !== transitionId) return;

          activeTransition = null;
          root.classList.remove(THEME_TRANSITION_CLASS, 'theme-transition-theme', 'theme-transition-palette');
        });
      return;
    } catch {
      if (activeTransition?.id === transitionId) activeTransition = null;
      root.classList.remove(THEME_TRANSITION_CLASS, 'theme-transition-theme', 'theme-transition-palette');
    }
  }

  commitTheme(dataTheme, normalizedAccent);
}