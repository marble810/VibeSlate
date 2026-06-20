<div align="center">

# VibeSlate

> Turn your spare phones, tablets and e-ink readers into always-on LLM usage monitors.
>
> 将你的闲置手机、平板和电纸书变成常亮 LLM 用量监控器。

</div>

## Docker Alpha 部署

```bash
cp docker/docker-compose.example.yml docker/docker-compose.yml
cp docker/.env.example docker/.env
docker compose -f docker/docker-compose.yml up -d app
```

默认地址是 `http://localhost:12001`。
OpenAI/Codex 首次登录可以运行 `bun run docker:openai:login`（仓库便捷命令），也可以用纯 Docker 命令：

```bash
docker compose -f docker/docker-compose.yml exec --workdir /app app bun run openai:auth:login
```

也可以在页面的 `OpenAI` 卡片里完成 device-code login。

部署时只需要维护两个本地文件：

- `docker/.env`
  用户配置入口。provider 凭证、OpenAI app-server、密码保护、LAN HTTPS 和 UI 设置都放这里。
- `docker/docker-compose.yml`
  Docker 结构层配置。通常只需要从 example 复制一次，不需要日常编辑。

`docker/.env` 中由用户手动填写的主要字段：

- `HOST`
- `PORT`
- `DEEPSEEK_PLATFORM_TOKEN`
- `OPENAI_ENABLED`
- `OPENAI_CODEX_HOME`
- `OPENAI_CODEX_CLI_PATH`
- `OPENAI_POLL_INTERVAL_SECONDS`
- `OPENAI_SQLITE_PATH`
- `OPENAI_AUTH_STATUS_PATH`
- `OPENCODE_WORKSPACE_ID`
- `OPENCODE_AUTH_COOKIE`
- `AUTH_ENABLED`
- `AUTH_PASSWORD_HASH`
- `AUTH_COOKIE_SECURE`
- `AUTH_SESSION_TTL_SECONDS`
- `AUTH_COOKIE_NAME`
- `TLS_ENABLED`
- `TLS_CERT_FILE`
- `TLS_KEY_FILE`
- `TLS_ROOT_CA_FILE`
- `UI_CUSTOM_ACCENT`

`AUTH_PASSWORD_HASH` 如果使用 Argon2id hash，粘贴到 `docker/.env` 时请用单引号包住整段值，避免其中的 `$` 被错误解析。

## Provider 凭证

- `OpenAI`: 启动 Docker 后运行 `bun run docker:openai:login` 或上面的纯 Docker 命令，或在 OpenAI 卡片里点击 `Login`，按显示的 device code 完成 ChatGPT/Codex 登录。
  VibeSlate 会在容器自己的 `data/docker/codex-home/auth.json` 中保存 Codex-owned auth state；不要上传、复制或粘贴宿主机 `~/.codex/auth.json`。
- `DeepSeek`: 浏览器登录 `platform.deepseek.com`，从 DevTools 网络请求的 `Authorization` header 里取 Bearer token。
- `OpenCode Go`: 从工作区 URL 获取 `wrk_...`，再从浏览器 Cookie 中取 `auth`。

更多 Docker 细节见 [docs/DOCKER_DEPLOYMENT.md](/Users/liangkeren/Coding/marble-panel/docs/DOCKER_DEPLOYMENT.md)。

## 本地开发

```bash
bun install
bun run dev
```

本地开发配置使用 `server/config.jsonc`。

- `DeepSeek` 凭证需要手动写入 `server/config.jsonc` 或显式环境变量。
- OpenAI dev 也使用独立 `openai.codex_home` + backend device-code login；先运行 `bun run dev`，再在另一个终端运行 `bun run openai:auth:login` 连接正在运行的本地后端。
- 如果 dev 后端不在默认 `http://localhost:12001`，给 login 命令传 `--base-url <url>`；如果当前终端无法交互读取密码，可只对该命令设置 `VIBESLATE_PASSWORD='...'`。
- dev 不会自动从 `deepseek-monitor-tui`、宿主机 `~/.codex/auth.json` 或其他宿主机登录状态读取 auth。

## 说明

- Docker 是唯一部署方式；日常开发仍使用 `bun run dev`。
- VibeSlate 不接管反向代理。TLS、限流、Fail2Ban 由用户自己的反代处理。
- 当前仓库许可证为 `AGPL-3.0-only`。
