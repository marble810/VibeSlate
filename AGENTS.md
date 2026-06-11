# AGENTS.md — Marble Panel

- 禁止 Tailwind / Windi / UnoCSS 等原子化 CSS，用 Svelte `<style lang="scss">` + CSS 变量
- Runtime: Bun（前后端统一），`bun install` / `bun run`，不用 npm/yarn/pnpm
- TypeScript strict，Svelte 5 runes（`$state` `$derived` `$effect`）
- 组件分目录：`widgets/` 业务，`components/` 通用
- UI 实现前必读 `DESIGN.md`；设计规范缺失或模糊时先更新 DESIGN.md 再写 UI
- Docker: Windows 下依赖 WSL，macOS 原生运行；仅用于打镜像/验证容器
- Docker 是统一部署底座，不是 Public Scope 的子模块
- LAN/Public 是 Docker init 时选择的部署模式，不是两套互相分叉的产品
- 日常开发走 `bun run dev`，不依赖 Docker
- Docker 构建/部署源码统一放在 `/docker/` 子目录（Dockerfile、docker-compose*.yml、Caddyfile、Fail2Ban 配置）
- `.dockerignore` 保留在项目根目录（Docker 构建上下文强制要求）
- 运行时生成数据位于 `data/docker/`（gitignored），不在 `/docker/` 内
- 新增 Docker 容器或辅助服务（如 Redis、Postgres）的 compose 定义、Dockerfile、配置一律进 `/docker/`
- 撰写/实行/Review PLAN 均在 `/PLAN` 目录内对对应 Plan 文档操作
- 活跃 Plan 放在 `/PLAN` 根目录；完成、废弃或被 scope 级 Plan 取代的旧 Plan 移到 `/PLAN/Archive/`，不要继续当作当前任务来源
- 每个 Plan 完成验收后必须同步更新 `ROADMAP.md`；若只是部分验收，ROADMAP 要明确已验证项、未验证项和阻断条件，不得把未跑通的 Docker/runtime/human checks 标为完成
