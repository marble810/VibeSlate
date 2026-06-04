# Marble Panel — Plan v2

> Dashboard-like 展示平台 · PWA SPA · AI Provider 用量 + 系统监测

---

## 0. 关于 Bun 后端性能

| Runtime | 空闲内存 | 吞吐 (hello world) |
|---|---|---|
| Bun.serve() | ~12 MB | ~1M req/s |
| Node + Express | ~40 MB | ~50K req/s |
| Go net/http | ~5 MB | ~500K req/s |
| Rust axum | ~3 MB | ~2M req/s |

**结论：保持 Bun。** 你的场景（每 2s 推送一次 SSE，单连接）12MB vs 5MB 差距无实际意义。拆成两个语言栈反而增加构建复杂度。Bun 一个工具链覆盖前后端，shared types 直接 import，不需要 monorepo 联调。追求再轻一点就 Go，但没有必要。

---

## 1. 架构概览

```
┌────────────────── Docker ───────────────────────┐
│                                                  │
│  ┌─────────────── Bun.serve() :80 ────────────┐ │
│  │                                              │ │
│  │  GET  /events   →  SSE push (2s interval)   │ │
│  │  GET  /*         →  Svelte SPA static dist  │ │
│  │                                              │ │
│  └──────────────────────────────────────────────┘ │
│                                                  │
└──────────────────────────────────────────────────┘

开发：Vite :5173 ── proxy /events ──> Bun :12001
```

- **Backend**：Bun.serve()，零依赖，SSE 推送 mock 数据 + 生产环境 serve 前端静态文件
- **Frontend**：Vite + Svelte 5 SPA，bits-ui 无头组件 + SCSS，PWA
- **Dev Docker**：两阶段构建，oven/bun 运行时镜像

---

## 2. 技术选型

| 层 | 选型 | 理由 |
|---|---|---|
| Runtime | Bun 1.3 | 统一工具链，启动快，内存低 |
| Frontend | Svelte 5 + Vite + TypeScript | runes 语法，轻量响应式 |
| UI 组件 | `bits-ui` (headless) | 无障碍原语，无样式捆绑 |
| 样式 | Svelte `<style lang="scss">` + CSS 变量 | 组件级隔离，SCSS 嵌套/变量/mixin |
| 禁用 | ~~Tailwind~~ ~~shadcn-svelte~~ | 见 AGENTS.md |
| PWA | `vite-plugin-pwa` | 自动生成 SW + manifest |
| Backend | Bun.serve() + SSE | 零依赖 |
| 容器 | Docker + oven/bun | 单进程，serve API + 静态文件 |

---

## 3. 项目目录结构

```
marble-panel/
├── AGENTS.md                # 项目约束
├── PLAN.md                  # 本文件
├── docker-compose.yml
├── Dockerfile
├── package.json             # workspace root
│
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts         # Bun.serve (SSE + prod静态文件)
│   │   └── mock.ts          # 随机数据生成器
│   └── bun.lockb
│
├── web/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts       # PWA plugin + proxy → backend
│   ├── svelte.config.js
│   ├── index.html
│   ├── public/
│   │   └── icons/           # PWA icons (192, 512)
│   ├── src/
│   │   ├── main.ts          # SPA 入口
│   │   ├── App.svelte       # 根组件 + SSE 连接 + 布局
│   │   ├── app.scss         # 全局样式 & CSS 变量 & SCSS 工具
│   │   ├── lib/
│   │   │   ├── sse.ts       # SSE client 封装
│   │   │   ├── stores.ts    # Svelte stores
│   │   │   └── types.ts     # 共享类型（与 server 同步）
│   │   ├── components/      # 通用组件
│   │   │   ├── Header.svelte
│   │   │   ├── Footer.svelte
│   │   │   └── MetricCard.svelte
│   │   └── widgets/         # 业务卡片
│   │       ├── CpuCard.svelte
│   │       ├── RamCard.svelte
│   │       ├── DeepSeekCard.svelte
│   │       └── OpenAICard.svelte
│   └── bun.lockb
│
└── .vscode/
    └── settings.json
```

---

## 4. 数据模型 & SSE 协议

### SSE 事件格式

```
event: snapshot
data: {"ts":1700000000,"cpu":23.5,"ram":67.2,"deepseek":{"tokens":12450,"cost":0.37},"openai":{"tokens":8970,"cost":1.14}}
```

- `snapshot` 事件：后端每 2 秒推送一次完整快照
- 后续可扩展 `event: alert` 等

