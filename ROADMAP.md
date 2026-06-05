# ROADMAP.md — Marble Panel

## Milestones ✅

| # | 里程碑 | 产出 |
|---|---|---|
| M1 | 骨架 | Bun.serve + SSE + Vite + Svelte 5 + bits-ui，4 张卡片，`bun run dev` |
| M2 | UI | Trendline 纯 SVG、Progress.Root、响应式 Grid 1→2→4 列 |
| M3 | 设计系统 | Card.svelte / ProgressBar.svelte 统一组件，Kiosk 无 hover，accent 紫色统一 |
| M4 | 真实数据 | DeepSeek Platform API + OpenAI WHAM + OpenCode Go scraping，独立 SSE 事件 |
| M5 | 认证 UX | Auto-discovery、config.example.jsonc、JSONC 支持 |

---

## Phase 6 — PWA ✅

### 图标 & Manifest
- [x] 生成 192×192 + 512×512 PNG 图标（nearest-neighbor 采样自 design/logo.png）
- [x] 添加 `maskable` 图标支持 Android adaptive icons
- [x] 补充 `apple-touch-icon` link（180×180）
- [x] `theme_color` / `background_color` → `#000000` 对齐 CSS `--bg`

### Service Worker
- [x] `autoUpdate` 模式：SW 静默更新，`skipWaiting()` + `clientsClaim()`
- [x] Footer 添加 SW 状态指示（active / updated / registering）
- [x] 验证 precache 覆盖所有关键静态资源（15 entries, 含全部图标+CSS+JS）
- [ ] 离线可用性验证（断网后页面可加载 — 需浏览器实测）

### PWA Installable
- [ ] Lighthouse PWA 审计（需浏览器实测）
- [ ] Chrome / Edge "Install" 可触发（需浏览器实测）
- [ ] `display: standalone` 无浏览器 chrome（需浏览器实测）

---

## Phase 7 — Docker Release

### Dockerfile
- [ ] 基座 `oven/bun:1-slim`（两阶段：frontend build → runtime）
- [ ] `config.json` 排除在镜像外（volume mount）
- [ ] 保留 `config.example.jsonc` 在镜像内供参考
- [ ] `HEALTHCHECK` curl `http://localhost:80/`
- [ ] 确保 `WEB_DIST` 路径容器内正确：`/app/web/dist`

### docker-compose
- [ ] `config.json` volume mount: `./server/config.json:/app/server/config.json:ro`
- [ ] `restart: unless-stopped`
- [ ] docker-compose 层 healthcheck
- [ ] 端口：`3000:80`

### `.dockerignore`
- [ ] 排除 `*.md`、`server/config.json`、`.git`、`node_modules/`、`bun.lock`

### 验证
- [ ] `docker compose up --build` 启动成功
- [ ] `http://localhost:3000` 页面正常 + SSE 连接
- [ ] config volume mount 生效（修改宿主机 config 重启生效）
- [ ] PWA installable 在容器部署下仍可用

---

## Phase 8 — AI Provider UI Polish

### 卡片完善
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
- [ ] Color Theme 系统（多色主题切换）
- [ ] Custom Fonts 功能
- [ ] 暗色/亮色切换

### HTTPS
- [ ] docker-compose 加 Caddy TLS 终结

### 镜像瘦身
- [ ] `bun build --compile` → `scratch` (~70MB)

### 更多 Provider
- [ ] Claude Code
- [ ] Gemini CLI
- [ ] GitHub Copilot
