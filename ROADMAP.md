# ROADMAP.md — Marble Panel

## Phase 1 — 骨架 ✅

- [x] 项目结构 (server/ + web/)
- [x] Bun.serve + SSE + mock 数据
- [x] Vite + Svelte 5 + bits-ui + SCSS
- [x] 4 张卡片: CPU, RAM, DeepSeek, OpenAI
- [x] Dockerfile + docker-compose
- [x] `bun run dev` 脚本 (Bun.spawn 双进程)

## Phase 2 — UI ✅

- [x] `Trendline.svelte` 纯 SVG 组件 (Catmull-Rom 曲线 + 柱状图)
- [x] bits-ui `Progress.Root` 替换手写进度条
- [x] 响应式 Grid: 1 → 2 → 4 列
- [x] 0 warning 构建

## Phase 3 — 设计系统 ✅

- [x] `Card.svelte` 统一卡片容器
- [x] `ProgressBar.svelte` 统一进度条
- [x] 移除 hover 样式 (Kiosk 规则)
- [x] 统一 accent 颜色

## Phase 4 — 真实数据 ✅

- [x] **DeepSeek**: Platform API (余额 + 30 天柱状图 + 月用量)
- [x] **OpenAI Codex**: WHAM API (5h/周窗口进度条 + Plan 标签)
- [x] **OpenCode Go**: Dashboard HTML scraping (rolling/weekly/monthly)
- [x] SSE 独立事件: `deepseek` / `openai` / `opencode`

## Phase 5 — 认证 UX ✅

- [x] Auto-discovery: 自动扫描 `~/.codex/auth.json`、`~/.config/deepseek-monitor-tui/`
- [x] `config.example.jsonc` 带注释模板
- [x] JSONC 支持 (注释自动剔除)
- [x] 清晰错误提示

## Now — PWA + AI Provider 完善 + Docker Release

### PWA
- [ ] vite-plugin-pwa 已配置 → 生成 manifest + icons
- [ ] Service Worker 离线验证
- [ ] PWA installable 验证

### AI Provider Usage Monitor
- [ ] 各 Provider 卡片 UI 对齐、数据完整性检查
- [ ] 连接状态可视化 (connected / disconnected 对每个 provider 单独显示)
- [ ] 空状态文案统一 ("等待 {Provider} 数据…")
- [ ] 错误状态处理 (API 限流、token 过期)

### Docker Release
- [ ] Dockerfile 最终化 (`oven/bun:1-slim` 基座)
- [ ] docker-compose 一键部署
- [ ] config.json volume mount 验证
- [ ] 端口映射、健康检查

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
