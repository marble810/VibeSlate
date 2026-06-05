# DESIGN.md — Marble Panel

> 设计规范源文件。UI 实现前必须读取本文 + 实际组件代码。

## 1. 组件所有权

### Widget 粒度
- **HardwareCard**：合并 CPU + RAM 为一张卡片，内部两栏 grid 布局
- **DeepSeekCard** / **OpenAICard** / **OpenCodeCard**：各自独立 Widget，保持业务逻辑隔离

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

## 2. 颜色规则

### 当前版本：统一 accent（紫色）
- 所有 trendline、progress bar、badge 使用 `var(--accent)`（#8b5cf6）
- 禁止各 Widget 分配语义色（success/warning/danger）给图表/进度条
- `--success` / `--danger` 仅用于 Footer 连接状态点
- 理由：后续将实现 Color Theme 系统进行多色主题切换

### CSS 变量表
| 变量 | 值 | 用途 |
|---|---|---|
| `--bg` | `#000000` | 页面背景（纯黑） |
| `--surface` | `#141414` | 卡片/Footer 背景（灰一点） |
| `--surface-hover` | `#1e1e1e` | （保留未使用） |
| `--text` | `#f1f5f9` | 主文字、标题 |
| `--text-muted` | `#888888` | 次要文字、标签、重置日期 |
| `--accent` | `#8b5cf6` | 图表线/进度条/强调色/badge（紫色） |
| `--accent-dim` | `#7c3aed` | （保留未使用） |
| `--success` | `#22c55e` | 连接状态绿点 |
| `--danger` | `#ef4444` | 断连状态红点、限额告警 |
| `--warning` | `#f59e0b` | （保留，待 Theme 系统） |
| `--border` | `#2a2a2a` | 卡片/Footer 边框（比 surface 再灰一点） |
| `--radius` | `0` | 卡片圆角（已去除） |
| `--radius-sm` | `0.375rem` | badge/小元素圆角 |
| `--shadow` | `0 1px 3px rgba(0,0,0,0.3)` | 基础阴影 |
| `--shadow-lg` | `0 4px 12px rgba(0,0,0,0.4)` | （保留未使用） |

## 3. 字体规则

| 字体 | 变量 | 用途 |
|---|---|---|
| `--font-sans` | Inter / SF Pro Display / system | 标题、标签、正文 |
| `--font-mono` | JetBrains Mono / SF Mono / system | 数值、时间戳、空状态文字、Footer 状态文字、版本号 |

**规则**：
- 数据数值必须用 `font-mono`（等宽确保数值对齐）
- 时间显示（Footer 状态、reset 倒计时）用 `font-mono`
- 空状态占位文字用 `font-mono`
- 标签/标题用 `font-sans`（大写 + 0.05em letter-spacing）
- 后续 ROADMAP: custom fonts 功能

## 4. 布局

### Grid 系统
- **策略**: CSS Grid `auto-fill` + `minmax(280px, 1fr)`，自适应 1→2→4 列
- **容器**: `.grid`，`max-width: 1600px`，`margin: 0 auto`，`align-content: start`
- **响应式间距**:
  - 默认: `padding: 1rem`, `gap: 1rem`
  - ≥640px: `padding: 1.5rem`, `gap: 1.25rem`
  - ≥1024px: `padding: 2rem`, `gap: 1.5rem`
- **模式**: Column Only（仅列布局，不做行/区域混合）
- **Header**: ❌ 已删除（Kiosk 模式无需导航头）

### 卡片内部间距
- `Card.svelte`: `padding: 0.75rem`, `gap: 0.5rem`
- `HardwareCard` 两栏 grid 间距: `gap: 1rem`
- `DeepSeekCard` metrics 间距: `gap: 0.4rem`
- `OpenAICard` windows 间距: `gap: 0.75rem`；window 内部: `gap: 0.3rem`
- `OpenCodeCard` windows 间距: `gap: 0.65rem`；window 内部: `gap: 0.2rem`

## 5. 状态规则

### 空状态
- **外观**: 文字居中、`font-mono`、`color: var(--text-muted)`、`font-size: 0.85rem`、`padding: 1.5rem 0`
- **文案**: "等待 {Provider} 数据…"
- **禁止**: 不使用骨架屏占位符

### 动效
- **原则**: Kiosk 展示面板，移动端优先，无 hover 交互
- **卡片 hover**: ❌ 禁止（所有 `:hover` 伪类已移除）
- **数据驱动过渡**: ✅ 保留进度条 `width 0.4s ease`、状态点 `background 0.3s`
- **交互式过渡**: ❌ 禁止（无鼠标悬浮/点击场景）

## 6. Do's & Don'ts

### ✅ Do
- 使用 `var(--*)` CSS 变量，禁止硬编码颜色/间距/圆角
- 数值/时间/空状态用 `font-mono`；标签/标题用 `font-sans`
- 进度条用 `<ProgressBar>` 组件
- Widget 用 `<Card>` 组件包装，禁止内联 `.card` SCSS
- 空状态用居中文字，不用骨架屏
- 新增 Widget 放 `widgets/`；通用 UI 放 `components/`

### ❌ Don't
- 禁止 Tailwind/Windi/UnoCSS 等原子化 CSS
- 禁止 hover 伪类 / `:hover` 样式（Kiosk 无鼠标交互）
- 禁止 pointer 交互过渡动画
- 禁止硬编码视觉值：颜色、字号、间距、圆角必须来自 CSS 变量
- 禁止在 Widget 中自创 base controls（按钮/输入框等），应用层无交互需求
- 禁止跨 Widget 共享样式（各自 SCoped SCSS 独立）

## 7. ROADMAP 关联

| 功能 | 状态 |
|---|---|
| Color Theme 系统（多色主题切换） | ROADMAP Future |
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
