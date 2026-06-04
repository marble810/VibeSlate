# HANDOFF.md — Marble Panel

> 最后更新: 2026-06-05 · Phase 1 完成，待推进 Phase 2

---

## 项目总览

Dashboard 展示平台 · PWA SPA · Bun + Svelte 5 + bits-ui + SCSS · Docker 部署

## 技术栈锁死

- **Runtime**: Bun（前后端统一），`bun install` / `bun run`
- **前端**: Svelte 5 runes（`$state` `$derived` `$effect`），Vite，bits-ui（headless）
- **样式**: SCSS + CSS 变量，**禁止** Tailwind/原子化 CSS
- **后端**: Bun.serve()，零依赖，SSE 推送
- **Docker**: `oven/bun:1-slim` 基座，两阶段构建，单进程
- **平台**: Windows (Docker 走 WSL) / macOS

## 端口

| 进程 | 端口 | 说明 |
|---|---|---|
| Backend | 12001 | Bun SSE + 生产静态文件 serve |
| Frontend | 5173 | Vite dev server, proxy /events → 12001 |
| Docker | 80 | 容器内单端口 |

> 端口选 12001 而非 3001 是因为 Windows Hyper-V 保留了 3000-4000 段。

## 命令

```bash
bun run dev          # 同时启动 server + frontend
bun run dev:server   # 仅后端
bun run dev:web      # 仅前端
bun run build        # 构建前端
bun run docker:up    # Docker 构建 + 启动
```

## Phase 1 产出 (✅ 完成)

```
marble-panel/
├── AGENTS.md              # 项目约束
├── PLAN.md                # 架构计划
├── ROADMAP.md             # 实施路线
├── scripts/dev.ts         # bun run dev 脚本 (Bun.spawn 双进程)
├── package.json           # workspace root + scripts
├── Dockerfile             # 两阶段 (oven/bun:1-slim)
├── docker-compose.yml
│
├── server/
│   ├── src/index.ts       # Bun.serve + SSE + 静态文件 + SPA fallback
│   ├── src/mock.ts        # 随机 Snapshot 生成器 (CPU/RAM/DS/OpenAI)
│   └── src/types.ts       # Snapshot, ProviderUsage
│
├── web/
│   ├── src/App.svelte     # SSE 连接 + 4 widget 卡片布局
│   ├── src/app.scss       # 暗色主题 CSS 变量 + 响应式 grid
│   ├── src/lib/           # sse.ts, stores.ts, types.ts
│   ├── src/components/    # Header, Footer
│   └── src/widgets/       # CpuCard, RamCard, DeepSeekCard, OpenAICard
│
└── .vscode/settings.json
```

## Phase 2 — 待做

- [ ] bits-ui 组件封装到卡片中 (Progress, etc.)
- [ ] 纯 SVG 趋势线 (CPU/RAM 历史)
- [ ] 响应式布局打磨
- [ ] 前端构建验证通过

## Phase 3 — 待做

- [ ] PWA icons (192, 512)
- [ ] Service Worker 离线验证

## Phase 4 — 待做

- [ ] 真实 DeepSeek / OpenAI API 替换 mock

## Future

- [ ] HTTPS: docker-compose 加 Caddy TLS 终结
- [ ] 镜像瘦身: `bun build --compile` → `scratch` (~70MB)

## 已知问题 / 注意事项

- Windows 低端口段被 Hyper-V 占用，后端锁定 12001
- `bun run` 不支持 `&` 后台，用 `scripts/dev.ts` (Bun.spawn) 替代
- bits-ui 已安装但尚未在组件中使用（Phase 2）
- server 需要静默关闭（Ctrl+C 时 Bun.spawn kill 不优雅但不影响开发）
