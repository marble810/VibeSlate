# Human Test Plan — Marble Panel LAN

## 状态

Draft。本轮自动化测试（`DOCKER_LAN_FULL_TEST_PLAN.md`）已全部通过，本 Plan 覆盖自动化无法覆盖的人类验收项。

## 前置条件

- Docker LAN no-auth baseline 已验证通过
- Docker LAN auth-enabled matrix 已验证通过
- 证书链：mkcert root CA → leaf cert，SAN 覆盖 `localhost`、`127.0.0.1`、`Leungs-MacBook.local`、`10.18.0.222`
- QR Code + Bootstrap URL 流程已在 host 端验证（`bun run lan:https`）
- 当前 `data/docker/` 为 auth-enabled 状态（`auth.enabled=true`，测试密码已设置）

## 测试环境要求

### Host
- macOS，连接与移动设备同一 LAN/Wi-Fi
- Docker Desktop 运行中，`bun run docker:up` 启动 LAN stack
- 或使用 `bun run lan:https` 直接运行 host HTTPS server（用于 QR/bootstrap 流程）

### 移动设备
- 至少 1 台 iOS 设备（推荐 iOS 17+）
- 至少 1 台 Android 设备（推荐 Android 14+）
- 设备连接与 Host 同一 Wi-Fi 网络

### 工具
- iOS：Safari（必须用 Safari 扫描 QR 和安装 Profile/PWA）
- Android：Chrome（用于 PWA 安装）、系统设置（用于 CA 证书安装）

---

## 测试矩阵

| # | 测试项 | 设备 | 优先级 | 依赖 |
|---|---:|---|:---:|---|
| H1 | QR Code 扫描安装 CA 证书 | iOS | P0 | `bun run lan:https` 运行中 |
| H2 | iOS Profile 安装 (CA + Web Clip) | iOS | P0 | H1 |
| H3 | CA 信任启用 | iOS | P0 | H2 |
| H4 | PWA 安装到主屏幕 | iOS | P0 | H3 |
| H5 | PWA standalone 模式 | iOS | P1 | H4 |
| H6 | HTTPS + auth 流程 | iOS | P0 | H3 |
| H7 | SSE 实时更新 | iOS | P1 | H6 |
| H8 | Wake Lock 保持屏幕 | iOS | P2 | H4 |
| H9 | 离线 Service Worker | iOS | P2 | H4 |
| H10 | QR Code 扫描安装 CA 证书 | Android | P0 | `bun run lan:https` 运行中 |
| H11 | CA 证书安装 | Android | P0 | H10 |
| H12 | PWA 安装 (Chrome) | Android | P0 | H11 |
| H13 | HTTPS + auth 流程 | Android | P0 | H11 |
| H14 | Bootstrap URL 流程 | iOS/Android | P1 | `bun run lan:https` 运行中 |
| H15 | 多设备同时访问 | 2+ 设备 | P2 | H6+H13 |
| H16 | LAN IP 直连 | iOS/Android | P1 | H1/H10 |
| H17 | hostname `.local` 直连 | iOS/Android | P2 | H1/H10 |

---

## Phase H1–H5: iOS CA + PWA Install

### H1 — QR Code 扫描安装 CA

**步骤：**
1. Host 运行 `bun run lan:https`
2. 在 iOS 上用 **Safari** 扫描 TUI 中 "iOS — cert + Web Clip" QR Code
3. 应弹出 "此网站正尝试下载一个配置描述文件" 对话框
4. 点击"允许"

**验收：**
- [ ] Safari 成功识别 QR 中的 mobileconfig URL
- [ ] 弹出配置描述文件下载提示
- [ ] 不出现证书错误或无法连接

### H2 — iOS Profile 安装

**步骤：**
1. 打开"设置" → 顶部 "已下载描述文件"
2. 点击 "Marble Panel" 描述文件
3. 点击"安装"，输入设备密码
4. 确认安装

**验收：**
- [ ] "设置" 顶部出现 "已下载描述文件"
- [ ] 描述文件显示 CA 证书 + Web Clip 两个 payload
- [ ] 安装成功，无错误提示

### H3 — CA 信任启用

