# ROADMAP.md — VibeSlate

## Milestones ✅

| # | 里程碑 | 产出 |
|---|---|---|
| M1 | 骨架 | Bun.serve + SSE + Vite + Svelte 5 + bits-ui，4 张卡片，`bun run dev` |
| M2 | UI | Trendline 纯 SVG、Progress.Root、响应式 Grid 1→2→4 列 |
| M3 | 设计系统 | Card.svelte / ProgressBar.svelte 统一组件，Kiosk 无 hover，accent 紫色统一 |
| M4 | 真实数据 | DeepSeek Platform API + OpenAI WHAM + OpenCode Go scraping，独立 SSE 事件 |
| M5 | 认证 UX | Auto-discovery、config.example.jsonc、JSONC 支持 |
| M6 | PWA | Manifest（fullscreen + maskable icons + apple-touch-icon）、Service Worker（autoUpdate + precache + skipWaiting + clientsClaim）、Footer SW 状态指示、Wake Lock、动态 viewport polyfill、离线可用验证通过、Lighthouse PWA 审计通过、Install 可触发、standalone 无浏览器 chrome |
| M7 | Docker | 单容器部署，`docker compose run --rm init` 初始化，`docker:up`/`docker:smoke` 辅助验证 |

---

## Phase 7 — Docker Deployment

> Docker 是唯一部署方式。用户自行在前端挂反代（Caddy / Nginx / Traefik 等），VibeSlate 不接管反代、不内置 TLS 终止、不内置 Fail2Ban。

- [x] 基座 `oven/bun:1-slim`（两阶段：frontend build → runtime）
- [x] Web dist 复制到 `/app/web/dist`，server 从容器内候选路径读取
- [x] Runtime 端口统一为 `12001`，容器内 `HOST=0.0.0.0`
- [x] `docker:init` 作为 Bun wrapper 调起 `docker compose run --rm init`
- [x] `docker:up` 启动 compose stack（GHCR image + host port mapping）
- [x] `docker:smoke` 验证 app 运行、config 挂载、端口映射
- [x] 所有配置通过本地 `docker/docker-compose.yml` 的 environment 设置，无外部 config 文件

---

## Phase 7A — Security

- [x] 应用层登录页 `/auth/login`（GET 登录页 + POST 验证）、`/auth/logout`、`/auth/status`
- [x] SSE 和静态应用入口 session 校验
- [x] 密码只保存 Argon2id hash（`Bun.password.verify`），session cookie HMAC-SHA256 签名
- [x] Docker 通过 `data/docker/server.config.json` 只读挂载读取 auth 配置
- [ ] 支持首次启动初始化密码与后续修改密码

---

## Phase 8 — AI Provider UI Polish

- [ ] 各 Provider 卡片 UI 对齐、数据完整性检查
- [ ] 连接状态可视化（每个 provider 独立显示 connected / disconnected）
- [ ] 空状态文案统一（"等待 {Provider} 数据…"）
- [ ] 错误状态处理（API 限流、token 过期）

---

## Next — Hardware Monitor (shelved on `feat/hardware-monitor`)

> 硬件监控已出独立 UI 重构 + 架构方案，代码在 `feat/hardware-monitor` 分支。

- [ ] `HardwareCard.svelte` (CPU + RAM 合并卡片，含 GPU 静态信息)
- [ ] Desktop mode: Server 内建 `systeminformation` 直读本机硬件
- [ ] Remote mode: `infoprobe/` 推送程序 + `POST /api/hardware` 端点
- [ ] 独立 `hardware` SSE event，默认 5s 轮询
- [ ] Tray / minimize → 后续上 Tauri thin shell

---

## Future

### 设计系统
- [ ] Optional accent theme presets（blue / green / orange 等预设）
- [ ] Custom Fonts 功能
- [ ] 暗色/亮色切换

### 更多 Provider
- [ ] Claude Code
- [ ] Gemini CLI
- [ ] GitHub Copilot

### 镜像瘦身
- [ ] `bun build --compile` → `scratch` (~70MB)

---

## Phase 9 — Public Alpha / VibeSlate

> 以下为当前已落地的 public alpha 准备项。未做运行验证的部分保持显式未验收状态。

- [x] 公开项目名切换为 `VibeSlate`
- [x] Docker 公开部署改为 `docker/docker-compose.example.yml` 模板复制流程
- [x] 增加纯 shell / PowerShell 的 Codex 凭证打印脚本
- [x] 增加 `docker compose run --rm init` 容器内初始化入口
- [x] Dockerfile OCI metadata 与许可证对齐到 `AGPL-3.0-only`
- [x] `docker:up` 只启动 `app`，`docker:smoke` 同时覆盖 HTTP / HTTPS runtime
- [x] 本机 source-built Docker runtime 验证完成（no-auth baseline、auth login、LAN HTTPS、SSE、`docker:smoke`）
- [x] GitHub repo rename 到 `marble810/vibeslate` 且 visibility 切到 `PUBLIC`
- [x] 增加 GHCR alpha workflow 并确认在新 repo 可见
- [ ] `v0.1.0-alpha.1` tag、GHCR 多架构镜像发布与公开 pull 验证
- [ ] 在 clean checkout 上完成公开仓库 + 公开镜像 Docker-only 全流程实机验证
- [ ] `docker/GetCodexAuthInfo.ps1` 在 Windows / PowerShell Core 上完成人工实跑验证
