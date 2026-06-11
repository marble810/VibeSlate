# DESIGN.md — Marble Panel

> 设计规范源文件。UI 实现前必须读取本文 + 实际组件代码。

## 1. 组件所有权

### Widget 粒度
- **HardwareCard**：合并 CPU + RAM 为一张卡片，内部两栏 grid 布局
- **DeepSeekCard**: 三列表格（label \| 1d \| 30d），行间距由 `td padding: var(--space-xs)` 控制，Cost 与 model 之间有 `border-top` 分割线
- **OpenAICard** / **OpenCodeCard**：各自独立 Widget，保持业务逻辑隔离

### Card.svelte — 通用卡片容器
- **位置**: `web/src/components/Card.svelte` ✅ 已创建
- **Props**: `label?: string`, `badge?: () => any`（可选右侧元素 snippet）
- **职责**: 统一卡片外观（背景、边框、padding、gap、flex column）
- **用法**: Widget 通过 children slot 注入内容；禁止 Widget 自写 `.card` SCSS
- **badge snippet**: 传入后自动与 title 同行右对齐（`justify-content: space-between`）
- **Kiosk 规则**: 无 hover 伪类

### ProgressBar.svelte — 通用进度条
- **位置**: `web/src/components/ProgressBar.svelte` ✅ 已创建
- **职责**: 统一进度条外观，封装 `bits-ui` `Progress.Root`
- **Props**: `value`, `max`(默认100), `color`(默认`var(--accent)`), `height`(默认`2px`), `radius`(默认`1px`)
- **规则**: 所有 Widget 使用 `<ProgressBar>`；无内联 `.progress-wrap` SCSS

### HardwareCard 内部结构
- **布局**: `grid-template-columns: 1fr 1fr`（CPU | RAM 两栏）
- **每栏 metric-row**: flex 行，标题靠左，数字 + 进度条整体右对齐
  - `right-block`: flex column, `align-items: flex-end`, `margin-left: auto`
  - `top-line`: flex row，数字 + `%` 符号
  - ProgressBar: 在数字下方，宽度填充 right-block
  - 数字字号 `1.25rem`, `%` 字号 `0.75rem`
- **Trendline**: 保持在 metric-row 下方

### 窗口行（OpenAI / OpenCode）
- 单行结构: `[title] [reset datetime] ...[percentage%]`
- title 使用 `--text`（亮），reset datetime 使用 `--text-muted`（暗，低明度）
- percentage 靠右对齐（`margin-left: auto`）

### Footer PWA 状态
- 右侧状态区只显示一个 PWA 状态点，将 Service Worker 与 Wake Lock 合并为单灯状态
- `NOT-PWA`：Service Worker 未 ready，状态点使用 `--danger`
- `PWA`：Service Worker ready 但 Wake Lock 未 active，状态点使用 `--warning`
- `PWA-AWAKE`：Service Worker ready 且 Wake Lock active，状态点使用 `--success`
- Wake Lock 不支持或被系统释放时不额外显示说明文案
- 禁止在 Footer 中加入配置教程、长句说明或额外配置按钮
- Footer 只允许一个交互入口：中间品牌区 menu trigger（logo + "marble-panel"），trigger 保持低调品牌视觉，不引入醒目 CTA 样式
- 中间品牌区 trigger 允许使用透明 `::before` hit area 向上扩大触控范围，不改变 logo/title 视觉位置或 Footer 高度
- dropdown menu 内容向上弹出，不遮挡主 grid，不改变左右状态区职责
- dropdown menu open/close 允许 0.3s state animation：open 从下方轻微位移向上划出并淡入，close 反向淡出；该动效不是 hover/tap 反馈，需尊重 `prefers-reduced-motion`
- dropdown menu 面向 portable device，触控目标要大：menu 宽度不小于 `min(88vw, 360px)`，theme item 高度不小于 `44px`
- theme 相关操作必须收拢在名为 `Theme` 的子块中，子块用 divider 与其它内容分隔；`Marble Purple`、`Custom Accent`、`E-INK` 三个主题都作为同级按钮/菜单项出现
- Theme item 选择后 menu 保持打开，便于连续切换和对比主题；点击外部、Escape 或再次点击 trigger 仍可关闭
- Theme item 选中态使用可复用 E-INK check SVG 控件，不使用字体 `✓`
- Custom Accent 的颜色值来自服务端 `server/config.json` / `server/config.jsonc` 的 `ui.custom_accent`，前端只显示配置色 swatch 和选择项，不提供颜色编辑控件

