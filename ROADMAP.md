# ROADMAP.md — Marble Panel

> 最后更新: 2026-06-05

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
- [x] 卡片布局: [Label] → [Trendline] → [Value] → [Progress]
- [x] 响应式 Grid: 1 → 2 → 4 列
- [x] 0 warning 构建

## Phase 3 — PWA (icons 跳过)

- [x] `vite-plugin-pwa` 已配置
- [ ] Service Worker 离线验证
- [ ] PWA icons

## Phase 4 — 真实数据 ✅

- [x] **DeepSeek**: Platform API (get_user_summary + usage/amount + usage/cost)
  - Bearer token 认证 + 浏览器 UA 绕过 WAF
  - SSE `deepseek` 事件: 余额 + 30 天柱状图 + 月用量
- [x] **OpenAI Codex**: WHAM API `/backend-api/wham/usage`
  - OAuth refresh_token 自动刷新 + 自动回写 config.json
  - SSE `openai` 事件: 5h/周窗口进度条 + Plan 标签

## Phase 5 — 认证 UX ✅

- [x] Auto-discovery: 自动扫描 `~/.codex/auth.json`、`~/.config/deepseek-monitor-tui/`
- [x] `config.example.jsonc` 带注释模板
- [x] JSONC 支持 (注释自动剔除)
- [x] 清晰错误提示
- [x] Docker volume mount config.json 即可

## Phase 6 — OpenCode Go ✅

- [x] Dashboard HTML scraping: `opencode.ai/workspace/{id}/go`
- [x] 解析 SolidJS SSR hydration: rolling(5h) / weekly / monthly
- [x] SSE `opencode` 事件
- [x] OpenCodeCard.svelte: 三进度条 + 重置倒计时
- [x] Auto-discovery: `~/.config/opencode-bar/opencode-go.json` 等
- [x] Grid `auto-fill` 自适应 1~5 卡片

> 需要手动配置: workspaceId (从 URL) + auth cookie (从浏览器 DevTools)

## Phase 7 — 凭证录入 ✅
- [x] 基础框架已就绪

## Phase 8 — 设计系统 ✅

- [x] `Card.svelte` 提取（统一卡片容器）
- [x] `ProgressBar.svelte` 提取（统一进度条）
- [x] 移除 hover 样式（Kiosk 规则）
- [x] 统一 accent 颜色

## Phase 9 — Hardware 与 Release 架构

### 硬件数据分支结论

#### 采集范围
- [ ] CPU 使用率（`si.currentLoad()`）+ RAM 使用率（`si.mem()`）+ GPU 静态信息（`si.graphics()`: 型号、显存）
- [ ] 后续扩展（disk、network、GPU 动态）放 Future

#### Desktop-only server
- [ ] Server 跑在用户电脑本机，用 `systeminformation` 直接读取 CPU/RAM/GPU
- [ ] 无需外部 agent，Server 内建 poll loop（默认 5s，可配置）
- [ ] 独立 `hardware` SSE event，从 `snapshot` 拆出
- [ ] 发布态用 `bun build --compile` 产出自包含后端 binary，旁挂 `web/dist`

#### Docker/remote server + infoprobe
- [ ] Server 跑在软路由/云主机/Docker，不能依赖容器 sysinfo 代表用户 PC
- [ ] **infoprobe**（`infoprobe/` 目录）在用户电脑上运行，用 `systeminformation` fetch 后推送
- [ ] 配置: `infoprobe/config.json`（`server_url` + `token` + `poll_interval`）
- [ ] 鉴权: Bearer Token
- [ ] 失败策略: 静默重试，console.log 记录，下次照常重试
- [ ] 运行时: Bun（与 Server 保持一致）
- [ ] 独立 `hardware` SSE event，server 只负责缓存与广播

### Desktop Release 分支结论

- [ ] **当前推荐路径：跨部署优先**。保留 Bun server 作为 canonical backend，先完成 desktop mode、local `/setup` `/settings`、compiled Bun release；暂不引入后端框架。
- [ ] **Tray/minimize 需要时再上 Tauri thin shell**。Tauri 只负责 tray/menu bar、close-to-tray、autostart、启动/停止 Bun sidecar、未来 corner mini window；业务数据逻辑仍留在 Bun server，避免双后端。
- [ ] **纯桌面最终形态备选**。如果未来确认 Marble Panel 不再需要 Docker/软路由/云主机部署，可以考虑迁移为 Tauri + Svelte + Rust backend，并让 Bun 从 release 架构中退场。
- [ ] Configure GUI 第一版使用 local web settings，不做原生设置页；配置文件写入 OS 用户配置目录，`GET /api/config` 只返回脱敏状态。

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
