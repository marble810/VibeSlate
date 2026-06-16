# Codex Token Persistence Plan

## 状态

Draft。

目标：让 Docker 里的 OpenAI Codex 凭证在 `refresh_token` 发生轮转后能够自动持久化，并在容器重启后继续使用最新有效值，不依赖容器内安装 Codex CLI。

---

## 目标与边界

### 目标

- Docker 容器内 OpenAI OAuth 刷新成功后，最新 `refresh_token` 自动写入可持久化位置
- `docker compose down && docker compose up` 后，服务优先读取最新持久化 token，而不是只读 bootstrap config 里的旧值
- 不改变本地开发默认路径：`bun run dev` 继续沿用现有 `server/config.json` / `server/config.jsonc` 自动保存逻辑
- 不要求容器内存在 `~/.codex/auth.json` 或 Codex CLI

### 非目标

- 不在本 Plan 内重做 `docker:init` 的凭证采集 UX
- 不扩展到 DeepSeek / OpenCode Go；本次只处理 OpenAI Codex OAuth token
- 不把 Docker runtime state 再写回只读的 `data/docker/server.config.json`

---

## 现状与根因

当前仓库已经有 OpenAI OAuth 自动刷新能力，但 Docker 场景缺少“刷新后落盘”的闭环。

### 当前真实链路

1. Docker 运行时通过 `MARBLE_CONFIG_FILE=/app/data/server.config.json` 读取静态配置
2. `server/src/openai.ts` 在刷新 token 后，只尝试回写 `server/config.json` / `server/config.jsonc`
3. Docker 容器中真正挂载的是 `data/docker/server.config.json:/app/data/server.config.json:ro`
4. 因为挂载是只读，且 `openai.ts` 也没有写向 `/app/data/...` 的持久化路径，所以：
   - 同一进程内：内存中的新 token 可以继续工作
   - 容器重启后：只能回到旧的 bootstrap token

### 问题本质

当前把 `server.config.json` 同时当成了：

- 启动时的 bootstrap config
- 运行中的最新 token source of truth

但 Docker 模型里这两者应该拆开：

- bootstrap config：静态、只读、由 `docker:init` 生成
- runtime token state：动态、可写、跟随 volume 持久化

---

## 最终设计

### 设计原则

1. **静态配置与运行时状态分离**
2. **Docker 通过显式 env 开启 token-state 路径**
3. **本地开发默认不启用 token-state 文件**
4. **状态文件 schema 直接复用现有 config key，避免字段映射错误**
5. **写入采用原子替换，尽量避免坏 JSON**

### 持久化模型

```text
data/docker/server.config.json          # bootstrap config, read-only mount
data/docker/state/openai-token.json    # runtime state, writable mount
```

容器内路径：

```text
/app/data/server.config.json
/app/data/state/openai-token.json
```

### token state schema

运行时状态文件统一使用下面的字段名：

```json
{
  "version": 1,
  "openai_refresh_token": "rt_xxx",
  "openai_account_id": "acct_xxx",
  "updated_at": "2026-06-11T10:00:00.000Z"
}
```

说明：

- `openai_refresh_token` / `openai_account_id` 与现有 `ServerConfig` key 保持一致
- 不使用 `refresh_token` / `account_id` 这种第二套命名，避免读写不一致
- `version` 预留给后续 schema 演进

### 加载优先级

OpenAI 凭证的最终优先级调整为：

1. 先按现有逻辑得到 bootstrap 值  
   `MARBLE_CONFIG_FILE -> server/config.json|jsonc -> auto-discovery -> env`
2. 如果 `MARBLE_OPENAI_TOKEN_STATE_FILE` 指向的文件存在且可解析：
   - 用其中的 `openai_refresh_token` 覆盖 bootstrap token
   - 如存在 `openai_account_id`，一并覆盖
3. 如果 state 文件不存在：继续使用 bootstrap config
4. 如果 state 文件损坏：记录 warning，忽略该文件，继续使用 bootstrap config

### 写入策略

当 OpenAI refresh 成功时：

- **Docker token-state 模式开启**：总是把“当前最新可用”的 refresh token 写入 state 文件  
  不要求一定发生轮转后才写
- **Docker token-state 模式未开启**：保留当前本地开发逻辑，继续尝试回写 `server/config.json` / `server/config.jsonc`

