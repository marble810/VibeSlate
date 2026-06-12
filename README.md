# Marble Panel

AI Provider 用量看板 — DeepSeek / OpenAI / OpenCode Go 实时额度监控。

## 本地开发

```bash
bun install
bun run dev        # http://localhost:5174
```

配置放在 `server/config.jsonc`（复制 `config.example.jsonc` 填入 token）。

## Docker 部署

所有配置直接在 `docker/docker-compose.yml` 的 `environment` 中设置。

```bash
# 1. 编辑 docker/docker-compose.yml，填入 provider token
# 2. （可选）生成密码 hash：
bun run docker:init

# 3. 启动
bun run docker:up      # http://localhost:12001
bun run docker:smoke   # 验证
```

Marble Panel 不内置反代。在前端自行挂 Caddy / Nginx / Traefik 处理 TLS 和限流。
