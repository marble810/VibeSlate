# Public Scope 既有反代日志接入计划

## 状态

调研完成，待实现。

本计划取代 Public Scope 的默认开发方向：不再优先把 Marble Panel 做成自带公网反代的一体化栈，而是优先接入用户已有的 Caddy / Nginx Proxy Manager / Lucky 等反代入口，基于真实访问 IP 做 fail2ban。

历史一体化 Caddy 方案已完成并归档：

- `PLAN/Archive/PUBLIC_SCOPE_OPTIMIZATION_PLAN.md`

## 核心结论

Public Scope 仍然合理，但它的职责应从“提供公网入口”转为“适配公网入口后的安全层”。

推荐网络形态：

```text
公网客户端
  -> 用户已有反代 / HTTPS 入口
  -> Marble Panel Bun app
        |
        +-> Marble password auth
        +-> trusted proxy real IP resolver
        +-> shared ban list check

反代 access log / Marble auth failure log
  -> proxy log adapter
  -> MARBLE_AUTH_FAIL ip=<real-ip> path=/auth/login reason=bad_password source=<provider>
  -> Fail2Ban
  -> /var/lib/fail2ban/marble-panel-banned.txt
  -> app returns 403 for banned IP
```

内置 Caddy profile 保留为 reference / fallback，不再作为 Public Scope 的主路径。

## 范围

### In Scope

- Caddy access log 接入。
- Nginx Proxy Manager access log 接入。
- Lucky 真实 IP header 接入。
- Lucky 日志 / API 接入作为增强路径。
- Marble auth failure 响应状态调整为 `401`，使反代 access log 能稳定区分失败登录。
- 统一 proxy-log adapter，将不同来源归一化为当前 Fail2Ban 可消费的 `MARBLE_AUTH_FAIL` 格式。
- 现有 shared ban list / app 403 阻断机制继续复用。
- 文档化 `public.trusted_proxies` 与外部反代 IP/CIDR 的配置要求。

### Out of Scope

- 不实现新的反代管理器。
- 不替用户签发公网证书。
- 不管理用户现有 Caddy / NPM / Lucky 的生命周期。
- 不默认启用公网安全模块；所有安全能力继续 opt-in。
- 不在 LAN Scope 引入 fail2ban、hidden entry 或反代依赖。

## 支持矩阵

| Provider | 支持级别 | 日志 / IP 来源 | 首版策略 |
|---|---|---|---|
| Caddy | 一等支持 | JSON access log，优先 `request.client_ip`，fallback `request.remote_ip` | 直接解析 access log |
| Nginx Proxy Manager | 一等支持 | `/data/logs/proxy-host-*_access.log`，解析 `[Client <ADDR>]` | 只读挂载 NPM logs，按 host/path/status 匹配 |
| Lucky | 一等支持（header） | Lucky Web 服务将 `{ClientIP}` / `{RemoteIP}` 写入 `X-Real-IP` / `X-Forwarded-For` | 让 Marble app 写 auth failure log |
| Lucky | 增强支持（log/API） | 规则日志 / `/api/reverseproxyrule/logs` 风格数据 | 做可配置 adapter，不承诺自动发现所有安装 |

## 关键设计

### 1. 失败登录必须返回 401

当前 bad password 返回登录页 `200`。如果要从反代 access log 判断失败登录，必须改为：

- `POST /auth/login` 密码错误：返回 `401`，页面仍显示登录页和统一错误文案。
- 登录成功：继续返回 `303` 并设置 session cookie。
- 未登录访问 app shell：仍可返回登录页，不作为 fail2ban 信号。

Fail2Ban 匹配条件必须以 `POST /auth/login` + `status=401` 为准。

### 2. Adapter 归一化，而不是写三套 jail

不同反代日志格式差异较大。首选实现一个 repo-local parser / adapter，将来源统一输出为：

```text
MARBLE_AUTH_FAIL ip=<real-ip> path=/auth/login reason=bad_password source=<provider>
```

Fail2Ban filter 需要兼容可选 `source=...` 后缀：

```text
^MARBLE_AUTH_FAIL ip=<ADDR> path=/auth/login reason=bad_password(?: source=\S+)?$
```

### 3. 真实 IP 信任边界仍在 Marble app

即使 adapter 能从 access log 读到真实 IP，Marble app 仍必须：

- `public.mode = "public"` 时强制开启 password auth。
- 要求 `public.trusted_proxies` 非空。
- 只信任来自外部反代 IP/CIDR 的 forwarded headers。
- 不因用户传入伪造 `X-Forwarded-For` 而记录错误 IP。