**步骤：**
1. "设置" → "通用" → "关于本机" → "证书信任设置"
2. 找到 mkcert root CA（名称类似 "mkcert liangkeren@..."）
3. 开启 "针对根证书启用完全信任"
4. 确认对话框

**验收：**
- [ ] 证书信任设置中能看到 mkcert root CA
- [ ] 开关可正常开启
- [ ] 开启后不出现红色 "未验证" 警告

### H4 — PWA 安装到主屏幕

**步骤：**
1. 用 Safari 打开 `https://Leungs-MacBook.local:12001/` 或 `https://10.18.0.222:12001/`
2. 等待页面完全加载
3. 点击分享按钮 → "添加到主屏幕"
4. 确认名称 "Marble Panel"，点击"添加"

**验收：**
- [ ] HTTPS 连接无证书警告（绿锁）
- [ ] 页面显示完整的 Marble Panel UI
- [ ] "添加到主屏幕" 选项可用
- [ ] 主屏幕出现 Marble Panel 图标
- [ ] 图标使用 app icon（非网页截图）

### H5 — PWA Standalone 模式

**步骤：**
1. 从主屏幕点击 Marble Panel 图标
2. 观察是否以独立应用模式打开

**验收：**
- [ ] 无 Safari 浏览器 chrome（地址栏、工具栏）
- [ ] 全屏显示（status bar 可保留）
- [ ] 应用切换器中显示为独立应用
- [ ] `manifest.display` 为 `fullscreen` 或 `standalone`

---

## Phase H6–H9: iOS 功能验证

### H6 — HTTPS + Auth 流程

> 前置：Docker LAN stack 以 auth-enabled 模式运行 (`bun run docker:up`)

**步骤：**
1. Safari 打开 `https://10.18.0.222:12001/`
2. 应看到 Marble Panel Login 页面
3. 输入测试密码，点击登录
4. 应进入主面板

**验收：**
- [ ] 首次访问显示 Login 页面（而非应用 shell）
- [ ] 错误密码显示错误提示
- [ ] 正确密码后进入主面板
- [ ] 刷新页面保持登录状态（session cookie）
- [ ] 关闭 Safari 后重新打开，仍在登录状态（如 cookie 未过期）

### H7 — SSE 实时更新

**步骤：**
1. 登录后观察面板各卡片
2. 等待 5-10 秒观察数据是否自动刷新

**验收：**
- [ ] 卡片数据自动更新（不刷新页面）
- [ ] 无连接中断或重复刷新
- [ ] 如 Provider token 已配置，余额/用量实时变化

### H8 — Wake Lock

**步骤：**
1. 从主屏幕以 PWA standalone 打开 Marble Panel
2. 等待 30 秒，观察屏幕是否熄灭

**验收：**
- [ ] PWA 模式下屏幕保持常亮（不自动锁屏）
- [ ] Safari 浏览器模式下屏幕按系统设置正常熄灭（Wake Lock 仅 PWA 可用）

### H9 — 离线 Service Worker

**步骤：**
1. 在 PWA standalone 模式下访问一次 Marble Panel（确保 SW 已注册）
2. 开启飞行模式
3. 从主屏幕重新打开 Marble Panel

**验收：**
- [ ] 离线时仍能打开应用（显示缓存的 shell）
- [ ] UI 框架可见，显示离线状态提示
- [ ] 恢复网络后自动重连

---

## Phase H10–H13: Android CA + PWA Install

### H10 — QR Code 扫描安装 CA

**步骤：**
1. Host 运行 `bun run lan:https`
2. 用 Android 相机或 Chrome 扫描 "Android — cert only" QR Code
3. 应打开 Bootstrap URL 或直接下载 `rootCA.cer`

**验收：**
- [ ] QR Code 可被 Android 识别
- [ ] 下载 `rootCA.cer` 证书文件
- [ ] 系统提示安装 CA 证书

### H11 — CA 证书安装

**步骤：**
1. "设置" → "安全" → "加密与凭据" → "安装证书" → "CA 证书"
2. 选择下载的 `rootCA.cer`
3. 确认安装（可能需要设备 PIN）

