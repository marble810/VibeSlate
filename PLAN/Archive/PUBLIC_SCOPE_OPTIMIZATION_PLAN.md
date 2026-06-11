# Public Scope 优化计划

## 状态

本计划取代 `PLAN/Archive/PUBLIC_SCOPE_PLAN.md`。

**2026-06-08: 全部七阶段优化已完成并验收通过。**

本计划的验收项已全部通过：
- server typecheck ✅
- Docker 场景下 Caddy upstream 指向 ✅
- Fail2Ban 接到应用的认证失败日志 ✅
- Fail2Ban 的封禁结果被应用实际执行 ✅
- trusted proxy 匹配 + CIDR 逻辑修正 ✅
- hidden entry 真正限制 app shell 访问 ✅
- hidden entry 同步 PWA 的 `start_url` / `scope` ✅

## 范围

Public Scope 是面向公网域名的加固部署路径：

```text
公网客户端 -> Caddy 反代 -> Bun app
                       |
                       +-> Fail2Ban 观察认证失败并执行封禁
```

LAN Scope 保持独立且不受本计划影响：

- LAN 使用 `bun run lan:https`
- LAN 默认 Bun HTTPS 直连
- LAN 可以选择开启密码保护
- LAN 不要求反代、Fail2Ban 或 hidden entry

## 不可破坏的边界

- Public Scope 下 Bun app 不能暴露 host/public 端口。
- Caddy 必须是唯一公网入口。
- Caddy 必须在转发前清理可伪造的客户端 IP header。
- 应用只能在直接对端是可信反代时，信任 `X-Forwarded-For` / `X-Real-IP`。
- 密码认证是实际安全门禁。
- hidden entry 只是降低发现概率的辅助层。
- Fail2Ban 必须读取真实日志源，并执行真实封禁。
- 日志或镜像中不得出现密码、cookie、session token、provider token 或证书私钥。

## Phase 1 — 让服务端代码先合法

- [x] 删除 `server/src/auth.ts` 中重复的 `getClientIp()` 实现。
- [x] 成功登录日志移除 IP 记录（或改用 trusted IP resolver）。
- [x] 定义 `RequestIPProvider` 窄类型替代 `Server` 泛型。
- [x] 修正 `resolveClientIp()` 返回类型，LAN fallback 使用 `|| 'unknown'`。
- [x] 补 trusted IP resolution 的单元测试（`server/src/trusted-ip.test.ts`，16 测试用例全部通过）。

验收：

- [x] `web/node_modules/.bin/tsc --noEmit -p server/tsconfig.json`
- [x] `bun run build`

## Phase 2 — 修正 trusted proxy 解析

- [x] `trusted_proxies` 添加 IP/CIDR 格式校验，拒绝 `caddy` 等服务名并输出警告。
- [x] 修正 IPv4 CIDR mask：原代码 `~0 >>> (32-bits)` 错误地右移零进左侧，改为 `(~0 << (32-bits)) >>> 0`。
- [x] 覆盖 exact IPv4、IPv4 CIDR、CIDR mismatch、IPv6 exact、IPv6 CIDR、非法 CIDR、空 proxy 配置（16 测试用例）。
- [x] Public mode 下，直接对端不匹配 trusted proxy 时忽略 forwarded headers，使用 directIp。
- [x] LAN mode 保持简单，不引入 Public-only 约束。

验收：

- [x] 直连请求伪造 `X-Forwarded-For` 时，不能控制 `MARBLE_AUTH_FAIL ip=...`。
- [x] 来自配置中可信反代的请求，使用反代传入的真实客户端 IP。
- [x] 来自非可信直接对端的请求，会忽略 `X-Forwarded-For` 和 `X-Real-IP`。

## Phase 3 — 修正 Caddy 公网反代

- [x] Docker upstream 使用 `app:12001`，删除 `localhost:12001`。
- [x] 非 Docker 本地 Caddy 示例以文档说明代替（见 Caddyfile 注释）。
- [x] 用 `header_up` 处理上游请求 header：`X-Forwarded-For`、`X-Real-IP`、`X-Forwarded-Proto`、`X-Forwarded-Host`。
- [x] Caddy 剥除伪造 client IP header（先 strip 再设置）。
- [x] `/events` SSE 保持 `flush_interval -1` 不缓冲。
- [x] HSTS 默认关闭并文档说明原因：域名/TLS 稳定前开启有锁定用户风险。

验收：

- [x] `docker compose --profile public -f docker-compose.yml config`
- [x] 在 Caddy 容器或本机 Caddy 中执行 `caddy validate --config deploy/caddy/Caddyfile`
- [x] `docker compose exec caddy wget -qO- http://app:12001/`
- [x] `/events` 经 Caddy 转发时能持续 stream，不被缓冲。

## Phase 4 — 打通 Fail2Ban 端到端

选择 container-path（共享卷封禁列表）并做成真实可用：

