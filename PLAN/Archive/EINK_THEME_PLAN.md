# E-INK Mode Theme Plan

## 背景

Marble Panel 当前只有一套全局 `:root` CSS variables，实际视觉是黑底 + 紫色 accent。`DESIGN.md` 里把当前颜色规则定义为“统一 accent（紫色）”，并把 Color Theme 系统列为 Future。

本计划要做两件事：

1. 先扩展当前项目的主题系统，让主题不再等同于一组散落在 `:root` 的颜色变量。
2. 在这个主题系统下新增独立的 `E-INK MODE`，它不是未来“多色 accent 主题”的一个颜色变体，而是一个高对比、低墨水干扰的显示模式。

## UI Contract Preflight

| 项 | 决策 |
|---|---|
| UI scope | 全局主题 token、卡片/Footer/进度条/trendline/badge/状态色的颜色映射 |
| Existing controls | 复用现有 `Card.svelte`、`ProgressBar.svelte`、`Trendline.svelte`、Footer 与各 Widget 的 token 消费方式 |
| Design rules | 遵守 `DESIGN.md` 的 CSS variables、SCSS scoped style、无 Tailwind、无 hover、kiosk 展示面板规则 |
| Files to edit | `DESIGN.md`、`ROADMAP.md`、`web/src/app.scss`，必要时少量调整 `ProgressBar.svelte` / `Trendline.svelte` / Widget token usage |
| New base control | 否。主题系统先走 CSS variable + app-level theme attribute，不新增 UI primitive |
| Verification | `bun run build`；运行时检查默认紫色主题和 E-INK mode 的视觉差异 |

## 非目标

- 不实现完整用户可配置 Theme Picker。
- 不把 Future 的多色主题系统提前做完。
- 不引入 Tailwind / Windi / UnoCSS / CSS-in-JS。
- 不把 Widget 的业务结构和布局一起重构。
- 不用色相在 E-INK 中表达状态；E-INK 需要文字或形状兜底。

## Theme System Expansion

### 主题层级

将主题拆成三层：

1. **Base tokens**：字体、字号、间距、圆角等不随颜色主题变化的变量。
2. **Semantic color tokens**：组件消费的稳定变量，例如 `--bg`、`--surface`、`--text`、`--text-muted`、`--border`、`--accent`。
3. **Theme selectors**：通过 app-level attribute 切换具体主题，例如：

```scss
:root,
:root[data-theme='marble-purple'] {
  --bg: #000000;
  --surface: #141414;
  --text: #f1f5f9;
  --text-muted: #888888;
  --accent: #8b5cf6;
  --border: #2a2a2a;
}

:root[data-theme='eink'] {
  --bg: #ffffff;
  --surface: #ffffff;
  --text: #000000;
  --text-muted: #808080;
  --accent: #808080;
  --border: #808080;
}
```

### 默认主题命名

现有视觉命名为 `marble-purple`：

- 它是当前产品默认主题。
- 它保留紫色 accent、黑底、深灰 surface。
- 它不是 Future 多色主题系统的一部分，而是当前默认基线。

### E-INK 模式命名

新增主题命名为 `eink`：

- 它是显示模式，不是 accent palette。
- 它允许牺牲紫色品牌感，优先纯白背景、纯黑内容和 50% 灰图形元素。
- 它应该能独立于后续 `blue` / `green` / `orange` 等 accent themes 存在。

## E-INK Color Contract

E-INK mode 的核心规则：

- 背景：纯白 `#ffffff`
- 内容：纯黑 `#000000`
- Outline / border / divider / progress / trendline / badge outline：50% 灰 `#808080`
- 不使用彩色 glow、彩色阴影或色相状态提示

建议 token 映射：

| Token | E-INK value | 用途 |
|---|---:|---|
| `--bg` | `#ffffff` | 页面背景、Progress track 背景 |
| `--surface` | `#ffffff` | Card/Footer/empty 状态背景 |
| `--surface-hover` | `#ffffff` | 保留，不做 hover |
| `--text` | `#000000` | 主要内容、数据值、标题 |
| `--text-muted` | `#808080` | 次级标签、reset datetime、空状态 |
| `--accent` | `#808080` | progress、trendline、model header、badge text |
| `--accent-dim` | `#808080` | accent 派生，不引入第二灰阶 |
| `--border` | `#808080` | Card/Footer outline、table divider |
| `--success` | `#000000` | Connected / active 状态点 |
| `--warning` | `#808080` | PWA ready but sleeping |
| `--danger` | `#000000` | Disconnected / warning text，必须靠文案区分 |
| `--shadow` | `none` | E-INK 不使用阴影 |
| `--shadow-lg` | `none` | E-INK 不使用阴影 |

## Component Impact

### Global Styles

`web/src/app.scss` 需要从单一 `:root` 改为：

- `:root` 放非颜色基础 tokens。
- `:root, :root[data-theme='marble-purple']` 放当前默认颜色。
- `:root[data-theme='eink']` 放 E-INK 颜色。

主题开关第一版可以先用静态 attribute 验证：

```ts
document.documentElement.dataset.theme = 'eink';
```

最终入口可以后续接到 bottom bar menu 或本地存储，但本计划不要求先做完整交互。

### ProgressBar