**验收：**
- [ ] 证书成功安装为 CA 证书
- [ ] "受信任的凭据" → "用户" 标签中可找到 mkcert CA

### H12 — PWA 安装 (Chrome)

**步骤：**
1. Chrome 打开 `https://10.18.0.222:12001/`
2. 地址栏应出现 "安装" 图标或弹出 "添加到主屏幕" 提示
3. 点击安装

**验收：**
- [ ] HTTPS 连接无证书警告
- [ ] Chrome 提示可安装 PWA
- [ ] 主屏幕/应用抽屉出现 Marble Panel 图标
- [ ] 以 standalone 模式打开（无 Chrome 地址栏）

### H13 — HTTPS + Auth 流程

同 H6，验收标准一致。

---

## Phase H14: Bootstrap URL 流程

**步骤：**
1. Host 运行 `bun run lan:https`，记录 Bootstrap URL
2. 在移动设备浏览器中直接输入 Bootstrap URL（格式：`http://<LAN_IP>:12080/<token>/`）
3. 页面应显示证书安装引导

**验收：**
- [ ] Bootstrap URL 可访问（HTTP）
- [ ] 页面显示下载 root CA 证书链接
- [ ] 页面显示 PWA 安装说明
- [ ] iOS 用户可下载 mobileconfig
- [ ] Android 用户可下载 .cer 文件

---

## Phase H15: 多设备

**步骤：**
1. 同时用 2 台以上设备（iOS + Android 或 2×iOS）访问同一 Marble Panel
2. 观察 SSE 连接和 UI 响应

**验收：**
- [ ] 多设备可同时连接
- [ ] 每台设备独立的 SSE 连接
- [ ] 设备间数据一致

---

## Phase H16–H17: URL 变体

### H16 — LAN IP 直连

**步骤：**
1. 使用 `https://<LAN_IP>:12001/` 访问

**验收：**
- [ ] 无证书警告（SAN 包含 LAN IP）
- [ ] 功能与 hostname URL 一致

### H17 — `.local` hostname

**步骤：**
1. 使用 `https://Leungs-MacBook.local:12001/` 访问

**验收：**
- [ ] macOS/iOS 设备可解析 `.local` Bonjour 名称
- [ ] Android 设备可能需要手动 DNS 或使用 IP（记录为已知限制）
- [ ] 无证书警告

---

## 已知限制 & 注意事项

1. **Android `.local` hostname**：Android 默认不解析 mDNS/Bonjour `.local` 名称，Android 用户应使用 Bootstrap URL (HTTP) 或手动输入 LAN IP。
2. **`12001` 端口冲突**：`bun run lan:https`（QR/bootstrap）与 Docker LAN app 不能同时占用 host `12001`；需先运行 `lan:https` 完成证书安装，再启动 Docker。
3. **证书过期**：mkcert 证书有效期为 2 年 3 个月，过期需重新生成。
4. **Firefox PWA**：Firefox 不支持 PWA 安装，Android 用户必须使用 Chrome。
5. **Wake Lock**：仅 PWA standalone 模式可用；iOS Safari 浏览器模式不支持。

---

## 成功定义

### 最低通过标准 (P0)
- [ ] iOS: CA 安装 + HTTPS 访问 + PWA 安装 + Auth 登录
- [ ] Android: CA 安装 + HTTPS 访问 + PWA 安装 + Auth 登录

### 完整通过标准 (P0+P1)
- [ ] 上述全部 P0 项通过
- [ ] iOS PWA standalone 模式
- [ ] SSE 实时更新
- [ ] Bootstrap URL 流程
- [ ] LAN IP 直连

### 理想标准 (P0+P1+P2)
- [ ] 上述全部通过
- [ ] Wake Lock
- [ ] 离线 Service Worker
- [ ] 多设备同时访问
- [ ] `.local` hostname

---

## 执行后

- [ ] 将通过/失败项同步到 `ROADMAP.md` Phase 6B / Phase 7A
- [ ] 如有失败项，在 `PLAN/` 下创建修复 Plan 并链接
- [ ] 截图保存到 `docs/screenshots/` 作为证据
- [ ] 记录设备型号和 OS 版本