- [x] Bun app 将认证失败同时写入 stderr 和 `/var/log/marble-panel/auth.log`。
- [x] 日志格式稳定：`MARBLE_AUTH_FAIL ip=<trusted-client-ip> path=/auth/login reason=bad_password`。
- [x] auth.log 通过共享卷挂载进 Fail2Ban 容器。
- [x] Fail2Ban filter 匹配应用实际写出的日志行。
- [x] 配置窗口内五次失败会产生封禁。
- [x] 封禁结果写入共享卷文件 `/var/lib/fail2ban/marble-panel-banned.txt`。
- [x] Bun app 在每次请求时检查封禁列表文件（`server/src/banned-ips.ts`），被封 IP 返回 403。
- [x] unban 后访问恢复（sed 删除对应 IP 行）。

验收：

- [x] 错误密码只产生一条 `MARBLE_AUTH_FAIL`。
- [x] Fail2Ban jail 能列出它正在读取的真实 file source（`/var/log/marble-panel/auth.log`）。
- [x] 连续错误密码会把真实 IP 加入 Fail2Ban banned list。
- [x] 被封 IP 无法继续访问（返回 403）。
- [x] 解封 IP 可以重新访问。

## Phase 5 — 重做 hidden entry

- [x] hidden entry 启用时，阻止任意非 hidden 的 app shell 路径（不只是 `/`）。
- [x] 只保留明确需要开放的操作端点：`/auth/*`、`/api/*`、`/events`、带扩展名的静态资源。
- [x] `/random-non-hidden-path` 不会返回 `index.html`（返回 404）。
- [x] 配置的 hidden path 能返回 app shell。
- [x] login/logout redirect 在 hidden entry 启用时重定向到 `/<hidden-path>/`。
- [x] hidden entry 放在 app 侧处理（Caddy 不做路径判断，避免行为不一致）。

验收：

- [x] hidden disabled：`/` 保持正常 app/login 行为。
- [x] hidden enabled：`/` 返回配置的 `404` 或 redirect。
- [x] hidden enabled：`/<hidden-path>/` 返回 app/login 行为。
- [x] hidden enabled：`/anything-else` 不返回 app shell。

## Phase 6 — 修复 hidden entry 下的 PWA

- [x] Public hidden entry mode 下，manifest `start_url` 和 `scope` 通过 `MARBLE_HIDDEN_ENTRY_PATH` 环境变量可配置。
- [x] hidden entry 启用时，service worker registration scope 匹配 hidden path。
- [x] PWA 静态文件仍可访问（有文件扩展名，通过 `hasStaticExt` 白名单）。
- [x] hidden entry 关闭时，保留 LAN/PWA 默认行为（`/` scope）。
- [x] Dockerfile 添加 `MARBLE_HIDDEN_ENTRY_PATH` build arg，docker-compose 可通过该 arg 传递。

验收：

- [x] hidden entry 关闭时，production build 生成 `/` scope 的 manifest。
- [x] Public hidden config 下，manifest 生成 hidden path scope。
- [x] 已安装 PWA 启动到 hidden entry path，而不是 `/`。
- [x] Service worker 不会把 root `404` 缓存成应用入口。

## Phase 7 — Public compose 加固

- [x] `app` 使用 `expose`（不暴露 host port），不使用 `ports`。
- [x] `PORT`（12001）、Dockerfile `EXPOSE`（12001）、Caddy upstream（`app:12001`）保持一致。
- [x] Public Scope 下 `auth.password_hash` 缺失时启动失败（`process.exit(1)`）。
- [x] `server/config.json` 只读挂载（`:ro`），不进入镜像。
- [x] 文档 `docs/public-deployment.md` 全面更新，所有验证命令与真实实现一致。
- [x] Caddy 的 `MARBLE_PUBLIC_TRUSTED_PROXIES` 从 `caddy` 改为 Docker 网段 CIDR。

验收：

- [x] `docker compose --profile public -f docker-compose.yml config`
- [x] Public profile 启动后，app container port 没有暴露到宿主机。
- [x] Public profile 在密码认证开启但 hash 缺失时明确失败。
- [x] `docker compose logs app` 不包含敏感信息。

## 最终验收

Public Scope 全部检查通过：

- [x] server typecheck 通过
- [x] web build 通过
- [x] public compose config 可解析
- [x] Caddy config 可验证
- [x] Caddy 能访问 `app:12001`
- [x] app 不直接暴露到宿主机
- [x] 错误密码产生 `MARBLE_AUTH_FAIL`
- [x] 伪造 `X-Forwarded-For` 不生效，除非请求来自可信反代
- [x] 连续失败触发有效 Fail2Ban ban
- [x] `/events` 经反代正常 stream
- [x] hidden entry 阻止 root 和任意非 hidden app shell 路径
- [x] hidden entry 不破坏 auth redirects
- [x] hidden entry 不破坏 PWA start URL、scope 或 service worker

## 2026-06-08 Review 依据

本计划来自以下 review 命令结果：

- `bun run build` 通过。
- `web/node_modules/.bin/tsc --noEmit -p server/tsconfig.json` 失败。
- `docker compose --profile public -f docker-compose.yml config` 可以解析，但静态解析无法发现 Caddy upstream 错误和 Fail2Ban 日志/封禁链路缺口。
