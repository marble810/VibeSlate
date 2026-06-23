<div align="center">

# VibeSlate

> Turn spare phones, tablets and e-ink readers into always-on LLM usage monitors.
>
> 将闲置手机、平板和电纸书变成常亮 LLM 用量监控器。

**Alpha 2.0**：Docker-only public alpha，重点补齐 OpenAI/Codex app-server device-code 登录、Docker `.env` 配置、密码保护、LAN HTTPS 与 PWA kiosk 使用路径。

</div>

## 当前能力

- Provider 卡片：DeepSeek、OpenAI / Codex、OpenCode Go，以及预留硬件监控位。
- 实时更新：后端通过 SSE 推送 usage、认证状态和错误信息。
- OpenAI 登录：Docker/dev 都使用独立 `CODEX_HOME` + Codex app-server device-code flow，不读取宿主机 `~/.codex/auth.json`。
- Docker 部署：公开部署路径只需要复制 `docker/.env.example` 和 `docker/docker-compose.example.yml`。
- Kiosk / PWA：适合常亮设备，支持 manifest、Service Worker、Wake Lock 与响应式卡片布局。
- 可选安全项：应用层密码保护、LAN HTTPS/root CA 下载页、Argon2id password hash。

## Docker Alpha 部署

> Docker 是唯一面向用户的部署方式；本地开发仍使用 Bun。

```bash
cp docker/docker-compose.example.yml docker/docker-compose.yml
cp docker/.env.example docker/.env
# 编辑 docker/.env，填入需要启用的 provider/auth/TLS 配置
docker compose -f docker/docker-compose.yml up -d app
```

默认地址：`http://localhost:12001`。

当前推荐镜像：`ghcr.io/marble810/vibeslate:v0.1.0-alpha.3`。如果从 `v0.1.0-alpha.1` 或 `v0.1.0-alpha.2` 升级，请先把已复制的 `docker/docker-compose.yml` 中 `services.app.image` 改为该新 tag，然后拉取新镜像并重建容器：

```bash
perl -0pi -e 's#ghcr.io/marble810/vibeslate:v0\.1\.0-alpha\.[12]#ghcr.io/marble810/vibeslate:v0.1.0-alpha.3#' docker/docker-compose.yml
docker compose -f docker/docker-compose.yml pull app
docker compose -f docker/docker-compose.yml up -d app
```

OpenAI/Codex 首次登录推荐在页面 `OpenAI` 卡片中点击 `Login`，也可以使用 CLI（`v0.1.0-alpha.3` 起镜像内已包含所需 `scripts/` 文件）：

```bash
# 仓库便捷命令
bun run docker:openai:login

# 或纯 Docker 命令
docker compose -f docker/docker-compose.yml exec --workdir /app app bun run openai:auth:login
```

部署时只需要维护两个本地文件：

- `docker/.env`：用户配置入口。provider 凭证、OpenAI app-server、密码保护、LAN HTTPS 和 UI 设置都放这里。
- `docker/docker-compose.yml`：Docker 结构层配置。通常只需要从 example 复制一次，不需要日常编辑。

`docker/.env` 中常用字段：

- Runtime：`HOST`、`PORT`、`MARBLE_DATA_DIR`
- DeepSeek：`DEEPSEEK_PLATFORM_TOKEN`
- OpenAI/Codex：`OPENAI_ENABLED`、`OPENAI_CODEX_HOME`、`OPENAI_CODEX_CLI_PATH`、`OPENAI_POLL_INTERVAL_SECONDS`、`OPENAI_SQLITE_PATH`、`OPENAI_AUTH_STATUS_PATH`
- OpenCode Go：`OPENCODE_WORKSPACE_ID`、`OPENCODE_AUTH_COOKIE`
- Password auth：`AUTH_ENABLED`、`AUTH_PASSWORD_HASH`、`AUTH_COOKIE_SECURE`、`AUTH_SESSION_TTL_SECONDS`、`AUTH_COOKIE_NAME`
- LAN HTTPS：`TLS_ENABLED`、`TLS_CERT_FILE`、`TLS_KEY_FILE`、`TLS_ROOT_CA_FILE`
- UI：`UI_CUSTOM_ACCENT`

`AUTH_PASSWORD_HASH` 如果使用 Argon2id hash，粘贴到 `docker/.env` 时请用单引号包住整段值，避免其中的 `$` 被 shell/env 解析。

## Provider 凭证

- **OpenAI / Codex**：启动 Docker 后在 OpenAI 卡片里完成 device-code login，或运行 `bun run docker:openai:login`。VibeSlate 会在容器自己的 `data/docker/codex-home/auth.json` 中保存 Codex-owned auth state；不要上传、复制或粘贴宿主机 `~/.codex/auth.json`。
- **DeepSeek**：浏览器登录 `platform.deepseek.com`，从 DevTools 网络请求的 `Authorization` header 中取 Bearer token，填入 `DEEPSEEK_PLATFORM_TOKEN`。
- **OpenCode Go**：从工作区 URL 获取 `wrk_...`，再从浏览器 Cookie 中取 `auth`，分别填入 `docker/.env` 中的 `OPENCODE_WORKSPACE_ID` 与 `OPENCODE_AUTH_COOKIE`。`v0.1.0-alpha.3` 起 Docker 部署会直接读取这两个环境变量；也仍兼容容器内自动发现 JSON 文件。

更多 Docker 细节见 [docs/DOCKER_DEPLOYMENT.md](docs/DOCKER_DEPLOYMENT.md)。

## 本地开发

```bash
bun install
bun run dev
```

本地开发配置使用 `server/config.jsonc`（可从 `server/config.example.jsonc` 复制）。

- DeepSeek 凭证需要手动写入 `server/config.jsonc` 或显式环境变量。
- OpenAI dev 也使用独立 `openai.codex_home` + backend device-code login；先运行 `bun run dev`，再在另一个终端运行 `bun run openai:auth:login` 连接正在运行的本地后端。
- 如果 dev 后端不在默认 `http://localhost:12001`，给 login 命令传 `--base-url <url>`。
- 如果当前终端无法交互读取密码，可只对该命令设置 `VIBESLATE_PASSWORD='...'`。
- dev 不会自动从 `deepseek-monitor-tui`、宿主机 `~/.codex/auth.json` 或其他宿主机登录状态读取 auth。

## 验证命令

```bash
bun x tsc -p server/tsconfig.json --noEmit
bun test server/src/*.test.ts scripts/openai-auth-login-client.test.ts
bun run build
bun run check:codex-app-server-schema
docker compose -f docker/docker-compose.example.yml config
```

Docker runtime 可选烟测：

```bash
bun run docker:smoke
```

## Alpha 2.0 发布前仍需人工确认

- 使用真实 ChatGPT/Codex 账号在 Docker 容器内完成 device-code 登录。
- 确认 `data/docker/codex-home/auth.json` 创建权限正确，且不依赖宿主机 Codex 状态。
- 确认账号 rate-limit 轮询、SQLite 快照写入与 UI/SSE 广播在真实账号下正常。
- clean checkout + 公开镜像 Docker-only 主路径按 `.env` 的 auth/TLS 配置重新验收。
- Provider 卡片的错误/空状态和连接状态 UI 还可以继续统一打磨。

## 说明

- VibeSlate 不接管反向代理；公网 TLS、限流、Fail2Ban 建议交给用户自己的 Caddy / Nginx / Traefik 等反代处理。
- 当前仓库许可证为 `AGPL-3.0-only`。
