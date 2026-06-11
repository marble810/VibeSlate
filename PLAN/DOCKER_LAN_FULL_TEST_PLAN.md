# Docker LAN Full Test Plan

## 状态

Draft。目标是在当前 macOS 电脑上完成 Docker LAN mode 的真实端到端验收。

本计划只覆盖 LAN mode。Public mode、Caddy、Fail2Ban、hidden entry 不在本轮执行范围内，但会验证它们没有被 LAN mode 启动或误配置。

## 当前本机前置观察

- CWD: `/Users/liangkeren/Coding/marble-panel`
- Docker CLI: `Docker version 29.2.1`
- Docker daemon: `29.2.1` 可连接；执行阶段需要允许访问本机 Docker socket
- Docker Compose: `v5.0.2`
- mkcert CAROOT: `/Users/liangkeren/Library/Application Support/mkcert`
- 当前没有 `data/docker/`
- 当前已有 host LAN TLS 资料在 `data/lan-tls/`
- `bun run lan:https` 与 Docker LAN app 都会占用 host `12001`，因此证书/QR 辅助流程必须在 Docker app 启动前短时运行，或在 Docker stack 停止后运行

## 测试目标

- 证明 `docker:init -> lan -> docker:up -> docker:smoke --mode lan` 在真实 Docker daemon 上可用。
- 证明 LAN mode 只有 app container，不启动 Caddy / Fail2Ban。
- 证明 app container 通过 host LAN port `12001` 直连 HTTPS 提供服务。
- 证明 Docker LAN TLS 证书、root CA 公钥、mobileconfig 和 QR 辅助材料可用。
- 证明 `rootCA-key.pem`、密码 hash、provider token 等 secret 不进入 image、compose env 或容器挂载。
- 证明 LAN password auth 保持可选；至少完成 no-auth baseline，若时间允许再跑 auth-enabled matrix。
- 测试结束后只把已验证事实同步进 `ROADMAP.md`，未跑通项保留未完成状态并记录阻断条件。

## 不可破坏边界

- 不删除用户现有 `data/lan-tls/`。
- 如果执行时发现 `data/docker/` 已存在，先备份到 `/private/tmp/marble-panel-docker-lan-test-<timestamp>/docker-data-backup/`，再询问是否覆盖。
- 不运行 Public profile。
- 不把 `docker-compose.yml` 单独作为 LAN 运行入口；LAN 必须带 `docker-compose.lan.yml` override。
- 不使用 `docker compose down` 停止不属于当前 repo/当前 compose project 的容器。
- 不把任何真实密码或 token 写进 PLAN、ROADMAP 或最终报告。

## 测试矩阵

| Matrix | 必跑 | 目的 |
|---|---:|---|
| LAN no-auth baseline | yes | 验证推荐 LAN 默认路径：直连 HTTPS，无 Caddy/F2B/hidden entry |
| LAN auth-enabled | yes, if baseline passes | 验证 LAN 可选密码保护不破坏 Docker TLS / SSE / app shell |
| Host QR/bootstrap smoke | yes | 验证 mkcert + QR 辅助流程仍可引导证书安装 |
| Physical iOS/Android install | optional/human | 需要真实设备；如果本轮无设备，只记录为 human pending |

## Phase L0 — Preflight Snapshot

目标：在修改本地 runtime 数据前记录当前状态，确保失败时可恢复。

执行：

```bash
git status --short
docker --version
docker compose version
docker info --format '{{.ServerVersion}}'
mkcert -CAROOT
find data -maxdepth 3 -type f -print
```

验收：

- Docker daemon 可连接。
- mkcert 可用。
- 记录 `data/docker/` 是否存在。
- 若 `data/docker/` 存在，必须先备份，不直接覆盖。

## Phase L1 — Static Verification Before Runtime Mutation

目标：先排除明显代码/compose 配置错误，避免进入 Docker build 后才失败。

执行：

```bash
bun run build
web/node_modules/.bin/tsc --noEmit -p server/tsconfig.json
bun server/src/trusted-ip.test.ts
docker compose -f docker-compose.yml -f docker-compose.lan.yml config
docker compose -f docker-compose.yml -f docker-compose.lan.yml config --services
```

验收：

- TypeScript / trusted IP tests 通过。
- Compose config 通过。
- LAN services 只包含 `app`。
- `docker-compose.lan.yml` 为 app 提供 `${MARBLE_APP_PORT:-12001}:12001` 映射。

## Phase L2 — LAN Init Baseline

目标：生成 LAN mode 的 Docker runtime 配置。

执行：

```bash
bun run docker:init
```

交互选择：

- mode: `lan`
- password protection: `no`

生成后检查：

```bash
cat data/docker/mode
cat data/docker/.env
cat data/docker/server.config.json
ls -la data/docker/certs
```

验收：

- `data/docker/mode` 是 `lan`。
- `.env` 只包含非 secret compose 变量。
- `server.config.json` 中：
  - `auth.enabled` 为 `false`
  - `public.mode` 为 `lan`
  - `public.trusted_proxies` 为空数组
  - `hidden_entry.enabled` 为 `false`
