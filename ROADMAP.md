# ROADMAP.md — Marble Panel

## Milestones ✅

| # | 里程碑 | 产出 |
|---|---|---|
| M1 | 骨架 | Bun.serve + SSE + Vite + Svelte 5 + bits-ui，4 张卡片，`bun run dev` |
| M2 | UI | Trendline 纯 SVG、Progress.Root、响应式 Grid 1→2→4 列 |
| M3 | 设计系统 | Card.svelte / ProgressBar.svelte 统一组件，Kiosk 无 hover，accent 紫色统一 |
| M4 | 真实数据 | DeepSeek Platform API + OpenAI WHAM + OpenCode Go scraping，独立 SSE 事件 |
| M5 | 认证 UX | Auto-discovery、config.example.jsonc、JSONC 支持 |
| M6 | PWA | Manifest（fullscreen + maskable icons + apple-touch-icon）、Service Worker（autoUpdate + precache + skipWaiting + clientsClaim）、Footer SW 状态指示、Wake Lock、动态 viewport polyfill、离线可用验证通过、Lighthouse PWA 审计通过、Install 可触发、standalone 无浏览器 chrome |
| M7 | LAN HTTPS | `mkcert` private CA + `bun run lan:https` + QR code 辅助安装流程，面向自有设备 / 同一局域网 / kiosk PWA |
| M8 | Docker Deployment | 统一 Docker 底座，`docker:init` init-time 选择 LAN/Public；Public mode 优先接入既有反代日志 + Fail2Ban，内置 Caddy 仅作为 reference/fallback profile |

---

## Phase 6B — Deployment Scopes

### LAN Scope — Recommended
- 已定推荐路径：`mkcert` private CA + `bun run lan:https` + QR code 辅助证书安装流程
- 已完成：HTTPS app server 使用 mkcert leaf cert，HTTP bootstrap 只分发公开 root CA / mobileconfig / 安装说明
- 已完成：iOS profile 覆盖 root CA + Web Clip，Android 只安装 root CA cert，PWA 安装交给 Chrome
- 已完成：局域网 URL / 证书 SAN 对齐，支持 hostname 与 LAN IP fallback
- 安全边界：Bun HTTPS 直连 + 可选密码保护；默认不引入反代、fail2ban、隐藏入口
- 约束：仅用于自有设备和可信局域网，不作为公网 TLS 方案，不分发 `rootCA-key.pem`
- 文档：`PLAN/LAN_SCOPE_PLAN.md`、`TESTING_LAN_HTTPS.md`

### Public Scope — Existing Reverse Proxy First
- 路线转向：Public Scope 不再默认实现/拥有公网反代；优先接入用户已有 Caddy / Nginx Proxy Manager / Lucky 等反代入口的真实 IP 日志
- 当前计划：`PLAN/PUBLIC_EXISTING_PROXY_FAIL2BAN_PLAN.md`
- 已完成的一体化 Caddy 加固方案归档为 reference/fallback：`PLAN/Archive/PUBLIC_SCOPE_OPTIMIZATION_PLAN.md`
- 安全边界：既有反代负责公网 TLS、证书、入口端口和 access log；Marble Panel 负责密码验证、trusted proxy real IP resolver、fail2ban 归一化、ban list 执行和 hidden entry
- [x] 密码验证失败日志已接入 Fail2Ban，按 trusted proxy 解析出的真实客户端 IP 写入 ban list
- [x] 隐藏入口作为公网可选混淆层，入口路径和根路径响应均可配置
- [x] 应用只信任来自已知反代 CIDR 的 `X-Forwarded-For` / `X-Real-IP`；Public mode 缺少 trusted proxy 时 fail-closed
- [ ] 登录失败响应改为 HTTP `401`，使 Caddy/NPM/Lucky access log 可稳定识别 bad password
- [ ] 新增 proxy-log adapter，将 Caddy / NPM / Lucky 输入归一化为 `MARBLE_AUTH_FAIL ip=<real-ip> path=/auth/login reason=bad_password source=<provider>`
- [ ] Caddy JSON access log 接入：优先读取 `request.client_ip`，fallback `request.remote_ip`
- [ ] Nginx Proxy Manager access log 接入：读取 `/data/logs/proxy-host-*_access.log`，解析 `[Client <ADDR>]`
- [ ] Lucky 首版走真实 IP header mode；Lucky 日志/API 与 `globalblacklist` action 作为增强能力，默认关闭
- [ ] 内置 Caddy Public profile 保留为 reference/fallback，不再作为 Public Scope 推荐主路径

---

## Phase 7A — Security Scope Implementation

> 所有安全模块均为可选配置，默认禁用；未显式开启时保持现有本地开发和部署行为不变。

### LAN Scope
- 已完成：应用层登录页 `auth/login`（GET 登录页 + POST 验证）、`/auth/logout`（清除 session cookie）、`/auth/status`（JSON）
- 已完成：`/events` SSE 和静态应用入口 session 校验（`requireRequest` / `requirePage`）
- 已完成：登录失败统一错误文案（"Invalid password."）
- 已完成：登录失败日志使用稳定格式 `MARBLE_AUTH_FAIL ip=<ip> path=/auth/login reason=bad_password`
- 已完成：密码只保存 Argon2id hash（`Bun.password.verify`），session cookie 使用 HMAC-SHA256 签名，不落盘原始 token
- 已完成：Docker/LAN mode 通过 `data/docker/server.config.json` 只读挂载读取 auth 配置；host direct 仍可走 `server/config.json` / env
- [ ] 支持首次启动初始化密码与后续修改密码（当前密码 hash 需通过 config 静态配置）
- [x] LAN password auth Docker smoke 通过（no-auth baseline + auth-enabled matrix 均验证）