### PWA 全屏
- Manifest 使用 `display: fullscreen`，优先服务 Android Home Screen PWA / kiosk 场景
- 运行时不自动监听点击/按键触发 `requestFullscreen()`；普通浏览器访问不应在首次交互后被强制全屏
- iOS Home Screen PWA 依赖 `apple-mobile-web-app-capable` 与状态栏配置；不能强制隐藏系统状态栏

## 2. Theme System

### 主题层级

Theme System 分三层，通过 `data-theme` attribute 在 `:root` 切换：

1. **Base tokens**：字体、字号、间距、圆角（不随主题变化）
2. **Semantic color tokens**：组件消费的稳定变量（`--bg`、`--surface`、`--text`、`--accent` 等）
3. **Theme selectors**：`data-theme='marble-purple'`（默认）/ `data-theme='custom-accent'` / `data-theme='eink'`

主题选择通过 `localStorage` key `marble-panel:theme` 持久化，并同步到 `document.documentElement.dataset.theme` 与 `meta[name="theme-color"]`。Custom Accent 的颜色值来自服务端配置 `ui.custom_accent`，前端启动后从 `/api/ui-config` 读取并同步为 root inline CSS var `--custom-accent`。

### 规则
- Trendline 与 ProgressBar 使用 `var(--accent)`
- Badge 使用 `--badge-bg` / `--badge-text` / `--badge-border`，默认主题映射到 accent，E-INK 映射为黑字 + 50% 灰 outline
- 禁止各 Widget 分配语义色（success/warning/danger）给图表/进度条
- `--success` / `--danger` / `--warning` 仅用于 Footer 连接/状态点
- 禁止 Widget 局部硬编码主题色；主题切换通过 CSS variables 全局生效
- Custom Accent 第一版只允许通过服务端配置修改 accent；`--bg`、`--surface`、`--text`、`--text-muted`、`--border` 继承 Marble Purple
- Theme 切换允许 viewport reveal state animation：新主题从 viewport 底部向顶部扩散显示，时长由 `--theme-transition-duration` 控制，软边宽度由 `--theme-reveal-feather` 控制；`--theme-reveal-feather` 使用 `vh` 相对 viewport height 表达，默认 `6vh`；不改变 layout、尺寸或数据进度；首次加载不动画，不支持 View Transitions 或 `prefers-reduced-motion` 时直接切换
- 连续切换 Theme 时，新的选择必须打断当前 reveal animation，跳过当前 ViewTransition，并以最新目标主题重新启动 reveal
- E-INK check/cross SVG 必须从 `components/` 中的可复用控件消费，Footer 与 menu 不内联重复 SVG path

### 当前默认主题：Marble Purple

黑底 + 紫色 accent（产品基线）。不设置 `data-theme` 或 `data-theme='marble-purple'` 生效。

