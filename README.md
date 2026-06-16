# VibeSlate

> Turn your spare phones, tablets and e-ink readers into always-on LLM usage monitors.
>
> 将你的闲置手机、平板和电纸书变成常亮 LLM 用量监控器。

## Docker Alpha 部署

```bash
cp docker/docker-compose.example.yml docker/docker-compose.yml
./docker/GetCodexAuthInfo.sh
docker compose -f docker/docker-compose.yml up -d app
```

默认地址是 `http://localhost:12001`。

密码保护和 LAN HTTPS 也都直接在 `docker/docker-compose.yml` 里通过 bool/string 字段开启或关闭，不再走额外交互初始化。

`docker/docker-compose.yml` 中由用户手动填写的主要字段：

- `DEEPSEEK_PLATFORM_TOKEN`
- `OPENAI_REFRESH_TOKEN`
- `OPENAI_ACCOUNT_ID`
- `OPENCODE_WORKSPACE_ID`
- `OPENCODE_AUTH_COOKIE`
- `AUTH_ENABLED`
- `AUTH_PASSWORD_HASH`
- `AUTH_COOKIE_SECURE`
- `TLS_ENABLED`
- `TLS_CERT_FILE`
- `TLS_KEY_FILE`
- `TLS_ROOT_CA_FILE`

## Provider 凭证

- `OpenAI`: 运行 `./docker/GetCodexAuthInfo.sh` 或 `./docker/GetCodexAuthInfo.ps1`，从宿主机 `~/.codex/auth.json` 打印可直接粘贴到 compose 的值。
  如果 app 日志提示 `Refresh token rejected (401)`，说明本机 `auth.json` 落后于某个已有安装里最近一次 runtime 旋转出的 token；这时可改用已有安装的 `openai-token.json`：
  `./docker/GetCodexAuthInfo.sh --state-file /path/to/data/docker/state/openai-token.json`
- `DeepSeek`: 浏览器登录 `platform.deepseek.com`，从 DevTools 网络请求的 `Authorization` header 里取 Bearer token。
- `OpenCode Go`: 从工作区 URL 获取 `wrk_...`，再从浏览器 Cookie 中取 `auth`。

更多 Docker 细节见 [docs/DOCKER_DEPLOYMENT.md](/Users/liangkeren/Coding/marble-panel/docs/DOCKER_DEPLOYMENT.md)。

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
