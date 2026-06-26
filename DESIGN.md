# DESIGN.md — VibeSlate

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
- **内部 CSS 变量**: `--bar-height`, `--bar-radius`, `--bar-color`（由 Props 注入，不在全局 token 表中）
- **规则**: 所有 Widget 使用 `<ProgressBar>`；无内联 `.progress-wrap` SCSS

### Trendline.svelte — 通用趋势图
- **位置**: `web/src/components/Trendline.svelte` ✅ 已创建
- **职责**: 纯 SVG 数据趋势图，不依赖第三方图表库
- **Props**: `data: number[]`（数据点）, `mode?: 'line' | 'bar'`（默认 `'line'`）, `color?: string`（默认 `var(--accent)`）, `min?: number`, `max?: number`（domain 可自动计算）
- **line 模式**: Catmull-Rom 平滑曲线 → cubic bezier path，stroke-width 1.5
- **bar 模式**: 垂直柱状图，柱顶圆角（rx = barW/2），opacity 0.85
- **SVG viewBox**: `0 0 300 56`，`preserveAspectRatio="none"` 允许响应式拉伸
- **内部 CSS 变量**: `--line-color`（由 Props `color` 注入）
- **规则**: 所有 Widget 使用 `<Trendline>`；不内联 SVG inline

### EinkCheckIcon / EinkCrossIcon — E-INK 状态图标
- **位置**: `web/src/components/EinkCheckIcon.svelte` / `EinkCrossIcon.svelte` ✅ 已创建
- **职责**: 可复用的 E-INK 模式下 check（✓）与 cross（✗）SVG 控件
- **Props**: `size?: string`（默认 `'10px'`），通过 `--eink-icon-size` CSS 变量控制宽高
- **规则**: Footer 连接状态与 FooterBrandMenu 选中态共享同一组件；禁止各处内联重复 SVG path

### HardwareCard 内部结构（🚧 待实现）
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
- Footer 只允许一个交互入口：中间品牌区 menu trigger（logo + "vibeslate"），trigger 保持低调品牌视觉，不引入醒目 CTA 样式
- 中间品牌区 trigger 允许使用透明 `::before` hit area 向上扩大触控范围，不改变 logo/title 视觉位置或 Footer 高度
### FooterBrandMenu — 品牌菜单
- **位置**: `web/src/components/FooterBrandMenu.svelte` ✅ 已创建
- **职责**: Footer 中间品牌区 theme 切换菜单，封装 `bits-ui` `DropdownMenu`，含嵌套 submenu
- **结构**: Trigger（logo + "vibeslate"）→ Portal → Content（Theme block + divider + two top-level family entries）
  - **Sharp**：`family-card` 容器（outline only，无背景填充），内含 `family-card-header` 标签 + 两个 palette 选项，选项间以 `palette-divider` 分隔。始终展开，无可折叠 toggle。
    - **Default**（`DropdownMenu.Item`，`closeOnSelect={false}`）— 原名 Built-in
    - **Custom Color**（`DropdownMenu.Item`，`closeOnSelect={false}`）
  - **E-INK**（`DropdownMenu.Item`，`closeOnSelect={false}`）：独立 outlined 条目，无背景填充，字体样式与 Sharp header 一致
- **定位**: 主菜单 `side="top" align="center" sideOffset={8}`；无独立二级菜单浮动层，palette 选项 inline 垂直排布于一级菜单内部
- **动效**: open 从下方 12px 滑入 + 淡入 0.3s cubic-bezier(0.16, 1, 0.3, 1)；close 反向 0.3s cubic-bezier(0.7, 0, 0.84, 0)；`prefers-reduced-motion` 时 1ms 瞬时完成
- **触控**: 主菜单宽度 `min(88vw, 360px)` min-width 280px；二级菜单 min-width 200px；theme item min-height 44px
- **Theme 块**: 名称为 `Theme` 的独立 block，上下 divider 分隔
- **Theme item**: 所有选择项 `closeOnSelect={false}` 保持 menu 打开便于连续切换/比较；选中态使用 `<EinkCheckIcon>` 控件
- **Sharp/未来 Family 条目**: 始终展开，无可折叠 toggle，无 chevron
- **Trigger**: 透明 `::before` hit area（left/right -14px, top -22px, bottom -8px）扩大触控范围；`:focus-visible` 使用 `var(--accent)` outline
- **Swatch**: Default 用固定 `#8b5cf6`，Custom Color 用 `var(--custom-accent)`，E-INK 用黑白半圆分割
- **规则**: 不提供 `type="color"` 输入框或其他颜色编辑控件；palette 选择不关闭菜单（所有 item `closeOnSelect={false}`）
- **所有顶级 Theme Family 条目**（Sharp、E-INK、未来新增）的字体样式和颜色必须保持一致：`font-family: var(--font-mono)`、`font-size: var(--text-md)`、`font-weight: 600`、`color: var(--text)`、`text-transform: uppercase`、`letter-spacing: 0.05em`。不存在选中状态下的文字颜色变化。

