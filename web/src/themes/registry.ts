import type { ThemeCssMeta } from './types';

/**
 * Theme meta registry. CSS is auto-included via themes/register-styles.ts (glob on */index.scss).
 * New theme: 1) themes/<id>/index.scss  2) add row here  3) theme.ts + menu if new family/palette.
 */
export const THEME_CSS_REGISTRY: readonly ThemeCssMeta[] = [
  {
    id: 'default',
    label: 'Sharp',
    dataThemes: ['default', 'custom-accent'],
  },
  {
    id: 'eink',
    label: 'E-INK',
    dataThemes: ['eink'],
  },
  {
    id: 'rounded',
    label: 'Rounded',
    dataThemes: ['rounded'],
  },
] as const;