当前 `ProgressBar.svelte` 默认 `color = 'var(--accent)'`，E-INK 下 `--accent` 会变成 50% 灰，因此不需要新增 props。

需要检查 track：

- 当前 track 使用 `var(--bg)`。
- E-INK 中 track 纯白时，progress indicator 50% 灰足够清晰。

### Trendline

当前 `Trendline.svelte` 默认 `color = 'var(--accent)'`，E-INK 下会变成 50% 灰，符合图形元素规则。

### Card / Footer / Dividers

这些组件已经消费 `--surface` / `--border` / `--text` / `--text-muted`，主题切换后应该自然生效。

需要特别检查：

- `Card.svelte` border 在白底上必须是 50% 灰。
- Footer top border 必须是 50% 灰。
- DeepSeek model separator 必须是 50% 灰。

### Badges And Color Mix

`OpenAICard.svelte` 中 badge 使用：

```scss
background: color-mix(in srgb, var(--accent) 15%, transparent);
```

E-INK 下不应产生浅灰填充干扰内容。建议改成 token 化 badge contract：

- 新增 `--badge-bg`
- 新增 `--badge-text`
- 新增 `--badge-border`

默认紫色主题：

```scss
--badge-bg: color-mix(in srgb, var(--accent) 15%, transparent);
--badge-text: var(--accent);
--badge-border: transparent;
```

E-INK：

```scss
--badge-bg: transparent;
--badge-text: #000000;
--badge-border: #808080;
```

### Footer Status Dots

E-INK 不应依赖红/绿/黄辨识状态。

当前 Footer 已有文字：

- `Connected` / `Disconnected`
- `NOT-PWA` / `PWA` / `PWA-AWAKE`

因此状态点在 E-INK 中只做辅助：

- active / connected：黑点
- neutral / sleeping：50% 灰点
- disconnected / not-pwa：黑点或 50% 灰 outline，最终以文字为准

如果实现发现黑点无法区分 danger/success，不要引入红色；应改形状或增加 outline pattern。

## DESIGN.md Updates

需要新增或修改：

1. `## 2. 颜色规则` 改成主题系统说明。
2. 保留“当前默认主题：Marble Purple”。
3. 新增“E-INK MODE”章节，写入白/黑/50% 灰规则。
4. 将 “Color Theme 系统（多色主题切换） | ROADMAP Future” 拆成：
   - Theme token system：本次计划
   - E-INK MODE：本次计划
   - Optional accent color themes：Future
5. 明确 Widget 仍只能消费 semantic tokens，不能在局部写主题颜色。

## ROADMAP Updates

`ROADMAP.md` 当前 Future 只有 “Color Theme 系统（多色主题切换）”。需要拆分为：

- Theme token system：支持 `marble-purple` 与 `eink`。
- E-INK MODE：高对比显示模式。
- Optional accent themes：仍留在 Future，不和 E-INK 混为一类。

## Implementation Steps

1. 更新 `DESIGN.md`，把颜色规则从单主题规则升级为 Theme System 规则。
2. 更新 `ROADMAP.md`，拆开 E-INK 与 Future optional accent themes。
3. 重构 `web/src/app.scss`：
   - 非颜色 tokens 保持在 `:root`。
   - 当前颜色迁移到 `:root, :root[data-theme='marble-purple']`。
   - 新增 `:root[data-theme='eink']`。
4. 新增 badge semantic tokens，替换 `OpenAICard.svelte` 的局部 `color-mix` badge styling。
5. 检查所有图形组件默认色是否来自 `--accent` 或新 token。
6. 增加临时 theme selection path：
   - 第一版可用 hardcoded `document.documentElement.dataset.theme = 'eink'` 做验证。
   - 后续接入 bottom bar menu 或 localStorage。
7. 运行 build 与手工视觉检查。

## Acceptance Criteria

默认主题：

- 不设置 `data-theme` 时视觉与当前紫色主题一致。
- `data-theme='marble-purple'` 时视觉与默认一致。

E-INK：

- 页面背景为纯白。
- Card/Footer/empty 状态背景为纯白。
- 主要内容、数据、标题为纯黑。
- Outline、divider、progress、trendline、badge outline 使用 50% 灰。
- 不出现紫色、红色、绿色、黄色 glow。
- 状态识别不只依赖颜色；文字状态仍可读。

Code / design constraints：

- 无 Tailwind / Windi / UnoCSS。
- 无 Widget 局部硬编码主题色。
- 颜色变化通过 semantic CSS variables 完成。
- `bun run build` 通过。

## Verification

静态验证：

```bash
bun run build
```

运行时验证：

```bash
bun run dev
```

浏览器检查：

- 默认主题：确认现有黑底紫色主题没有视觉回归。
- `document.documentElement.dataset.theme = 'eink'`：确认白底、黑字、50% 灰图形元素生效。
- 移动 viewport：Footer、grid、safe-area 与 E-INK 颜色不冲突。
- 数据卡片：ProgressBar、Trendline、DeepSeek 分割线、OpenAI badge 均符合 E-INK 规则。

## Later Integration

当 bottom bar menu 落地后，可以把 E-INK mode 作为 menu item：

```text
Theme: Marble Purple
Theme: E-INK
```

这一步需要新增 theme store 和 localStorage 持久化，但不属于本计划第一版必须项。
