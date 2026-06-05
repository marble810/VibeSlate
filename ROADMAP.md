# ROADMAP.md — Marble Panel

## Now — Phase 1 骨架 ✅

- [x] 初始化项目结构（server/ + web/）
- [x] Backend: Bun.serve + SSE + mock 随机数据
- [x] Frontend: Vite + Svelte 5 + bits-ui + SCSS
- [x] SSE 客户端连接，数据渲染到页面
- [x] Dockerfile + docker-compose（`oven/bun:1-slim` 基座）
- [x] `bun run` scripts（dev / build / preview / docker）

## Phase 2 — UI 完善

- [ ] bits-ui 组件封装
- [ ] 响应式网格布局
- [ ] 纯 SVG 趋势线

## Phase 3 — PWA

- [ ] vite-plugin-pwa 配置
- [ ] manifest + icons
- [ ] Service Worker 离线缓存

## Phase 4 — 真实数据

- [ ] 替换 mock 为真实 DeepSeek / OpenAI API
- [ ] API key 环境变量配置

## Future

### HTTPS 支持
- [ ] docker-compose 加入 Caddy 作为 TLS 终结
- [ ] Let's Encrypt 自动证书 + 续期
- [ ] Bun 服务保持 HTTP，零改动
- [ ] 短期不需要——mock/内网部署阶段裸 HTTP 即可

### 镜像极致瘦身
- [ ] `bun build --compile` 编译 backend 为自包含二进制
- [ ] Docker 基座从 `oven/bun:1-slim`（~120MB）切到 `scratch`（~70MB）
- [ ] 验证静态文件路径、无 shell 调试方案
- [ ] 短期不需要——镜像体积敏感时再实现
