# Progress

## Status
Frontend Phase 1 complete ✅

## Tasks
- [x] Create web/ project structure
- [x] package.json with Vite, Svelte 5, bits-ui, SCSS, PWA deps
- [x] vite.config.ts with proxy, alias, PWA plugin
- [x] svelte.config.js, tsconfig.json
- [x] index.html entry point
- [x] src/main.ts, src/app.scss (global CSS vars + dark theme + grid)
- [x] src/lib/types.ts (types synced with server)
- [x] src/lib/stores.ts (writable stores for snapshot, connection, history)
- [x] src/lib/sse.ts (EventSource helper)
- [x] src/App.svelte (root, SSE connect, 4 widget slots)
- [x] src/components/Header.svelte (title + clock)
- [x] src/components/Footer.svelte (connection dot)
- [x] src/widgets/CpuCard.svelte (progress bar)
- [x] src/widgets/RamCard.svelte (progress bar)
- [x] src/widgets/DeepSeekCard.svelte (tokens + cost)
- [x] src/widgets/OpenAICard.svelte (tokens + cost)
- [x] public/icons/ directory
- [x] bun install (750 packages)
- [x] bun run build ✅ (655ms, 5.33 KB CSS / 34.88 KB JS gzipped)

## Files Changed
- Created 19 files under web/

## Notes
- Uses `$lib` alias via Vite resolve.alias (not SvelteKit)
- All components use Svelte 5 runes ($state, $effect, $props)
- No Tailwind/atomic CSS — all styles are scoped SCSS + CSS vars
- PWA config present but minimal (expand in Phase 3)
- bits-ui installed but not yet used in components (Phase 2)