### PWA 全屏
- Manifest 使用 `display: fullscreen`，优先服务 Android Home Screen PWA / kiosk 场景
- 运行时不自动监听点击/按键触发 `requestFullscreen()`；普通浏览器访问不应在首次交互后被强制全屏
- iOS Home Screen PWA 依赖 `apple-mobile-web-app-capable` 与状态栏配置；不能强制隐藏系统状态栏

## 2. Theme System

### Architecture: Theme Family → Palette

The theme system uses a two-level selection model:

1. **Theme Family** (top-level): `'default'` (dark) or `'eink'` (monochrome). These are peer choices.
2. **Palette** (second-level, Default family only): `'built-in'` (baseline violet accent) or `'custom-color'` (server-configured accent). E-INK has no palette selection.

The user's selection is represented as `ThemeSelection { family, palette? }`. From this, the effective `data-theme` attribute value is derived for CSS:

| ThemeSelection                         | Effective `data-theme` |
|----------------------------------------|------------------------|
| `{ family: 'default', palette: 'built-in' }`   | `default`        |
| `{ family: 'default', palette: 'custom-color' }` | `custom-accent` |
| `{ family: 'eink' }`                   | `eink`                 |

CSS selectors (`:root[data-theme="default"]`, etc.) are driven by `selectionToDataTheme()`; they are not stored in localStorage.

#### LocalStorage Serialization

The `vibeslate:theme` localStorage key stores **JSON** `ThemeSelection` objects only, for example:

`{"family":"default","palette":"built-in"}` or `{"family":"eink"}`.

`readStoredTheme()` parses JSON via `normalizeThemeSelection()`; invalid or missing values fall back to `DEFAULT_SELECTION`. Legacy string values (`default`, `custom-accent`, `eink`) are not read.

### 主题层级（CSS 层）

CSS 实现分 **全局 base** 与 **按主题的 token 包**（TASK-7）：

| 层 | 路径 | 职责 |
|---|---|---|
| **Base（非主题）** | `web/src/styles/base/` | reset、layout（`#app`、`.grid`）、View Transition 动效、`--theme-transition-*` / `--custom-accent` 运行时槽位 |
| **Theme CSS 插件** | `web/src/themes/sharp/index.scss`、`web/src/themes/e-ink/index.scss` | 每套 family 的 **字体、字号、间距/gap、圆角、语义色**（`--font-*`、`--text-*`、`--space-*`、`--radius*`、`--bg`、`--accent` 等） |
| **激活** | `web/src/lib/theme.ts` | `ThemeSelection` → `data-theme`；组件仍只消费 `var(--*)` |
| **Meta 登记** | `web/src/themes/registry.ts`、`web/src/themes/types.ts` | `ThemeCssMeta`（id、label、`dataThemes`）；**不含颜色字面量** |
| **Theme CSS 打包** | `web/src/themes/register-styles.ts` | `import.meta.glob('./*/index.scss', { eager: true })`；新主题只需 `themes/<id>/index.scss`，**不必改 `app.scss`** |

入口：`main.ts` → `import './themes/register-styles'`（主题 SCSS）+ `import './app.scss'`（仅 base：`styles/base/*`）。

`data-theme` 合同值：`'default'` / `'custom-accent'` / `'eink'`，由 `selectionToDataTheme(ThemeSelection)` 派生。

**本阶段范围（TASK-7）**：仅 token/CSS（字体、gap、圆角、颜色）。**不在范围**：按主题替换组件结构或展示形态（如进度条→饼图）；见 Backlog **TASK-6**。

Custom Accent 的颜色值来自服务端配置 `ui.custom_accent`，前端启动后从 `/api/ui-config` 读取并同步为 root inline CSS var `--custom-accent`。

