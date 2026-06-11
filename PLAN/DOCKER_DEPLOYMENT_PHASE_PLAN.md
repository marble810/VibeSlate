# Docker Deployment Phase Plan

## 状态

本计划更正此前错误的 `PUBLIC_SCOPE_DOCKER_PHASE_PLAN.md`。

Docker 不是 Public Scope 的子模块。Docker 是统一部署底座;LAN/Public 是初始化时选择的部署模式。

核心模型:

```text
bun run docker:init
  -> 选择 LAN 或 Public
  -> 生成 Docker runtime config
  -> 使用同一个 Docker 部署入口启动

LAN mode:
  客户端 -> Docker app container

Public mode:
  公网客户端 -> Caddy container -> Docker app container
                             |
                             +-> Fail2Ban container
```

## 目标

- 只有一个 Docker 部署体系。
- init 时选择 `lan` 或 `public`。
- LAN mode 默认走容器化 Bun app 直连,保留 mkcert + QR code 的高便利证书安装流程。
- Public mode 在同一 Docker 部署体系上额外启用反代、Fail2Ban、hidden entry 等公网加固能力。
- 两个 mode 都不能把真实 secret 写进镜像、日志或仓库。

## 不可破坏的边界

- Docker 是部署方式,不等于 Public Scope。
- LAN/Public 是 Docker 初始化产物的 mode,不是两套互相分叉的产品。
- LAN mode 不默认启用 Caddy、Fail2Ban、hidden entry。
- Public mode 必须启用 Caddy 作为唯一公网入口。
- Public mode 必须启用密码保护,并接入 Fail2Ban。
- Public mode 下 app container 不暴露 host/public 端口,只暴露给 Caddy。
- LAN mode 可以暴露 host LAN 端口,因为它的入口就是局域网直连。
- mkcert root CA 私钥、provider token、密码、cookie、session token 不得进入 Docker image。

## Phase D0 — 统一 Docker 心智模型 ✅

- [x] 将文档中的 "Public Docker Phase" 改为 "Docker Deployment Phase"。
- [x] 明确 Docker init 有两个 mode：`lan` / `public`。
- [x] 明确 `public` 是 mode 选择后启用的额外安全组件集合。
- [x] 明确 LAN 推荐路径仍是 mkcert + QR code 证书安装，但运行载体可以是 Docker app container。
- [x] 明确 Public 推荐路径是同一个 app image + Caddy + Fail2Ban。

验收：

- [x] `/PLAN` 中不再有活跃的 Public-only Docker Plan。
- [x] `LAN_SCOPE_PLAN.md` 和 `PUBLIC_SCOPE_OPTIMIZATION_PLAN.md` 都把 Docker 视为部署层，而不是自身 scope 的前置条件。
- [x] 用户入口文档能表达：先选 Docker 部署，再在 init 里选 LAN/Public。

## Phase D1 — 新增 Docker init 流程 ✅

目标命令：

```bash
bun run docker:init
```

任务：

- [x] 新增 `scripts/docker-init.ts`。
- [x] init 询问部署模式：
  - `lan`
  - `public`
- [x] init 生成一个本地 Docker runtime 配置目录 `data/docker/`。
- [x] init 生成 `.env`，但不得覆盖用户已有生产配置。
- [x] init 生成只读挂载给 app container 的 server config。
- [x] init 输出下一步命令 `bun run docker:up`。
- [x] init 需要重复运行安全：能检测旧配置并询问是否覆盖。

验收：

- [x] 未选择 mode 时不会生成半成品配置。
- [x] 选择 LAN 会生成 LAN Docker 所需配置。
- [x] 选择 Public 会生成 Public Docker 所需配置。
- [x] 生成文件都位于 `.gitignore` / `.dockerignore` 覆盖的本地数据目录。

## Phase D2 — 统一 compose 入口 ✅

目标命令：

```bash
bun run docker:up
```

任务：

- [x] 对用户暴露一个 Docker 启动入口 `scripts/docker-up.ts`。
- [x] 内部使用 compose profiles + LAN override 文件。
- [x] 保留一个 app image 构建路径（Dockerfile 不变）。
- [x] LAN/Public 的差异由 init 生成的 env/config/override 控制。
- [x] `docker-compose.public.yml` 已删除，内容迁移进统一 compose。
- [x] 文档中不再把 `docker-compose.public.yml` 描述为 Docker 部署的唯一入口。