- `data/docker/certs/` 有 `app-cert.pem`、`app-key.pem`、`rootCA.pem`、`rootCA.crt`、`rootCA.cer`、`Marble-Panel.mobileconfig`。
- `data/docker/certs/rootCA-key.pem` 不存在。

## Phase L3 — LAN TLS And QR Material

目标：证明 Docker LAN 使用的 mkcert 证书链和安装材料正确。

执行：

```bash
openssl verify -CAfile data/docker/certs/rootCA.pem data/docker/certs/app-cert.pem
openssl x509 -in data/docker/certs/app-cert.pem -noout -text
plutil -lint data/docker/certs/Marble-Panel.mobileconfig
```

如果要验证 QR/bootstrap 辅助流程，必须在 Docker app 启动前运行：

```bash
bun run lan:https
```

验收：

- leaf cert 能被 `data/docker/certs/rootCA.pem` 验证。
- SAN 覆盖 `localhost`、`127.0.0.1`、当前 LAN IP、hostname `.local`。
- iOS mobileconfig 语法合法。
- `data/docker/certs/rootCA.pem` 与 `data/lan-tls/rootCA.pem` 指向同一个 mkcert root CA，fingerprint 一致。
- `bun run lan:https` 能显示 QR/TUI 和 HTTP bootstrap URL；验证后退出，释放 `12001`。

备注：

- 如果希望 QR/bootstrap 与 Docker app 并行运行，当前实现会因为 `12001` 端口冲突失败；这不是 LAN Docker smoke 的阻断，但应作为后续 UX 优化缺口记录。

## Phase L4 — Docker Build And LAN Up

目标：真实构建 image 并启动 LAN stack。

执行：

```bash
bun run docker:up
docker compose -f docker-compose.yml -f docker-compose.lan.yml ps
docker compose -f docker-compose.yml -f docker-compose.lan.yml port app 12001
docker compose -f docker-compose.yml -f docker-compose.lan.yml logs --tail=120 app
```

验收：

- image build 成功。
- app container 处于 running/healthy equivalent 状态。
- host port 映射存在，默认应为 `0.0.0.0:12001` 或 Docker Desktop 对应 host bind。
- app 日志显示 HTTPS server 监听 `0.0.0.0:12001`。
- 没有 Caddy / Fail2Ban 容器。

## Phase L5 — Automated LAN Smoke

目标：使用项目已有 smoke 脚本完成容器内外自动检查。

执行：

```bash
bun run docker:smoke -- --mode lan
```

验收：

- `App container running` 通过。
- `App responds over HTTPS on port 12001` 通过。
- `App has host port mapping` 通过。
- `Caddy not running` 通过。
- `Fail2Ban not running` 通过。
- `Server config mounted in container` 通过。
- `TLS cert directory accessible` 通过。

失败处理：

- 如果 HTTPS 失败，先看 `docker compose -f docker-compose.yml -f docker-compose.lan.yml logs app`。
- 如果 port mapping 失败，检查 `docker-compose.lan.yml` 是否被 `docker:up` 正确带入。
- 如果 script 误判 Caddy/F2B，检查 compose profile 是否泄漏。

## Phase L6 — Host HTTPS Functional Checks

目标：从当前电脑作为 LAN client 访问 host 映射端口，验证真实 HTTPS、静态资源、PWA 和 SSE。

执行：

```bash
curl --fail --show-error --cacert data/docker/certs/rootCA.pem https://localhost:12001/
curl --fail --show-error --cacert data/docker/certs/rootCA.pem https://127.0.0.1:12001/
curl --fail --show-error --cacert data/docker/certs/rootCA.pem https://localhost:12001/manifest.webmanifest
curl --fail --show-error --cacert data/docker/certs/rootCA.pem https://localhost:12001/sw.js
curl --fail --show-error --cacert data/docker/certs/rootCA.pem https://localhost:12001/auth/status
curl --no-buffer --max-time 5 --cacert data/docker/certs/rootCA.pem https://localhost:12001/events
```

如果 L3 记录了 LAN IP，则追加：

```bash
curl --fail --show-error --cacert data/docker/certs/rootCA.pem https://<LAN_IP>:12001/
```

验收：

- app shell 返回 2xx。
- manifest 和 service worker 返回 2xx。
- no-auth baseline 下 `/auth/status` 返回 `enabled:false` 且 `authenticated:true`。
- no-auth baseline 下 `/events` 可建立 SSE 连接，不返回 401。
- LAN IP URL 可从本机访问；如果 macOS/Docker Desktop 网络策略阻断，只记录为本机网络限制，不直接判定实现失败。

## Phase L7 — Secret And Boundary Audit

目标：验证 LAN Docker 没有泄漏 root CA 私钥、密码 hash 或 provider secret，也没有启动公网组件。

执行：

