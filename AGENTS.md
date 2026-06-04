# AGENTS.md — Marble Panel

- 禁止 Tailwind / Windi / UnoCSS 等原子化 CSS，用 Svelte `<style lang="scss">` + CSS 变量
- Runtime: Bun（前后端统一），`bun install` / `bun run`，不用 npm/yarn/pnpm
- TypeScript strict，Svelte 5 runes（`$state` `$derived` `$effect`）
- 组件分目录：`widgets/` 业务，`components/` 通用