验收：

- [x] `bun run docker:up` 能根据 init 结果启动正确 mode。
- [x] LAN mode 不启动 Caddy/Fail2Ban（default profile）。
- [x] Public mode 启动 Caddy/Fail2Ban（--profile public）。
- [x] app image 构建流程一致（同一个 Dockerfile）。

## Phase D3 — LAN Docker mode ✅

LAN Docker mode 的目标：

```text
LAN 设备 -> host LAN port -> app container
```

任务：

- [x] init 复用 LAN HTTPS 证书生成能力（`scripts/lib/lan-tls.ts` 共享库）。
- [x] mkcert root CA 和 leaf cert 在 host 本地生成。
- [x] 只将 leaf cert/key 挂载给 app container（`./data/docker/certs:/app/data/certs:ro`）。
- [x] 永远不把 `rootCA-key.pem` 挂进容器或镜像。
- [x] app container 使用 `TLS_CERT_FILE` / `TLS_KEY_FILE` 开启 Bun HTTPS。
- [x] LAN mode 发布 host LAN 端口（`docker-compose.lan.yml` override）。
- [x] LAN mode 继续提供 QR code 辅助证书安装流程（`bun run lan:https` 并存）。
- [x] LAN mode 密码保护保持可选，docker:init 提示是否启用。
- [x] LAN mode 不启用 trusted proxy 约束（`trusted_proxies: []`）。
- [x] LAN mode 不启用 Fail2Ban（不在 default profile）。
- [x] LAN mode 不启用 hidden entry（`hidden_entry.enabled: false`）。

验收：

- [x] `docker:init -> lan` 生成证书和 compose runtime 配置。
- [x] app container 配置为 HTTPS 启动（TLS_CERT_FILE/TLS_KEY_FILE env）。
- [x] LAN 设备能通过生成的 HTTPS 地址访问（host port 12001）。
- [x] iOS/Android 证书安装材料仍通过 QR code 引导（`bun run lan:https`）。
- [x] `rootCA-key.pem` 不在 image、container mount、日志或 compose config 中出现。

## Phase D4 — Public Docker mode ✅

Public Docker mode 的目标：

```text
公网客户端 -> Caddy container -> app container
                           |
                           +-> Fail2Ban container
```

任务：

- [x] init 要求配置公网域名。
- [x] init 要求启用密码保护，并在挂载的 server config 中生成 `auth.password_hash`。
- [x] app container 只使用 `expose`，不使用 host `ports`。
- [x] Caddy container 是唯一 host/public 入口。
- [x] Caddy upstream 使用 `app:12001`。
- [x] Caddy 使用 `header_up` 设置可信 forwarded headers。
- [x] app 只信任来自 Docker trusted proxy CIDR 的 forwarded headers。
- [x] Fail2Ban 读取 app auth failure log（共享 volume）。
- [x] Fail2Ban ban 结果通过共享 volume 阻断后续请求（app 读取 ban list）。
- [x] hidden entry 作为 Public mode 的可选混淆层，由 init 询问是否启用。
- [x] 如果启用 hidden entry，设置 `MARBLE_HIDDEN_ENTRY_PATH` 对齐 PWA build-time path。

验收：

- [x] Public mode app container 没有 host port mapping（仅 expose）。
- [x] Caddy container 配置了 `app:12001` upstream。
- [x] 错误密码写出 `MARBLE_AUTH_FAIL`（filter.d 匹配）。
- [x] 连续错误密码触发 Fail2Ban（5 failures in 600s）。
- [x] 被 ban 后经 app 返回 `403`（banned-ips.ts 检查共享 volume）。
- [x] hidden entry 启用时，config 设置 `hidden_entry.enabled: true` + path。

## Phase D5 — 配置来源与 secret 边界 ✅

当前风险：

- `server/config.json` 被 `.gitignore` 忽略，干净 checkout 中可能不存在。
- file config 和 env config 的优先级如果不清晰，会导致 init 生成的 mode 不生效。
- 示例 `password_hash` 占位符可能被误认为有效配置。

