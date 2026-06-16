export const THEME_IDS = ['default', 'custom-accent', 'eink'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME: ThemeId = 'default';
export const THEME_STORAGE_KEY = 'vibeslate:theme';
export const DEFAULT_CUSTOM_ACCENT = '#8b5cf6';

const THEME_META_COLORS: Record<ThemeId, string> = {
  default: '#000000',
  'custom-accent': '#000000',
  eink: '#ffffff',
};
const THEME_REVEAL_CLASS = 'theme-revealing';

type ViewTransition = {
  finished: Promise<void>;
  skipTransition?: () => void;
};

type DocumentWithViewTransition = Document & {
  startViewTransition?: (updateCallback: () => void) => ViewTransition;
};

let appliedTheme: ThemeId | null = null;
let appliedCustomAccent: string | null = null;
let activeReveal:
  | {
      id: number;
      transition: ViewTransition;
    }
  | null = null;
let revealSequence = 0;

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEME_IDS.includes(value as ThemeId);
}

export function readStoredTheme(): ThemeId {
  if (typeof window === 'undefined') return DEFAULT_THEME;

  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeId(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toLowerCase() : null;
}

export function persistTheme(themeId: ThemeId): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, themeId);
  } catch {
    // Storage can be unavailable in private mode or locked-down PWA contexts.
  }
}

function shouldReduceMotion(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function commitTheme(themeId: ThemeId, normalizedAccent: string): void {
  document.documentElement.dataset.theme = themeId;
  document.documentElement.style.setProperty('--custom-accent', normalizedAccent);
  appliedTheme = themeId;
  appliedCustomAccent = normalizedAccent;

  const metaThemeColor = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );
  if (metaThemeColor) {
    metaThemeColor.content = THEME_META_COLORS[themeId];
  }
}

export function applyThemeToDocument(
  themeId: ThemeId,
  customAccent = DEFAULT_CUSTOM_ACCENT,
): void {
  if (typeof document === 'undefined') return;

  const normalizedAccent = normalizeHexColor(customAccent) ?? DEFAULT_CUSTOM_ACCENT;
  const shouldAnimate =
    appliedTheme !== null
    && (themeId !== appliedTheme || normalizedAccent !== appliedCustomAccent);

  const transitionDocument = document as DocumentWithViewTransition;

  if (shouldAnimate && !shouldReduceMotion() && transitionDocument.startViewTransition) {
    const root = document.documentElement;
    if (activeReveal) {
      activeReveal.transition.skipTransition?.();
      activeReveal = null;
      root.classList.remove(THEME_REVEAL_CLASS);
    }

    const revealId = ++revealSequence;
    root.classList.add(THEME_REVEAL_CLASS);

    try {
      const transition = transitionDocument.startViewTransition(() => {
        commitTheme(themeId, normalizedAccent);
      });
      activeReveal = {
        id: revealId,
        transition,
      };
      void transition.finished
        .catch(() => undefined)
        .then(() => {
          if (activeReveal?.id !== revealId) return;

          activeReveal = null;
          root.classList.remove(THEME_REVEAL_CLASS);
        });
      return;
    } catch {
      if (activeReveal?.id === revealId) activeReveal = null;
      root.classList.remove(THEME_REVEAL_CLASS);
    }
  }

  commitTheme(themeId, normalizedAccent);
}