### TypeScript 类型 (`web/src/lib/types.ts`)

```ts
interface ProviderUsage {
  tokens: number;
  cost: number;
}

interface Snapshot {
  ts: number;
  cpu: number;           // percentage
  ram: number;           // percentage
  deepseek: ProviderUsage;
  openai: ProviderUsage;
}
```

### Mock 生成策略 (`server/src/mock.ts`)

- CPU：正弦波 20~80%，加随机噪声
- RAM：缓慢递增 50~90%，模拟内存泄漏
- DeepSeek tokens：每日累计，增速模拟工作时段
- OpenAI tokens：同上，量级为 DeepSeek 的 2-3 倍

---

## 5. 前端组件树 & 数据流

```
App.svelte
├── Header                # 标题 + 实时时钟
├── main.grid             # CSS Grid responsive
│   ├── CpuCard           # bits-ui Progress + 数值
│   ├── RamCard           # bits-ui Progress + 数值
│   ├── DeepSeekCard      # Token 累计 + Cost 折线
│   └── OpenAICard        # 同上
└── Footer                # 连接状态 / PWA 更新提示
```

**数据流**：SSE → `sse.ts` (EventSource wrapper) → Svelte `$state` / `writable` stores → 各 widget 自动响应式更新

**样式方案**：
- `app.scss`：全局 CSS 变量 + SCSS mixin / 基础工具
- 每个组件：Svelte `<style lang="scss">` scoped block
- Vite 内置 SCSS 支持，无需额外 plugin（sass 包即可）
- `MetricCard.svelte`：通用卡片容器，slot 注入内容

---

## 6. PWA 要素

| 要素 | 实现 |
|---|---|
| manifest | `vite-plugin-pwa` 自动生成 |
| Service Worker | workbox (cacheFirst 静态资源) |
| Icons | 192×192 + 512×512 PNG |
| Update prompt | Footer 显示刷新按钮 |

---

## 7. Docker / Dev 工作流

### `docker-compose.yml`

```yaml
services:
  marble-panel:
    build: .
    ports:
      - "3000:80"
```

### `Dockerfile`（两阶段）

```dockerfile
# Stage 1: build frontend
FROM oven/bun:1 AS frontend
COPY web/ /app/web/
WORKDIR /app/web
RUN bun install && bun run build

# Stage 2: runtime
FROM oven/bun:1
COPY server/ /app/server/
COPY --from=frontend /app/web/dist /app/web/dist
WORKDIR /app/server
RUN bun install --production
EXPOSE 80
CMD ["bun", "src/index.ts"]
```

> 单进程：Bun.serve() 在 `/events` 推送 SSE，其余路径 serve 前端 dist。

### Dev 模式

```bash
# Terminal 1: backend
cd server && bun --watch src/index.ts

# Terminal 2: frontend (Vite HMR)
cd web && bun run dev
# Vite 自动 proxy /events → localhost:3001
```

### Docker 运行

```bash
docker compose up --build
# 访问 http://localhost:3000
```

---

## 8. 实施分步

### Phase 1 — 骨架 (当前)
- [ ] 初始化目录结构
- [ ] `server/` Bun.serve + SSE + mock
- [ ] `web/` Vite + Svelte 5 + bits-ui 安装
- [ ] 全局 CSS 变量 & 基础布局
- [ ] SSE 客户端连接，数据渲染到页面

### Phase 2 — UI 完善
- [ ] bits-ui 组件封装（Progress, Card 等）
- [ ] 响应式网格布局 (1 / 2 / 4 列)
- [ ] 用量趋势图（纯 SVG 折线）

### Phase 3 — PWA + Docker
- [ ] `vite-plugin-pwa` 配置
- [ ] PWA manifest + icons
- [ ] Dockerfile + docker-compose
- [ ] 端到端验证

### Phase 4 — 真实数据 (后续)
- [ ] 替换 mock 为真实 API 调用

---

## 9. 待你确认

1. **架构模式**：前端 SPA + 独立后端，还是 SvelteKit 一体？
2. **SSE vs WebSocket**：SSE 够用（单向推送），还是需要 WS 双向？
3. **图表**：纯 SVG 趋势线，还是引入 chart library？
4. **Docker 单进程**：要不要 backend 直接 serve 前端静态文件（省掉 nginx）？
5. **多页面/路由**：一个 Dashboard 页面，还是多 tab？
6. **真实数据来源**：DeepSeek/OpenAI 用量的获取 API 是什么？