| Token | Marble Purple value | 用途 |
|---|---|---|
| `--bg` | `#000000` | 页面背景（纯黑） |
| `--surface` | `#141414` | 卡片/Footer 背景 |
| `--surface-hover` | `#1e1e1e` | （保留） |
| `--text` | `#f1f5f9` | 主文字、标题 |
| `--text-muted` | `#888888` | 次要文字 |
| `--accent` | `#8b5cf6` | progress/trendline/badge/highlight |
| `--accent-dim` | `#7c3aed` | （保留） |
| `--border` | `#2a2a2a` | 卡片/Footer 边框 |
| `--success` | `#22c55e` | 连接状态绿点 |
| `--danger` | `#ef4444` | 断连/告警 |
| `--warning` | `#f59e0b` | PWA 待机 |
| `--badge-bg` | `color-mix(in srgb, var(--accent) 15%, transparent)` | badge 背景 |
| `--badge-text` | `var(--accent)` | badge 文字 |
| `--badge-border` | `transparent` | badge 无边框 |
| `--shadow` | `0 1px 3px rgba(0,0,0,0.3)` | 基础阴影 |
| `--shadow-lg` | `0 4px 12px rgba(0,0,0,0.4)` | dropdown 阴影 |
| `--status-glow-connected` | `0 0 6px var(--success)` | 左侧 connected 状态点 glow |
| `--status-glow-active` | `0 0 4px var(--success)` | PWA awake 状态点 glow |
| `--status-glow-warning` | `0 0 4px var(--warning)` | PWA sleeping 状态点 glow |

### Custom Accent

`data-theme='custom-accent'` — 单槽位自定义 accent 主题。它继承 Marble Purple 的黑底、surface、文本、边框、状态色，只覆盖 accent 派生 token。

| Token | Custom Accent value | 用途 |
|---|---|---|
| `--custom-accent` | server configured hex color，默认 `#8b5cf6` | 配置的 accent |
| `--accent` | `var(--custom-accent)` | progress/trendline/highlight |
| `--accent-dim` | `color-mix(in srgb, var(--custom-accent) 85%, #000000)` | accent 派生 |
| `--badge-bg` | `color-mix(in srgb, var(--custom-accent) 15%, transparent)` | badge 背景 |
| `--badge-text` | `var(--custom-accent)` | badge 文字 |
| `--badge-border` | `transparent` | badge 无边框 |

Footer 品牌 menu 只提供 `Custom Accent` 选择项和配置色 swatch；不提供 `type="color"`、输入框、滑条或其它前端编辑入口。

### E-INK MODE

`data-theme='eink'` — 高对比、低墨水干扰的显示模式。不是 accent palette 变体，而是独立显示模式。

**核心规则**：
- 背景：纯白 `#ffffff`
- 内容：纯黑 `#000000`
- 图形元素（border/divider/progress/trendline/badge outline）：50% 灰 `#808080`
- 无彩色 glow、彩色阴影、色相状态提示
- 状态识别不只依赖颜色：文字 label 仍可读

| Token | E-INK value | 用途 |
|---|---|---|
| `--bg` | `#ffffff` | 页面背景、Progress track 背景 |
| `--surface` | `#ffffff` | Card/Footer/empty 状态背景 |
| `--surface-hover` | `#ffffff` | （保留） |
| `--text` | `#000000` | 主要内容、数据值、标题 |
| `--text-muted` | `#808080` | 次级标签、reset datetime |
| `--accent` | `#808080` | progress/trendline/badge text |
| `--accent-dim` | `#808080` | （保留） |
| `--border` | `#808080` | Card/Footer outline、table divider |
| `--success` | `#000000` | Connected / active |
| `--danger` | `#000000` | Disconnected / warning text |
| `--warning` | `#808080` | PWA ready but sleeping |
| `--badge-bg` | `transparent` | badge 无填充 |
| `--badge-text` | `#000000` | badge 文字纯黑 |
| `--badge-border` | `#808080` | badge 50% 灰边框 |
| `--shadow` | `none` | 无阴影 |
| `--shadow-lg` | `none` | 无阴影 |
| `--status-glow-connected` | `none` | 无状态点 glow |
| `--status-glow-active` | `none` | 无状态点 glow |
| `--status-glow-warning` | `none` | 无状态点 glow |

#### 形状（Base Tokens，所有主题共享）
| 变量 | 值 | 用途 |
|---|---|---|
| `--radius` | `0` | 卡片圆角 |
| `--radius-sm` | `0.375rem` | badge/小元素圆角 |

