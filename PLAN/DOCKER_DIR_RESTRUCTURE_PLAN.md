# PLAN — Docker 文件目录重组

## 状态：✅ 完成

## 目标

将所有 Docker 构建/部署源码统一收敛到 `/docker/` 子目录，消除根目录散落的 Docker 文件。

## 变更

### 目录结构变动

```
之前                                    之后
── Dockerfile                           docker/Dockerfile
── docker-compose.yml                   docker/docker-compose.yml
── docker-compose.lan.yml               docker/docker-compose.lan.yml
── .dockerignore                        .dockerignore          (保留根目录)
── deploy/                              (删除)
   ├── caddy/Caddyfile                  docker/caddy/Caddyfile
   └── fail2ban/                        docker/fail2ban/
── data/docker/                         data/docker/           (不变)
```

### compose 文件路径修正

`docker/docker-compose.yml` 迁入子目录后，内部相对路径基准从项目根变为 `docker/`：

| 原路径 | 新路径 |
|--------|--------|
| `build.context: .` | `build.context: ..` |
| `build.dockerfile: Dockerfile` | `build.dockerfile: docker/Dockerfile` |
| `./data/docker/...` (volumes) | `../data/docker/...` |
| `./deploy/fail2ban/...` | `./fail2ban/...` |

### 脚本更新

- `scripts/docker-up.ts` — compose 文件引用 + `--project-directory .`
- `scripts/docker-smoke.ts` — compose 文件引用 + `--project-directory .`

### AGENTS.md 追加约束

```markdown
- Docker 构建/部署源码统一放在 `/docker/` 子目录（Dockerfile、docker-compose*.yml、Caddyfile、Fail2Ban 配置）
- `.dockerignore` 保留在项目根目录（Docker 构建上下文强制要求）
- 运行时生成数据位于 `data/docker/`（gitignored），不在 `/docker/` 内
- 新增 Docker 容器或辅助服务的 compose 定义、Dockerfile、配置一律进 `/docker/`
```

## 不合并 docker-compose.lan.yml 的原因

Docker Compose 的 `profiles` 作用于整个 service，无法条件性给同一 service 加/去 `ports` 映射。保留 override 文件是 Compose 惯用实践，两个文件均置于 `docker/` 下保持统一。

## 验收

- [x] `docker compose -f docker/docker-compose.yml config` 解析成功
- [x] `docker compose -f docker/docker-compose.yml -f docker/docker-compose.lan.yml config` LAN 模式解析成功（app 有 ports）
- [x] `docker compose -f docker/docker-compose.yml --profile public config` Public 模式解析成功（caddy+fail2ban 激活）
- [x] `deploy/` 目录已删除
- [x] AGENTS.md 已追加 Docker 组织约束
- [x] docs/docker-deployment.md 目录布局已更新
- [x] ROADMAP.md 验证命令已更新