这样有两个直接好处：

- 首次 Docker 启动不需要预先创建 `openai-token.json`
- 即使本次 refresh 返回的 token 没有轮转，也能把当前有效值落盘，形成稳定 source of truth

---

## 文件变更清单

| 文件 | 改动 |
|---|---|
| `server/src/openai.ts` | 新增 runtime state 持久化 helper；Docker 下写 `MARBLE_OPENAI_TOKEN_STATE_FILE`；本地 dev 继续走现有 config auto-save |
| `server/src/config.ts` | 新增 `loadOpenAITokenState()`；在现有 bootstrap 解析完成后覆盖 OpenAI token/account |
| `docker/docker-compose.yml` | 为 app 增加 state 目录挂载；新增 `MARBLE_OPENAI_TOKEN_STATE_FILE=/app/data/state/openai-token.json` |
| `docker/Dockerfile` | 确保 `/app/data/state` 目录存在 |
| `scripts/docker-init.ts` | 创建 `data/docker/state/` 目录；不要求预写 `openai-token.json` |

---

## 具体实施

### 1. `server/src/openai.ts`

新增一个专门的 runtime state 写入逻辑，例如：

- `getOpenAITokenStatePath(): string | null`
- `persistOpenAITokenState(refreshToken: string, accountId: string): void`

关键约束：

- 只有在 `MARBLE_OPENAI_TOKEN_STATE_FILE` 存在时，才走 Docker runtime state 持久化路径
- 写入前确保父目录存在：`mkdirSync(dirname(path), { recursive: true })`
- 读取旧 state 失败时，不中断流程；记录 warning 后按空对象重建
- 写入使用“临时文件 + rename”原子替换，避免写到一半留下坏 JSON
- 成功 refresh 后，无论 token 是否轮转，都用最新值落盘
- 如果 Docker state 路径未启用，则继续执行现有 `config.json/jsonc` auto-save 逻辑

建议的写入行为：

```text
successful refresh
  -> choose latest refresh token
  -> persist to state file if MARBLE_OPENAI_TOKEN_STATE_FILE is set
  -> otherwise keep legacy local-dev auto-save path
```

### 2. `server/src/config.ts`

新增 `loadOpenAITokenState(path)`，负责：

- 读取 JSON
- 校验 `openai_refresh_token` / `openai_account_id` 是否为非空字符串
- 忽略未知字段
- 坏文件只告警，不抛异常中断服务

合并方式：

1. 先保留当前 `loadConfig()` 的 bootstrap 解析逻辑
2. 在得到 `finalRefresh` / `finalAccount` 后
3. 再尝试读 `MARBLE_OPENAI_TOKEN_STATE_FILE`
4. 有值则覆盖 OpenAI 相关字段

这一步必须放在 bootstrap 解析之后，才能保持：

- Docker：state file 是最新 source of truth
- 本地：没有 state file 时，行为完全不变

### 3. `docker/docker-compose.yml`

改成**目录挂载**，不要挂单个文件。

目标配置：

```yaml
services:
  app:
    environment:
      - MARBLE_OPENAI_TOKEN_STATE_FILE=/app/data/state/openai-token.json
    volumes:
      - ../data/docker/server.config.json:/app/data/server.config.json:ro
      - ../data/docker/state:/app/data/state
```

这样做的原因：

- 避免首次启动时 host 侧文件不存在导致 bind-mount 行为不确定
- 后续如果还要持久化别的 runtime state，不需要再加新的 file mount
- operator 也更容易理解：`data/docker/state/` 就是运行时状态目录

### 4. `docker/Dockerfile`

补一个显式目录创建：

```dockerfile
RUN mkdir -p /app/data/state
```

这不是功能核心，但能让容器目录结构更明确。

### 5. `scripts/docker-init.ts`

`docker:init` 需要做的最小改动：

- 保证 `data/docker/state/` 目录被创建
- 不要求写入 `openai-token.json`
- 继续把 bootstrap token 放在 `data/docker/server.config.json`

### 明确不做

本 Plan **不把**“从 `~/.codex/auth.json` 自动拷贝 token 到 `openai-token.json`”作为必需步骤。

理由：

- 这属于 init UX 优化，不是 runtime persistence 的必要条件
- 只要 bootstrap config 中已经有初始 token，首次成功 refresh 后 state 文件就会自动建立