### 4. Ban 执行优先复用现有 app-level 阻断

首版不依赖宿主机 iptables / nftables 权限，继续使用：

```text
/var/lib/fail2ban/marble-panel-banned.txt
```

Marble app 每次请求读取 ban list，被封 IP 返回 `403`。

后续可选增强：

- Host-level Fail2Ban action。
- Caddy/Nginx/Lucky 自身黑名单 action。
- Lucky `globalblacklist` 自动记录接口。

## Provider 细节

### Caddy

调研结果：

- Caddy access log 支持 JSON 格式。
- Caddy v2.7 起 access log 同时包含 `request.remote_ip` 和 `request.client_ip`。
- 配置 trusted proxies 后，`request.client_ip` 是解析后的真实 client IP。
- Caddy `reverse_proxy` 默认会设置或增强 `X-Forwarded-For`、`X-Forwarded-Proto`、`X-Forwarded-Host`，并默认忽略不可信入站 forwarded header 以防 spoofing。

首版要求：

- 用户提供 Caddy access log 文件路径。
- Adapter 解析 JSON line。
- IP 优先级：`request.client_ip` -> `request.remote_ip`。
- 匹配：`request.method == "POST"`，path 为 `/auth/login`，status 为 `401`。

### Nginx Proxy Manager

调研结果：

- NPM proxy host 模板将 access log 写到 `/data/logs/proxy-host-{{ id }}_access.log`。
- 默认 `proxy` log format 包含 `[Client $remote_addr]`。
- NPM 的 proxy include 会设置 `X-Forwarded-For` 与 `X-Real-IP`。
- NPM nginx.conf 含 realip 设置，`$remote_addr` 在 NPM real IP 链配置正确时可作为真实访问 IP。

首版要求：

- 用户将 NPM `/data/logs` 只读挂载给 adapter。
- 支持指定单个 `proxy-host-<id>_access.log`。
- 支持扫描 `proxy-host-*_access.log`，但必须用 host/path/status 限定 Marble Panel 请求。
- 匹配：`POST`，host 为 Marble 域名，path 为 `/auth/login`，status 为 `401`。
- IP 从 `[Client <ADDR>]` 提取。

### Lucky

调研结果：

- Lucky Web 服务支持反向代理，并提供 `{ClientIP}` / `{RemoteIP}` 变量。
- Lucky 自定义参数兼容部分 nginx 风格配置，如 `proxy_set_header`。
- Lucky 规则日志在 WebUI 中可见；旧开源代码中反代日志包含 `ClientIP`、`RemoteIP`、`Method`、`Host`、`URL` 等字段，并存在 `/api/reverseproxyrule/logs` 风格接口。
- Lucky 新版本不再完全开源，因此不能假设稳定磁盘日志路径或稳定内部数据结构。
- Lucky IP 过滤支持 `globalblacklist` 等 rulekey，后续可作为可选外部 ban action。

首版要求：

- 首选 header 接入：在 Lucky 子规则中把真实 IP 写入 `X-Real-IP` 或 `X-Forwarded-For`。
- Marble `public.trusted_proxies` 填 Lucky 所在 IP/CIDR。
- Marble app 自己写 `MARBLE_AUTH_FAIL`，Fail2Ban 读取 Marble auth log。

增强要求：

- 支持用户手动配置 Lucky API 地址、token、ruleKey/proxyKey。
- Adapter 拉取 Lucky 规则日志，解析 `ClientIP` / `RemoteIP`、method、URL、status/内容。
- 若无法可靠判断 `401`，不启用自动 ban，只输出诊断。
- Lucky `globalblacklist` action 必须显式开启，默认关闭。

## 实施阶段

### Phase 1 — Auth signal hardening

- [ ] bad password 响应改为 HTTP `401`，登录页内容不变。
- [ ] 登录成功保持 `303`。
- [ ] 增加 auth route 测试：bad password `401`，success `303`。
- [ ] 更新现有 Fail2Ban filter，兼容可选 `source=...`。

### Phase 2 — Proxy log adapter 基础设施

- [ ] 新增 `scripts/public-proxy-log-adapter.ts` 或等价 server-side 工具。
- [ ] 支持 tail/offset，避免重启后重复输出旧日志。
- [ ] 输出统一 `MARBLE_AUTH_FAIL ... source=<provider>`。
- [ ] 增加 fixture tests，覆盖 IPv4 / IPv6 / malformed line / rotated file。