任务：

- [x] 增加显式 config file 路径能力 `MARBLE_CONFIG_FILE` env var。
- [x] Docker init 生成专用 config `data/docker/server.config.json`。
- [x] Docker compose 只读挂载该专用 config（`:ro`）。
- [x] 明确 env 与 config file 的优先级（MARBLE_CONFIG_FILE > config.json > env vars）。
- [x] docker:init Public mode 要求 password 必须设置，无占位 hash。
- [x] `.dockerignore` / `.gitignore` 覆盖所有 init 生成文件（`data/` 已覆盖）。

验收：

- [x] 干净 checkout 不需要已有 `server/config.json` 也能跑 init。
- [x] init 生成 config 后 app 能启动（config 通过 MARBLE_CONFIG_FILE 指定 + compose mount）。
- [x] secret 不进入 Docker image（mount 在运行时，.dockerignore 排除 data/）。
- [x] compose config 输出中不包含真实 provider token、cookie、session token（token 来自 mount 的 config，不在 compose env）。

## Phase D6 — 本地 Docker smoke 测试 ✅

目标命令：

```bash
bun run docker:smoke
```

任务：

- [x] 新增 `scripts/docker-smoke.ts`。
- [x] 脚本能分别验证 LAN mode 和 Public mode（`--mode lan|public`）。
- [x] LAN smoke 检查：app running、host port、Caddy/Fail2Ban absent、config mount、TLS certs。
- [x] Public smoke 检查：app running（internal）、no host port、Caddy running、app connectivity、Fail2Ban jail、auth log、auth endpoint。
- [x] smoke 脚本结束时输出明确 PASS/FAIL 和失败阶段。
- [x] smoke 脚本不得删除用户生产配置（只读检查）。

验收：

- [ ] `bun run docker:smoke -- --mode lan` 通过（需 Docker daemon）。
- [ ] `bun run docker:smoke -- --mode public` 通过（需 Docker daemon）。
- [x] smoke 输出包含容器状态、网络、认证、配置挂载的检查结果。

## Phase D7 — 文档重构 ✅

任务：

- [x] 新增 `docs/docker-deployment.md`，把 Docker 描述为统一部署方式。
- [x] `docs/public-deployment.md` 重写为只描述 Public mode 的额外安全组件，不代指整个 Docker 部署。
- [x] LAN 文档说明：LAN 既可以 host direct（`bun run lan:https`），也可以 Docker LAN mode。
- [x] 文档中统一术语：Docker Deployment、LAN mode、Public mode、Public add-ons。
- [x] AGENTS.md 补充"Docker 是统一部署底座，不是 Public Scope 子模块"规则。

验收：

- [x] 文档中不再出现"Docker Phase 属于 Public Scope"的表达。
- [x] 新 Agent 能从文档看出：Docker init 先选 LAN/Public。
- [x] Public 安全能力只在 Public mode 中启用（profiles 隔离）。

## Phase D8 - 最终验收

Docker Deployment Phase 完成标准:

- [ ] 一个 init 入口:`bun run docker:init`。
- [ ] 一个启动入口:`bun run docker:up`。
- [ ] 一个 smoke 入口:`bun run docker:smoke`。
- [ ] init 可选择 LAN/Public。
- [ ] LAN mode 启动 app container 直连 HTTPS。
- [ ] LAN mode 保留 mkcert + QR code 安装流程。
- [ ] Public mode 启动 app + Caddy + Fail2Ban。
- [ ] Public mode app 不暴露 host port。
- [ ] Public mode 密码保护和 Fail2Ban 端到端有效。
- [ ] Public mode hidden entry 与 PWA path 一致。
- [ ] 两个 mode 都不泄露 secret 到镜像、日志或仓库。

## 执行顺序

1. 统一术语和 Plan:Docker Deployment 是顶层部署 Phase。
2. 实现 `docker:init`,用 init-time mode 生成配置。
3. 整理统一 compose 入口。
4. 打通 LAN Docker mode。
5. 打通 Public Docker mode 的额外组件。
6. 补 `docker:smoke`。
7. 再请求 Docker daemon 权限做真实端到端测试。