如需提升 init 体验，可在后续单独开 Plan：

- `docker:init` 自动从 host `~/.codex/auth.json` 发现并填充 bootstrap config

---

## 行为矩阵

| 场景 | `server.config.json` | `state/openai-token.json` | 结果 |
|---|---|---|---|
| 首次 Docker 启动 | 有 bootstrap token | 不存在 | 先用 bootstrap token；首次 refresh 成功后自动生成 state 文件 |
| 正常运行后重启 | 旧 bootstrap token | 存在最新 token | 启动时优先读 state；继续使用最新 token |
| refresh 返回同一个 token | 有 | 已存在或不存在 | 仍写 state，确保当前有效值落盘 |
| state 文件损坏 | 有 | 坏 JSON | 启动时 warning + fallback bootstrap；若 bootstrap 仍有效，下次 refresh 会重建 state |
| 本地 `bun run dev` | `server/config.json` | 默认无 | 保持现有本地 auto-save 行为 |

---

## 验证计划

## 预检

- Docker daemon 可用
- 当前机器具备可用的 OpenAI bootstrap 凭证
- `data/docker/server.config.json` 中已存在 `openai_refresh_token` / `openai_account_id`，或 `docker:init` 已按当前流程生成

### A. 代码级验证

- [ ] `loadConfig()` 在未设置 `MARBLE_OPENAI_TOKEN_STATE_FILE` 时行为不变
- [ ] state 文件存在时，OpenAI token/account 会覆盖 bootstrap config
- [ ] state 文件坏 JSON 时，服务不会崩溃，只会 warning
- [ ] runtime state 写入使用原子替换，且现有坏文件可被覆盖重建

### B. Docker 功能验证

- [ ] `bun run docker:init`
- [ ] `data/docker/state/` 被创建
- [ ] `bun run docker:up`
- [ ] 首次成功拉取 OpenAI 数据后，host 侧出现 `data/docker/state/openai-token.json`
- [ ] `docker compose down && docker compose up` 后，服务仍能继续拉取 OpenAI 数据

### C. 持久化优先级验证

为了验证“重启后读取的是 state，而不是 bootstrap config”，使用下面的方式：

1. 先让容器正常跑起来，确认 `data/docker/state/openai-token.json` 已生成
2. 备份 `data/docker/server.config.json`
3. 将 `server.config.json` 中的 `openai_refresh_token` 临时改成一个明确无效值
4. 执行 `docker compose down && docker compose up -d`
5. 观察 OpenAI refresh 是否仍然成功

验收标准：

- [ ] 即使 bootstrap config 中是无效 token，只要 state 文件里保留最新有效 token，重启后仍能工作

这项验证比“等待真实 token 轮转一次”更直接，也更可重复。

---

## 风险与处理

| 风险 | 处理 |
|---|---|
| state 文件写坏 | 使用临时文件 + rename 原子替换，尽量避免坏 JSON |
| state 文件损坏且 bootstrap token 已过期 | 这是少见但真实的故障场景；需要手动 reseed bootstrap token 或删除坏 state 后重新注入有效 token |
| 多实例同时写 state | 当前 compose 部署默认为单实例；本 Plan 不处理多 writer 竞态 |
| operator 修改了 `server.config.json` 但忘记同步 state | 文档明确：Docker runtime 下 state 文件优先；若要强制切换 bootstrap token，需要同时删除旧 state 文件 |

---

## 成功标准

以下条件全部满足，才算这份 Plan 完成：

- [ ] Docker 下 OpenAI refresh 成功后，`data/docker/state/openai-token.json` 自动生成并持续更新
- [ ] 容器重启后优先读取 state 文件中的最新 token
- [ ] 本地 `bun run dev` 不回归
- [ ] 文档和实现都明确：`server.config.json` 是 bootstrap config，`data/docker/state/` 是 runtime state

---

## ROADMAP 同步要求

本 Plan 落地并验证完成后，需要同步更新 `ROADMAP.md` 的 Phase 7 Docker Deployment 部分，明确：

- token persistence 已实现
- 验证范围是代码级、Docker 重启级，还是已完成真实凭证联调
- 若存在未跑通项，必须明确阻断条件，不能提前标记为完成