### 规则
- Trendline 与 ProgressBar 使用 `var(--accent)`
- Badge 使用 `--badge-bg` / `--badge-text` / `--badge-border`，默认主题映射到 accent，E-INK 映射为黑字 + 50% 灰 outline
- 禁止各 Widget 分配语义色（success/warning/danger）给图表/进度条
- `--success` / `--danger` / `--warning` 仅用于 Footer 连接/状态点
- 禁止 Widget 局部硬编码主题色；主题切换通过 CSS variables 全局生效
- Custom Accent 第一版只允许通过服务端配置修改 accent；`--bg`、`--surface`、`--text`、`--text-muted`、`--border` 继承 Default
- Theme family 切换使用从下到上 slow reveal animation（2s）；palette 切换使用短 full-screen cross-fade（120ms）。详见 §2.1 Theme Transition Animation
- 连续切换 Theme 时，新的选择必须打断当前 transition，跳过当前 ViewTransition，并以最新目标主题重新启动
- E-INK check/cross SVG 必须从 `components/` 中的可复用控件消费，Footer 与 menu 不内联重复 SVG path

### 全局初始化
- **文件**: `web/src/main.ts`
- **职责**: 挂载 Svelte App、注入 `app.scss`、初始化 Service Worker 跟踪、启动 `--vh` polyfill（`window.innerHeight * 0.01` → `--vh` CSS 变量，resize/orientationchange 时刷新）
- **规则**: `body` 高度使用 `calc(var(--vh, 1vh) * 100)` + `100dvh` fallback，确保 iOS Safari 工具栏不遮挡 Footer

### Theme Transition Animation（主题切换动效）

Theme family 切换与 palette 切换使用不同的 transition，基于 CSS View Transition API（`document.startViewTransition`）。

**实现层次**（`web/src/lib/theme.ts` & `web/src/styles/base/_view-transitions.scss`）：

1. **Transition intent 分离**：`ThemeTransitionKind` 区分 `'theme'`（family 切换）与 `'palette'`（family 内 palette 切换）。
2. **Theme family 切换（如 Default ↔ E-INK）**：从下到上 slow reveal（`clip-path: inset(100% 0 0 0)` → `inset(0 0 0 0)`），支持 `mask-image` 羽化边缘软渐变。duration `2s`。
3. **Palette 切换（如 Default ↔ Custom Color）**：快速 full-screen opacity cross-fade（`theme-fade-out` / `theme-fade-in`）。duration `120ms`。
4. **连续切换**：新的切换通过 `ViewTransition.skipTransition()` 打断当前动画，以最新目标重启。
5. **首次加载**：不触发动画（`appliedTheme === null` 时跳过）。
6. **`prefers-reduced-motion`**：`animation-duration: 1ms`，视觉上瞬时完成。
7. **不支持 View Transitions**：降级为直接 `commitTheme()`，无动画。

**CSS 管线**：

| 步骤 | CSS 机制 | 说明 |
|---|---|---|
| 根元素 class | `.theme-fading.theme-transition-{kind}` | 由 `applyThemeToDocument()` 在调用 `startViewTransition` 前添加到 `<html>` |
| Palette transition | `.theme-transition-palette ::view-transition-*` | old → `theme-fade-out`；new → `theme-fade-in`；duration `var(--palette-transition-duration)` = `120ms` |
| Theme transition | `.theme-transition-theme ::view-transition-new(root)` | `theme-reveal-up-hard`（clip-path）或 `theme-reveal-up-soft`（mask-image feather）；old 无动画；duration `var(--theme-transition-duration)` = `2s` |
| 减动 | `@media (prefers-reduced-motion)` | `animation-duration: 1ms`，视觉上瞬时完成 |

**`theme.ts` 公开 API**：

