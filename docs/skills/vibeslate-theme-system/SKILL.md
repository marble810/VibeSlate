---
name: vibeslate-theme-system
description: Use when adding, modifying, or reviewing VibeSlate themes, theme families, palettes, theme menu entries, or theme transition behavior.
version: 1.2.0
---

# VibeSlate Theme System Skill

Use this skill before changing `web/src/lib/theme.ts`, `web/src/themes/**`, `web/src/styles/base/**`, `web/src/app.scss`, `web/src/components/FooterBrandMenu.svelte`, or `DESIGN.md` theme rules.

## Architecture

VibeSlate themes use a two-level model:

1. **ThemeFamily**: top-level display mode, e.g. `default`, `eink`.
2. **Palette**: optional family-local color choice, e.g. Default family's `built-in` and `custom-color`.

Do not add one-off flat top-level theme IDs for color choices. If the display mode is the same and only accent/colors change, add a palette under the existing family.

## CSS layout (TASK-7)

- **Theme = SCSS token bundles** under `web/src/themes/<bundle>/index.scss` (fonts, spacing/gaps, radius, semantic colors).
- **Base** under `web/src/styles/base/` (reset, layout, view transitions only).
- Add `web/src/themes/<id>/index.scss`; styles auto-bundle via `register-styles.ts` (glob). Register meta in `registry.ts`. No per-theme `app.scss` lines.
- **Out of scope for theme CSS**: component structure / presentation swaps (e.g. progress bar → pie chart). Track as TASK-6.

## Current Contract

- Store-level state: `ThemeSelection { family, palette? }`.
- Persistence: `vibeslate:theme` stores JSON `ThemeSelection`.
- CSS: `data-theme` derived via `selectionToDataTheme(selection)`.
- DOM API: `applyThemeToDocument(selection, customAccent?, transitionKind?)`.

## Adding a Theme Family

1. Extend `THEME_FAMILIES` / `ThemeSelection` / `selectionToDataTheme()` in `web/src/lib/theme.ts`.
2. Add `web/src/themes/<name>/index.scss` with full token set for that family’s `data-theme` selector(s).
3. Add entry to `THEME_CSS_REGISTRY` (glob picks up SCSS).
4. Add menu entry in `FooterBrandMenu.svelte`.
5. Update `DESIGN.md`.

## Adding a Palette

1. Keep palette under its family; accent-only palettes can override tokens on an existing `data-theme` block (see `custom-accent` in `sharp/index.scss`).
2. Update `FooterBrandMenu.svelte` (menu stays open on palette select).
3. Use `transitionKind: 'palette'` for short fade.

## Validation

```bash
cd web && npx vite build
```

Also run `git diff --check`. Manual visual testing when interaction changes.