### Public Scope — Hidden Entry
- [x] 配置项开启/关闭隐藏入口（默认关闭，不影响本地开发）
- [x] 配置项自定义入口路径，例如 `/hello`、`/panel-entry`
- [x] 配置项自定义根路径响应（当前支持 `404` 或 redirect）
- [x] 入口路径命中后返回应用 shell；未命中入口的根路径和未知 app shell 路径不泄露应用页面
- [x] PWA 模式下通过 `MARBLE_HIDDEN_ENTRY_PATH` 同步 `manifest.start_url` / `manifest.scope` / service worker scope
- [ ] Docker daemon smoke 验证 hidden entry 与 PWA path 在 Public image 中完全一致

### Public Scope — Reverse Proxy + Fail2Ban
- [x] Docker build 排除 `server/config*.json*`、auth 文件、本地密钥和 `data/`
- [x] 客户端 IP 解析统一走 trusted proxy resolver；Public mode 只信任来自已知反代 CIDR 的 forwarded headers
- [x] Public mode 启动 fail-closed：auth 未开启、`auth.password_hash` 缺失、trusted proxy 缺失都会拒绝启动
- [x] auth 失败日志使用 Fail2Ban 稳定可解析格式，包含真实客户端 IP、路径、原因
- [x] Fail2Ban jail/filter/action 随 Public profile 提供，读取应用 auth 失败日志并写共享 ban list
- [x] Bun app 每次请求读取共享 ban list，被封 IP 返回 `403`
- [x] 反代 access log、auth 失败日志、ban 行为在 Docker/Public 文档和 `docker:smoke` 中可验证
- [ ] Docker daemon smoke 验证 5 次失败触发 Fail2Ban ban，ban 后经 app 返回 `403`
- [ ] Existing reverse proxy mode 验证：Caddy / NPM / Lucky 三类输入均能生成真实 IP fail line 并触发 ban

---

## Phase 7 — Docker Deployment

> Docker 是统一部署底座，不属于 Public Scope；LAN/Public 是 `docker:init` 时选择的 mode。

### Dockerfile
- [x] 基座 `oven/bun:1-slim`（两阶段：frontend build → runtime）
- [x] `server/config*.json*`、auth 文件、本地密钥和 `data/` 排除在镜像外
- [x] Web dist 复制到 `/app/web/dist`，server 从容器内候选路径读取
- [x] Runtime 端口统一为 `12001`，容器内 `HOST=0.0.0.0`
- [x] Docker image build + runtime smoke（需 Docker daemon）— 2025-06-09 验证通过，详见 `PLAN/DOCKER_LAN_FULL_TEST_PLAN.md`

### Docker init / up
- [x] `bun run docker:init` 生成 `data/docker/` runtime config，init-time 选择 `lan` / `public`
- [x] `bun run docker:up` 根据 mode 启动统一 compose；LAN 使用 `docker-compose.lan.yml` host port override，Public 使用 `public` profile
- [x] LAN mode：app container 直连 HTTPS，挂载 mkcert leaf cert/key，保留 `bun run lan:https` QR code 证书安装流程
- [x] Public mode reference profile：app + Caddy + Fail2Ban；app 仅 expose internal `12001`，Caddy 映射 `80/443`
- [ ] Public mode recommended profile：app + existing reverse proxy log adapter + Fail2Ban；不默认启动内置 Caddy
- [x] `.env` 只保存非 secret compose mode 变量；password hash / provider token 只在挂载 config 中

### Smoke / Verification
- [x] `bun run build`
- [x] `web/node_modules/.bin/tsc --noEmit -p server/tsconfig.json`
- [x] `bun server/src/trusted-ip.test.ts`
- [x] `docker compose -f docker/docker-compose.yml config`
- [x] `docker compose -f docker/docker-compose.yml -f docker/docker-compose.lan.yml config`
- [x] `docker compose -f docker/docker-compose.yml --profile public config`
- [x] `bun run docker:smoke -- --mode lan`（需 Docker daemon + `data/docker/` init）— 6/7 通过，1 项因容器缺 `wget` 失败（非功能缺陷），host 端 curl HTTPS 全部通过
- [ ] `bun run docker:smoke -- --mode public`（需 Docker daemon + `data/docker/` init）

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
- 已完成：Theme token system（`marble-purple` + base tokens + semantic color variables + persisted theme selection）、Custom Accent（`ui.custom_accent` 配置驱动，继承 `marble-purple` surface/text）、E-INK MODE（高对比显示模式，`data-theme='eink'`，无状态 glow）
- [ ] Optional accent theme presets（blue / green / orange 等预设）
- [ ] Custom Fonts 功能
- [ ] 暗色/亮色切换

### HTTPS
- LAN 推荐路径已归档到 Phase 6B；公网 HTTPS 优先交给用户已有反代/HTTPS 入口，内置 Caddy 仅保留为 reference/fallback

### 镜像瘦身
- [ ] `bun build --compile` → `scratch` (~70MB)

### 更多 Provider
- [ ] Claude Code
- [ ] Gemini CLI
- [ ] GitHub Copilot