```bash
docker compose -f docker-compose.yml -f docker-compose.lan.yml config
docker compose -f docker-compose.yml -f docker-compose.lan.yml exec -T app sh -c 'find /app -name rootCA-key.pem -o -name "*.mobileprovision"'
docker compose -f docker-compose.yml -f docker-compose.lan.yml exec -T app sh -c 'ls -la /app/data/certs && test ! -e /app/data/certs/rootCA-key.pem'
docker compose -f docker-compose.yml -f docker-compose.lan.yml ps -a
```

验收：

- compose config 不包含真实 provider token、password hash、`rootCA-key.pem`。
- container 内不存在 `rootCA-key.pem`。
- app mount 中只有 leaf key/cert 和 root CA public cert/material。
- `ps -a` 中没有当前 LAN stack 的 `caddy` / `fail2ban` running container。

## Phase L8 — LAN Auth-Enabled Matrix

目标：验证 LAN 可选密码保护在 Docker LAN 下可用。

执行前提：

- L2-L7 baseline 全部通过。
- 使用临时测试密码，不写入 PLAN 或报告。
- 若执行时已有用户自定义 `data/docker/server.config.json`，先备份。

执行：

```bash
bun run docker:init
bun run docker:up
```

交互选择：

- mode: `lan`
- overwrite: `yes`
- password protection: `yes`
- password: 临时测试密码

验收命令：

```bash
curl --include --cacert data/docker/certs/rootCA.pem https://localhost:12001/
curl --include --cacert data/docker/certs/rootCA.pem https://localhost:12001/events
curl --include --cacert data/docker/certs/rootCA.pem --data 'password=wrong-test' https://localhost:12001/auth/login
curl --include --cacert data/docker/certs/rootCA.pem --cookie-jar /private/tmp/marble-panel-lan-cookie.txt --data 'password=<TEMP_PASSWORD>' https://localhost:12001/auth/login
curl --fail --show-error --cacert data/docker/certs/rootCA.pem --cookie /private/tmp/marble-panel-lan-cookie.txt https://localhost:12001/
curl --no-buffer --max-time 5 --cacert data/docker/certs/rootCA.pem --cookie /private/tmp/marble-panel-lan-cookie.txt https://localhost:12001/events
```

验收：

- 未登录访问 app shell 返回登录页。
- 未登录访问 `/events` 返回 401。
- 错误密码返回登录错误页，并在 app 日志写出 `MARBLE_AUTH_FAIL`。
- 正确密码返回 session cookie。
- 带 cookie 后 app shell 和 SSE 可访问。
- 仍不启动 Caddy / Fail2Ban。

## Phase L9 — Cleanup Or Keep-Running Decision

目标：测试结束后明确环境状态。

两种收尾方式：

- Keep running：如果用户要继续在 LAN 下体验，保留容器和 `data/docker/`。
- Clean stop：如果只是验收，停止当前 LAN compose stack，但保留 `data/docker/` 作为可复现产物。

Clean stop 执行：

```bash
docker compose -f docker-compose.yml -f docker-compose.lan.yml down
```

验收：

- 不删除 `data/docker/`，除非用户明确要求。
- 不删除 `data/lan-tls/`。
- 如果 L8 覆盖了 no-auth baseline 配置，最终报告明确当前 `data/docker/` 是 auth-enabled 还是 no-auth。

## Phase L10 — Evidence Report And ROADMAP Sync

目标：把验收结果变成可复查证据，并按 AGENTS.md 约束同步 ROADMAP。

报告必须包含：

- 执行日期和机器环境。
- 每个 Phase 的 pass/fail。
- Docker image build 是否真实执行。
- `bun run docker:smoke -- --mode lan` 输出摘要。
- host HTTPS / manifest / sw / auth/status / SSE 验证结果。
- Caddy / Fail2Ban absence 验证结果。
- secret boundary 验证结果。
- `lan:https` QR/bootstrap 是否验证，以及是否存在 `12001` 并行冲突缺口。
- auth-enabled matrix 是否执行；若未执行，原因。
- iOS/Android physical device 是否执行；若未执行，保持 human pending。

ROADMAP 更新规则：

- 只有 `bun run docker:smoke -- --mode lan` 真实通过后，才勾选 ROADMAP 中对应 Docker LAN smoke 项。
- 如果只通过 baseline、未跑 auth-enabled 或 human device，ROADMAP 只能写清楚部分验收，不能把 human checks 标为完成。
- 如果发现实现缺口，新增到 ROADMAP 的对应 Phase 或另起优化 Plan，不在报告中口头消化。

## 成功定义

本轮 Docker LAN 全套测试成功的最低标准：

- L0-L7 全部通过。
- `bun run docker:smoke -- --mode lan` 通过。
- 当前电脑可通过 mkcert root CA 验证的 `https://localhost:12001/` 访问 Docker app。
- LAN mode 未启动 Caddy / Fail2Ban / hidden entry。
- 没有 secret 边界违规。
- ROADMAP 已按实际结果更新。

扩展成功标准：

- L8 auth-enabled matrix 通过。
- `bun run lan:https` 的 QR/bootstrap smoke 通过。
- 至少一台真实移动设备完成 CA 安装和 HTTPS/PWA 访问。
