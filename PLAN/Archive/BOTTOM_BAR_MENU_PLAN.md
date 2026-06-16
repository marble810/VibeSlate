# Bottom Bar Menu Button Plan

## 背景

当前 `web/src/components/Footer.svelte` 的底部栏分为三段：

- 左侧连接状态：`Connected` / `Disconnected`
- 中间品牌区：logo + `marble-panel`
- 右侧 PWA 状态：`NOT-PWA` / `PWA` / `PWA-AWAKE`

本次目标是将中间品牌区改成 menu button。用户 press 后，dropdown menu 从底部栏向上弹出。第一版 menu 内容只做 string 占位，先打通结构、组件边界和 Bits UI 行为。

## UI Contract Preflight

| 项 | 决策 |
|---|---|
| UI scope | Bottom bar 中间 logo + title 品牌区 |
| Existing controls | 复用 `Footer.svelte` 现有布局；复用 `bits-ui` `DropdownMenu` |
| Design rules | 继续遵守 `DESIGN.md` 的 Footer 固定底部、token 化颜色/字号/间距、SCSS scoped style、无 Tailwind |
| Files to edit | `DESIGN.md`、`web/src/components/FooterBrandMenu.svelte`、`web/src/components/Footer.svelte` |
| New base control | 是。仓库目前没有 Dropdown/Menu wrapper；新增小型通用组件承接 Bits UI 边界 |
| Verification | `bun run build`；实现后用 `bun run dev` 做浏览器交互检查 |

## Design Source Update

`DESIGN.md` 当前 Footer 规则写有：

> 禁止在 Footer 中加入配置教程、长句说明或交互按钮

新需求与“交互按钮”禁令冲突。先将该规则收窄为：

- Footer 仍禁止配置教程、长句说明、额外配置按钮。
- Footer 只允许一个交互入口：中间品牌区 menu trigger。
- 该 trigger 必须保持 logo + title 的品牌视觉，不引入醒目的 CTA 样式。
- dropdown menu 内容必须向上弹出，不能遮挡主 grid 的底部之外布局，也不能改变左右状态区职责。

## Component Boundary

新增：

```text
web/src/components/FooterBrandMenu.svelte
```

职责：

- 封装 Bits UI `DropdownMenu` 的 Root / Trigger / Portal / Content / Item。
- 暴露固定的品牌 trigger：logo + `marble-panel`。
- 第一版直接内置 placeholder string items。
- 后续需要真实 actions 时，只在这个组件内扩展 item 数据或事件，不把 menu 行为散落到 `Footer.svelte`。

`Footer.svelte` 只负责底部栏整体三段布局：

```svelte
<FooterBrandMenu />
```

不在 `Footer.svelte` 里直接写 dropdown content。

## Bits UI Implementation

使用 Bits UI 原语：

```svelte
<DropdownMenu.Root>
  <DropdownMenu.Trigger class="brand-trigger">
    ...
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content side="top" align="center" sideOffset={8}>
      <DropdownMenu.Item>Menu placeholder</DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>
```

约束：

- 用 Bits UI 管理 open state、focus、dismiss、keyboard navigation。
- 不手写 floating positioning、escape dismiss、focus trap。
- 不使用 feature-local ad-hoc popover/menu。
- 不新增外部 UI 库。

## Visual Rules

Trigger：

- 视觉上延续当前 `.branding`：logo 16px、pixelated、title 用 `var(--font-mono)` 与 `var(--text-sm)`。
- 使用 `button` 语义，但样式保持低调，不做主按钮视觉。
- 不使用 `:hover` 样式，符合 kiosk 规则。
- 增加 `:focus-visible`，使用 `var(--accent)` 和 token 化 outline offset。

Dropdown content：

- 背景使用 `var(--surface)`。
- 边框使用 `var(--border)`。
- 字体使用 `var(--font-mono)`。
- 字号使用 `var(--text-md)` 或 `var(--text-sm)`。
- 间距使用 `--space-*` tokens。
- 圆角使用 `var(--radius-sm)`；不硬编码。
- `z-index` 如需新增，使用组件内局部固定值，并在必要时回补 `DESIGN.md` z-index 规则。

## Placeholder Menu Content

第一版只放字符串占位：

```text
Settings placeholder
Theme placeholder
About placeholder
```

这些 item 暂不接业务行为。若需要保持 menu 点击后关闭，使用 Bits UI `DropdownMenu.Item` 默认行为即可。

## Implementation Steps

1. 更新 `DESIGN.md` Footer 规则，允许唯一品牌 menu trigger。
2. 新增 `FooterBrandMenu.svelte`，封装 `DropdownMenu`。
3. 将 `Footer.svelte` 中间 `.branding` 替换为 `<FooterBrandMenu />`。
4. 将原 `.branding` / `.logo` / `.version` 相关样式迁移到 `FooterBrandMenu.svelte`，保留中间绝对定位容器在 `Footer.svelte` 或由 wrapper class 接管。
5. 确认左右状态区 DOM 和状态逻辑不改动。
6. 运行 build，并做实际 press/dropdown 方向检查。

## Acceptance Criteria

- 中间 logo + `marble-panel` 可 press。
- dropdown 从 bottom bar 向上弹出。
- menu 内容显示 placeholder strings。
- Escape、外部点击、item select dismiss 由 Bits UI 正常处理。
- 左侧连接状态和右侧 PWA 状态视觉与职责不变。
- 无 Tailwind / Windi / UnoCSS。
- 无 hover 样式。
- 无硬编码颜色、字号、间距；普通视觉值走 CSS variables。
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

检查项：

- 桌面 viewport：品牌 trigger 居中，menu 向上弹出且不偏移。
- 移动 viewport：trigger 可点击，safe-area bottom padding 不影响 menu 锚点。
- 键盘：Tab 可聚焦 trigger，Enter/Space 可打开，Escape 可关闭。
- Pointer：press trigger 打开，再 press 外部关闭。