#### Spacing Tokens
| 变量 | 值 | 典型用途 |
|---|---|---|
| `--space-xs` | `0.2rem` | card-gap、table cell padding、小间距 |
| `--space-sm` | `0.3rem` | 标签左侧缩进、window 内部 gap |
| `--space-md` | `0.5rem` | window-header gap、Footer 状态组 gap |
| `--space-lg` | `0.75rem` | 卡片 padding、Footer 上下 padding |
| `--space-xl` | `1rem` | grid padding/gap、Footer 左右 padding |
| `--space-2xl` | `1.5rem` | empty 状态 padding、grid ≥640px padding |
| `--space-3xl` | `2rem` | grid ≥1024px padding |
| `--space-4xl` | `3rem` | App waiting 状态 padding |
| `--card-gap` | `var(--space-xs)` | 卡片标题与内容区之间、window section 之间 |

#### Font Size Tokens
| 变量 | 值 | 典型用途 |
|---|---|---|
| `--text-xs` | `0.5rem` | Footer version-tag |
| `--text-sm` | `0.55rem` | Footer app 名（marble-panel） |
| `--text-md` | `0.65rem` | 标签、元信息、列头、reset 时间 |
| `--text-lg` | `0.75rem` | Card 标题、model 名称、window label |
| `--text-xl` | `0.8rem` | 正文、余额、credits label、限额告警 |
| `--text-2xl` | `0.85rem` | empty 状态、waiting-card |
| `--text-3xl` | `1rem` | App waiting 全屏文字 |
| `--font-size-data-value` | `var(--text-xl)` | 所有卡片中的数值（百分比、花费、token 量） |

## 3. 字体规则

| 字体 | 变量 | 用途 |
|---|---|---|
| `--font-sans` | Inter / SF Pro Display / system | 标题、标签、正文 |
| `--font-mono` | JetBrains Mono / SF Mono / system | 数值、时间戳、空状态文字、Footer 全部文字、版本号 |

**字号**：全部通过 `--text-*` token 控制，见 §2 变量表。

**规则**：
- 数据数值必须用 `font-mono`（等宽确保数值对齐）
- 时间显示（reset 倒计时）用 `font-mono`
- 空状态占位文字用 `font-mono`
- Footer 全部文字用 `font-mono`（app 名 + 版本 + 连接状态）
- 标签/标题用 `font-sans`（大写 + 0.05em letter-spacing）

## 4. 布局

### Grid 系统
- **策略**: CSS Grid `auto-fill` + `minmax(280px, 1fr)`，自适应 1→2→4 列
- **容器**: `.grid`，`max-width: 1600px`，`margin: 0 auto`，`align-content: start`，`overflow-y: auto`（卡片区域独立滚动）
- **响应式间距**（通过 `--space-*` token 控制）:
  - 默认: `padding: var(--space-xl)`, `gap: var(--space-xl)`
  - ≥640px: `padding: var(--space-2xl)`, `gap: var(--space-xl)`
  - ≥1024px: `padding: var(--space-3xl)`, `gap: var(--space-2xl)`
- **全局禁用滚动**: `html/body { overflow: hidden }`，页面严格 `100vh`，滚动仅在 `.grid` 内部
- **Footer**: 固定于视口底部，通过 `#app { height: 100vh; flex column }` + `main.grid { flex: 1 }` 实现
- **模式**: Column Only（仅列布局）
- **Header**: ❌ 已删除

### 卡片内部间距（通过 `--space-*` token 统一）
- `Card.svelte` 通用容器: `padding: var(--space-lg)`, `gap: var(--card-gap)` = `var(--space-xs)`
  - title-row 底部额外: `padding-bottom: var(--space-xs)`
- `HardwareCard` 两栏 grid 间距: `gap: 1rem`
- `DeepSeekCard`:
  - 表格布局（三列: label | 1d | 30d），无 `gap` 属性
  - `td padding: var(--space-xs) 0`（行间距）
  - `th padding-bottom: var(--space-sm)`（列头与数据间距）
  - model-header 之间: `border-top` + `padding: var(--space-xs)` 分割线
