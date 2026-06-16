# VibeSlate

部署在闲置手机、平板或电子书设备上的 PWA 信息板。当前主功能是 LLM usage 监控，后续会继续扩展 hardware info、weather 等长期驻留信息面板。

## Docker Alpha 部署

公开部署路径只要求 Docker Compose，不要求 Bun。

```bash
cp docker/docker-compose.example.yml docker/docker-compose.yml
./docker/GetCodexAuthInfo.sh
docker compose -f docker/docker-compose.yml run --rm init
docker compose -f docker/docker-compose.yml up -d app
```

默认地址是 `http://localhost:12001`。

`docker/docker-compose.yml` 中由用户手动填写的主要环境变量：

- `DEEPSEEK_PLATFORM_TOKEN`
- `OPENAI_REFRESH_TOKEN`
- `OPENAI_ACCOUNT_ID`
- `OPENCODE_WORKSPACE_ID`
- `OPENCODE_AUTH_COOKIE`

## Provider 凭证获取

- `OpenAI`: 运行 `./docker/GetCodexAuthInfo.sh` 或 `./docker/GetCodexAuthInfo.ps1`，从宿主机 `~/.codex/auth.json` 打印可直接粘贴到 compose 的值。
- `DeepSeek`: 浏览器登录 `platform.deepseek.com`，从 DevTools 网络请求的 `Authorization` header 里取 Bearer token。
- `OpenCode Go`: 从工作区 URL 获取 `wrk_...`，再从浏览器 Cookie 中取 `auth`。

## 可选初始化

`docker compose -f docker/docker-compose.yml run --rm init` 会做三件事：

- 检查 provider env 是否已填写。
- 可选生成密码登录所需的 `AUTH_PASSWORD_HASH`。
- 可选生成 LAN HTTPS 证书到 `data/docker/certs/`。

Init 只打印你需要粘贴回 compose 的 YAML 行，不会自动改文件。

## 本地开发

```bash
bun install
bun run dev
```

本地开发配置使用 `server/config.jsonc`。

## 说明

- Docker 是唯一部署方式；日常开发仍使用 `bun run dev`。
- VibeSlate 不接管反向代理。TLS、限流、Fail2Ban 由用户自己的反代处理。
- 当前仓库许可证为 `AGPL-3.0-only`。