### Phase 3 — Caddy adapter

- [ ] 解析 Caddy JSON access log。
- [ ] 提取 `request.client_ip` / `request.remote_ip`。
- [ ] 识别 `POST /auth/login` + `401`。
- [ ] 文档说明 Caddy `trusted_proxies` / CDN 场景。

### Phase 4 — Nginx Proxy Manager adapter

- [ ] 解析 NPM `proxy-host-*_access.log` 默认格式。
- [ ] 支持配置 `host` 与 `logpath`。
- [ ] 从 `[Client <ADDR>]` 提取真实 IP。
- [ ] 文档说明 `/data/logs` 只读挂载和 proxy host id 查找。

### Phase 5 — Lucky header mode

- [ ] 文档化 Lucky Web 服务子规则配置：真实 IP header -> Marble app。
- [ ] 给出 `public.trusted_proxies` 示例。
- [ ] 验证 Lucky header mode 下 Marble auth log 能记录真实 IP。

### Phase 6 — Lucky adapter / action 增强

- [ ] 设计 Lucky API 配置项：baseUrl、token、ruleKey、proxyKey。
- [ ] 拉取规则日志并归一化。
- [ ] 若 Lucky 日志无法稳定提供状态码，默认只做 dry-run / diagnose。
- [ ] 可选实现写入 Lucky `globalblacklist` 的 ban action，默认关闭。

### Phase 7 — Init / docs 路线切换

- [ ] `docker:init` Public mode 增加分支：
  - Recommended: existing reverse proxy
  - Fallback: bundled Caddy reference profile
- [ ] `docs/public-deployment.md` 改为先讲 existing reverse proxy mode。
- [ ] 内置 Caddy profile 标注为 reference / fallback。
- [ ] `ROADMAP.md` 同步已验证项、未验证项和 blockers。

## 验收标准

- [ ] Caddy fixture：5 次 `POST /auth/login` `401` 归一化为 5 条真实 IP fail line。
- [ ] NPM fixture：5 次 `POST /auth/login` `401` 归一化为 5 条真实 IP fail line。
- [ ] Lucky header mode：错误密码由 Marble auth log 记录真实 IP。
- [ ] Fail2Ban 从 adapter 输出触发 ban。
- [ ] ban list 写入后，Marble app 对同 IP 返回 `403`。
- [ ] forged `X-Forwarded-For` 从非 trusted proxy 进入 app 时不会控制 auth fail IP。
- [ ] LAN mode 不启动 adapter / Fail2Ban / hidden entry。

## 已知风险

- 反代日志中如果只有直接连接 IP，而没有真实访问 IP，adapter 不能安全推断真实 IP。
- NPM 位于 CDN 后方时，必须先正确配置 realip，否则 `[Client]` 可能是 CDN IP。
- Lucky 新版本闭源，日志/API 细节可能漂移；首版必须以 header mode 为稳定路径。
- 仅靠 app-level `403` 不能减少已被封 IP 到达反代层的连接成本；host-level / proxy-level action 是后续增强。

## 调研来源

- Caddy log directive: https://caddyserver.com/docs/caddyfile/directives/log
- Caddy trusted proxies: https://caddyserver.com/docs/caddyfile/options#trusted-proxies
- Caddy reverse_proxy headers: https://caddyserver.com/docs/caddyfile/directives/reverse_proxy
- NPM proxy host template: https://raw.githubusercontent.com/NginxProxyManager/nginx-proxy-manager/develop/backend/templates/proxy_host.conf
- NPM log format: https://raw.githubusercontent.com/NginxProxyManager/nginx-proxy-manager/develop/docker/rootfs/etc/nginx/conf.d/include/log-proxy.conf
- NPM proxy headers: https://raw.githubusercontent.com/NginxProxyManager/nginx-proxy-manager/develop/docker/rootfs/etc/nginx/conf.d/include/proxy.conf
- NGINX log module: https://nginx.org/en/docs/http/ngx_http_log_module.html
- NGINX realip module: https://nginx.org/en/docs/http/ngx_http_realip_module.html
- Lucky Web 服务: https://lucky666.cn/docs/modules/web/
- Lucky IP 过滤: https://lucky666.cn/docs/modules/ipfilter/
- Lucky old reverse proxy source: https://raw.githubusercontent.com/gdy666/lucky/master/config/reverseproxy.go
- Lucky old reverse proxy API source: https://raw.githubusercontent.com/gdy666/lucky/master/web/reverseproxy.go
