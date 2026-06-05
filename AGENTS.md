# AGENTS.md — Marble Panel

- 禁止 Tailwind / Windi / UnoCSS 等原子化 CSS，用 Svelte `<style lang="scss">` + CSS 变量
- Runtime: Bun（前后端统一），`bun install` / `bun run`，不用 npm/yarn/pnpm
- TypeScript strict，Svelte 5 runes（`$state` `$derived` `$effect`）
- 组件分目录：`widgets/` 业务，`components/` 通用
- UI 实现前必读 `DESIGN.md`；设计规范缺失或模糊时先更新 DESIGN.md 再写 UI
- Docker: Windows 下依赖 WSL，macOS 原生运行；仅用于打镜像/验证容器
- 日常开发走 `bun run dev`，不依赖 Docker