- `OpenAICard`:
  - windows 间距: `gap: var(--card-gap)`
  - window 内部: `gap: var(--space-sm)`
  - window-header: `gap: var(--space-md)`
- `OpenCodeCard`:
  - windows 间距: `gap: var(--card-gap)`
  - window 内部: `gap: var(--space-xs)`
  - window-header: `gap: var(--space-md)`

### Z-Index
| 层级 | 值 | 用途 |
|---|---|---|
| dropdown | `1000` | Footer 品牌 menu dropdown content |

## 5. 状态规则

### 空状态
- **外观**: 文字居中、`font-family: var(--font-mono)`、`color: var(--text-muted)`、`font-size: var(--text-2xl)`、`padding: var(--space-2xl) 0`
- **文案**: "等待 {Provider} 数据…"
- **禁止**: 不使用骨架屏占位符

### 动效
- **原则**: Kiosk 展示面板，移动端优先，无 hover 交互
- **卡片 hover**: ❌ 禁止（所有 `:hover` 伪类已移除）
- **数据驱动过渡**: ✅ 保留进度条 `width 0.4s ease`、状态点 `background 0.3s`
- **交互式过渡**: ❌ 禁止（无鼠标悬浮/点击场景）

## 6. Do's & Don'ts

### ✅ Do
- 使用 `var(--*)` CSS 变量，禁止硬编码颜色/字号/间距/圆角
- 字号必须走 `--text-*` token，间距必须走 `--space-*` token
- 数值/时间/空状态用 `font-mono`；标签/标题用 `font-sans`
- 进度条用 `<ProgressBar>` 组件
- Widget 用 `<Card>` 组件包装，禁止内联 `.card` SCSS
- 空状态用居中文字，不用骨架屏
- 新增 Widget 放 `widgets/`；通用 UI 放 `components/`

### ❌ Don't
- 禁止 Tailwind/Windi/UnoCSS 等原子化 CSS
- 禁止 hover 伪类 / `:hover` 样式（Kiosk 无鼠标交互）
- 唯一例外：Footer 品牌 menu 内的 trigger、menu item 可使用 `:focus-visible` + `var(--accent)` 的 outline 焦点指示，不使用 `:hover`
- 禁止 pointer 交互过渡动画
- 允许 dropdown open/close 与 Theme 切换这类状态动画；禁止把它们扩展成 hover/tap 反馈动画
- 禁止硬编码视觉值：颜色、字号、间距、圆角必须走 CSS token
- 禁止在 Widget 中自创 base controls（按钮/输入框等），应用层无交互需求
- 禁止跨 Widget 共享样式（各自 SCoped SCSS 独立）

## 7. ROADMAP 关联

| 功能 | 状态 |
|---|---|
| Theme token system（`marble-purple` + semantic color variables） | ✅ 已完成 |
| Custom Accent（单槽位 accent 自定义） | ✅ 已完成 |
| E-INK MODE（`data-theme='eink'`） | ✅ 已完成 |
| Optional accent themes（blue / green / orange 等预设） | ROADMAP Future |
| Custom Fonts（自定义字体） | ROADMAP Future |
| Card.svelte 创建 + 所有 Widget 迁移 | ✅ 已完成 |
| ProgressBar.svelte 创建 + 所有 Widget 迁移 | ✅ 已完成 |
| 移除 hover 样式 | ✅ 已完成 |
| 统一 accent 颜色（紫） | ✅ 已完成 |
| 去除顶部 Header | ✅ 已完成 |
| 纯黑背景 + 深灰卡片 | ✅ 已完成 |
| 卡片圆角去除 | ✅ 已完成 |
| 进度条统一 2px 高 | ✅ 已完成 |
| CpuCard + RamCard → HardwareCard 合并 | ✅ 已完成 |
| Spacing token 系统（`--space-*`） | ✅ 已完成 |
| Font size token 系统（`--text-*`） | ✅ 已完成 |
| 全局禁用滚动 + Footer 固定底部 | ✅ 已完成 |
| DeepSeekCard 三列表格重构 | ✅ 已完成 |