| 导出 | 类型 | 用途 |
|---|---|---|
| `THEME_FAMILIES` | `readonly ['default', 'eink']` | 有效的 Theme Family 列表 |
| `DEFAULT_PALETTES` | `readonly ['built-in', 'custom-color']` | Default family 的有效 palette 列表 |
| `DEFAULT_SELECTION` | `ThemeSelection` | 默认选择 `{ family: 'default', palette: 'built-in' }` |
| `THEME_STORAGE_KEY` | `'vibeslate:theme'` | localStorage key（JSON `ThemeSelection`） |
| `readStoredTheme()` | `() => ThemeSelection` | 读取持久化主题（含 SSR guard） |
| `applyThemeToDocument(selection, customAccent?, transitionKind?)` | `(ThemeSelection, string?, ThemeTransitionKind?) => void` | 应用主题到 DOM（含 View Transition 调度）；内部映射 `data-theme`；`transitionKind` 默认 `'theme'`，palette 切换传入 `'palette'` |
| `persistTheme(selection)` | `(ThemeSelection) => void` | 写入 localStorage（JSON） |
| `selectionToDataTheme(selection)` | `(ThemeSelection) => DataTheme` | 从 family+palette 推导 `data-theme` 值（模块内 `DataTheme` 类型，不对外导出） |
| `normalizeHexColor(value)` | `(unknown) => string \| null` | 校验并标准化 hex color |

**类型**：

```typescript
type ThemeFamily = 'default' | 'eink';
type DefaultPalette = 'built-in' | 'custom-color';

interface ThemeSelection {
  family: ThemeFamily;
  palette?: DefaultPalette;  // only meaningful when family === 'default'
}

// data-theme values are internal (default | custom-accent | eink), derived via selectionToDataTheme()
```

**规则**：
- `ThemeSelection` 是用户级状态（store 与 localStorage 保存）。
- `data-theme` 由 `selectionToDataTheme()` 推导，`applyThemeToDocument()` 接收 `ThemeSelection`。
- `selectionToDataTheme()` 是从 selection 到 `data-theme` 的公开映射入口（供文档与扩展流程引用）。
- store（`stores.ts` 中 `theme` writable）存储 `ThemeSelection`。
- `meta[name="theme-color"]` 随主题切换同步更新（Default/Custom Accent → `#000000`，E-INK → `#ffffff`）

### 当前默认主题：Default

黑底 + 紫色 accent（产品基线）。不设置 `data-theme` 或 `data-theme='default'` 生效。

| Token | Default value | 用途 |
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

`data-theme='custom-accent'` — 单槽位自定义 accent 主题。它继承 Default 的黑底、surface、文本、边框、状态色，只覆盖 accent 派生 token。

| Token | Custom Accent value | 用途 |
|---|---|---|
| `--custom-accent` | server configured hex color，默认 `#8b5cf6` | 配置的 accent |
| `--accent` | `var(--custom-accent)` | progress/trendline/highlight |
| `--accent-dim` | `color-mix(in srgb, var(--custom-accent) 85%, #000000)` | accent 派生 |
| `--badge-bg` | `color-mix(in srgb, var(--custom-accent) 15%, transparent)` | badge 背景 |
| `--badge-text` | `var(--custom-accent)` | badge 文字 |
| `--badge-border` | `transparent` | badge 无边框 |

Footer 品牌 menu 在 Default 子菜单中只提供 `Custom Color` 选择项和配置色 swatch；不提供 `type="color"`、输入框、滑条或其它前端编辑入口。

### E-INK MODE

`data-theme='eink'` — 高对比、低墨水干扰的显示模式。不是 accent palette 变体，而是独立显示模式。

**重要约束 — 菜单呈现**: E-INK 在品牌菜单中不得有背景色区分或 card 容器感。必须保持全白/无背景的纯文本外观，与 Sharp 的 family-card 容器形成视觉对比。不使用 `brand-menu-item` 的 background、border、border-radius。

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

### Future Extension Rules

The theme family/palette architecture is designed for extension. Follow these rules when adding new themes or palettes:

1. **New Theme Family** (e.g., `'light'`, `'high-contrast'`):
   - Add to `THEME_FAMILIES` array and `ThemeFamily` type in `theme.ts`.
   - Add a new `data-theme` selector in `app.scss` with the full token set.
   - Add a top-level entry in `FooterBrandMenu.svelte` (peer to Default and E-INK).
   - If the family supports palettes, add them as inline vertical expansion items (not `DropdownMenu.Sub`) in the menu panel.
   - Map `selectionToDataTheme()` for the new family.

2. **New Palette** (e.g., `'blue'`, `'green'` accent presets under Default):
   - Add to `DEFAULT_PALETTES` array and `DefaultPalette` type.
   - Add a corresponding `data-theme` CSS selector if it introduces new tokens.
   - Add a `DropdownMenu.Item` inside the Default inline-submenu block.
   - If the palette only differs by accent color, it can share the `custom-accent` pattern (a CSS variable override).

3. **New Palette Style** (non-color, e.g., typography scale, spacing):
   - Consider whether it belongs as a palette under an existing family or as a separate family.
   - Add CSS variables to the appropriate `data-theme` selector.
   - Update `ThemeSelection` if new metadata is needed.

4. **Persistence**:
   - The `data-theme` attribute contract should remain stable for CSS.
   - New families/palettes extend `ThemeSelection` and `selectionToDataTheme()` as needed.
   - The `vibeslate:theme` localStorage key stores JSON `ThemeSelection` only.

5. **Top-level font consistency**: 所有新顶级 Theme Family 条目的字体样式和颜色必须与现有条目（Sharp、E-INK）保持一致：`font-family: var(--font-mono)`、`font-size: var(--text-md)`、`font-weight: 600`、`color: var(--text)`、`text-transform: uppercase`、`letter-spacing: 0.05em`。此项为强制约束，新增主题时不得自定义字体样式。

#### Motion Tokens（Base Tokens，所有主题共享）
| 变量 | 值 | 用途 |
|---|---|---|
| `--theme-transition-duration` | `2s` | Theme family 切换 reveal 时长 |
| `--theme-transition-ease` | `ease` | Theme reveal 缓动函数 |
| `--palette-transition-duration` | `120ms` | Palette 切换 fade 时长（短于 theme） |
| `--theme-reveal-feather` | `50vh` | Theme reveal 软边缘羽化范围 |

#### 形状（Base Tokens，所有主题共享）
| 变量 | 值 | 用途 |
|---|---|---|
| `--radius` | `0` | 卡片圆角 |
| `--radius-sm` | `0.375rem` | badge/小元素圆角 |

#### Spacing Tokens
| 变量 | 值 | 典型用途 |
|---|---|---|
| `--space-xs` | `0.1rem` | card-gap、table cell padding、小间距 |
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
| `--text-xs` | `0.6rem` | （保留；当前 Footer 使用 `--text-sm`） |
| `--text-sm` | `0.55rem` | Footer app 名（vibeslate） |
| `--text-md` | `0.65rem` | 标签、元信息、列头、reset 时间 |
| `--text-lg` | `0.75rem` | Card 标题、model 名称、window label |
| `--text-xl` | `0.8rem` | 正文、余额、credits label、限额告警 |
| `--text-2xl` | `0.85rem` | empty 状态、waiting-card |
| `--text-3xl` | `1.1rem` | App waiting 全屏文字 |
| `--font-size-data-value` | `0.8rem` | 所有卡片中的数值（百分比、花费、token 量），与 `--text-xl` 等值 |

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
- `Card.svelte` 通用容器: `padding: var(--card-padding, var(--space-lg))`（Rounded 主题在 `themes/rounded/index.scss` 定义 `--card-padding`），`gap: var(--card-gap)`
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
| dropdown content | `1000` | FooterBrandMenu `DropdownMenu.Content` |
| dropdown portal | portal 层 | `bits-ui` `DropdownMenu.Portal` 自动 render 到 `document.body`，不参与应用 z-index 栈 |

### 响应式断点
| 断点 | Grid padding | Grid gap | 适用场景 |
|---|---|---|---|
| 默认（< 640px） | `var(--space-xl)` = 1rem | `var(--space-xl)` | 手机竖屏 1 列 |
| ≥ 640px | `var(--space-2xl)` = 1.5rem | `var(--space-xl)` | 平板 2 列 |
| ≥ 1024px | `var(--space-3xl)` = 2rem | `var(--space-2xl)` = 1.5rem | 桌面 3-4 列 |

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
| Theme token system（`default` + semantic color variables） | ✅ 已完成 |
| Custom Accent（单槽位 accent 自定义） | ✅ 已完成 |
| E-INK MODE（`data-theme='eink'`） | ✅ 已完成 |
| Theme family/palette 架构 + 嵌套菜单 | ✅ 已完成 |
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
| CpuCard + RamCard → HardwareCard 合并 | 🚧 待实现（DESIGN.md 已定义，源码未实现） |
| Spacing token 系统（`--space-*`） | ✅ 已完成 |
| Font size token 系统（`--text-*`） | ✅ 已完成 |
| 全局禁用滚动 + Footer 固定底部 | ✅ 已完成 |
| DeepSeekCard 三列表格重构 | ✅ 已完成 |
