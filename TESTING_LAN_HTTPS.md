# Marble Panel LAN HTTPS — 人类测试指南

> 测试覆盖：`bun run lan:https` 完整流程，含 iOS、Android、Desktop 三端验证。

---

## 测试环境前提

- [ ] 一台运行 Marble Panel 的 Mac / Linux 主机
- [ ] 主机已安装 `mkcert`（`brew install mkcert && mkcert -install`）
- [ ] 主机已安装 `bun`（`>= 1.3`）
- [ ] 主机与测试手机在同一局域网（同一 Wi-Fi / 同一交换机）
- [ ] **一台 iOS 设备**（iOS 15+，安装好 Safari）
- [ ] **一台 Android 设备**（Android 10+，安装好 Chrome）
- [ ] 手机上能打开相机扫码（系统相机或微信扫码均可，iOS 推荐 Safari 直接扫码）

---

## 第一步：启动 LAN HTTPS 服务

```bash
cd marble-panel
bun run lan:https
```

**预期看到：**

```
[lan-https] Marble Panel LAN HTTPS Installer starting...
[lan-https] Checking mkcert...
[lan-https] mkcert found → CAROOT: /Users/.../Library/Application Support/mkcert
[lan-https] LAN IP: 192.168.x.x
[lan-https] Hostname: Your-Mac.local
[lan-https] Generating leaf cert for: marble-panel.local localhost 127.0.0.1 ...
[lan-https] Leaf cert generated successfully.
[lan-https] Root CA SHA256: XX:XX:...:XX
[lan-https] Building web production assets...
[lan-https] Generating iOS mobileconfig...
[lan-https] mobileconfig written.
[lan-https] manifest.json written.
[lan-https] Starting HTTPS app server...
[lan-https] Starting HTTP bootstrap server...
[lan-https] Bootstrap URL: http://192.168.x.x:12080/<random-token>/
```

随后终端清屏，显示 TUI 界面，包含三组 QR 码和安装步骤。

**失败的常见原因：**

| 现象 | 原因 | 解决 |
|---|---|---|
| `mkcert not found` | 没装 mkcert | `brew install mkcert && mkcert -install` |
| `No LAN IP detected` | 主机没连局域网 | 连上 Wi-Fi 或插网线后重试 |
| `Port 12001 occupied` | 已有 Marble Panel 在跑 | 先 `Ctrl-C` 关掉旧进程 |
| `Web build failed` | 前端构建失败 | `bun run build` 单独跑看错误 |

---

## 第二步：Desktop 自检（主机本机验证）

在继续手机测试前，先在主机上确认一切正常。

### 2.1 HTTPS App 可用

在主机上打开浏览器，访问 TUI 显示的 **App URL (IP)**：

```
https://192.168.x.x:12001/
```

- [ ] 浏览器不报证书警告（因为 mkcert root CA 已安装在本机）
- [ ] 页面正常显示 Marble Panel 界面
- [ ] SSE 连接成功（右下角连接指示灯亮起）

如果浏览器报了证书不安全，说明 mkcert root CA 没有正确安装到本机。
运行 `mkcert -install` 后重启浏览器再试。

### 2.2 Bootstrap 页面可用

在主机浏览器访问 TUI 显示的 **Bootstrap URL**：

```
http://192.168.x.x:12080/<token>/
```

- [ ] 显示深色背景的 Marble Panel LAN Setup 页面
- [ ] 页面显示 App URL、CA SHA256 指纹
- [ ] 页面包含 iOS、Android、Desktop 三个安装段落
- [ ] 下载链接可点击（`rootCA.crt`、`rootCA.pem`、`Marble-Panel.mobileconfig`）

### 2.3 curl 验证 HTTPS

```bash
# 用 mkcert root CA 验证 TLS
curl --cacert data/lan-tls/rootCA.pem https://192.168.x.x:12001/

# 应返回 Marble Panel 的 HTML 页面
```

- [ ] curl 返回 `<!doctype html>` 且包含 `Marble Panel`

### 2.4 产物检查

```bash
ls -la data/lan-tls/
```

应包含以下文件：

- [ ] `app-cert.pem` — leaf 证书
- [ ] `app-key.pem` — leaf 私钥（文件权限 `600`）
- [ ] `rootCA.pem` — 公开 root CA（PEM 格式）
- [ ] `rootCA.crt` — 公开 root CA（CRT 格式，内容同 .pem）
- [ ] `rootCA.cer` — 公开 root CA（DER 格式，Android 回退用）
- [ ] `Marble-Panel.mobileconfig` — iOS 配置描述文件
- [ ] `manifest.json` — 本次会话元信息

---

## 第三步：iOS 测试

> **⚠️ 重要：** iOS 手动安装的证书 profile 不会自动启用 SSL/TLS 完全信任。
> 用户必须在系统设置中手动打开 Full Trust。这是 Apple 的安全设计，不是 bug。

### 3.1 扫码安装 Profile

1. 在 iOS 设备上打开 **Safari**。
2. 用 Safari 扫描 TUI 界面中 **iOS 区域**的 QR 码。
   - QR 码指向：`http://192.168.x.x:12080/<token>/ios/Marble-Panel.mobileconfig`
3. Safari 弹出提示："此网站正尝试下载一个配置描述文件"。
   - [ ] 点击 **"允许"**。

### 3.2 安装 Profile

4. 打开 **设置** app。
   - [ ] 顶部出现 **"已下载描述文件"**（Profile Downloaded）。
5. 点击进入，选择 **Marble Panel**。
   - [ ] 显示两个 payload：
     - **Marble Panel Local CA**（根证书）
     - **Marble Panel Web Clip**（主屏幕 Web Clip）
6. 点击右上角 **"安装"**。
7. 输入设备密码确认。
8. 再次点击 **"安装"**。
9. 点击 **"完成"**。

### 3.3 启用 Full Trust（关键步骤！）

> 这一步最容易遗漏。跳过的话，Web Clip 存在但 HTTPS 连接会失败。

10. 打开 **设置 → 通用 → 关于本机**。
11. 滚动到底部，点击 **"证书信任设置"**。
12. 找到 TUI / Bootstrap 页面显示的 **CA Name**。
    - 常见显示不是 "Marble Panel Local CA"，而是 `mkcert ...` 开头的 root CA 名称。
    - [ ] 开关处于 **关闭** 状态。
13. **打开开关**。
    - 弹出警告："启用此证书的完全信任..."
14. 点击 **"继续"**。

### 3.4 验证 Web Clip

15. 返回主屏幕。
    - [ ] 出现 **Marble Panel** 图标（带 PWA 图标）。
16. 点击图标打开 Marble Panel。
    - [ ] 以全屏模式打开（无 Safari 地址栏和工具栏）。
    - [ ] 不显示证书警告。
    - [ ] 页面内容正常加载。
    - [ ] SSE 连接成功（右下角指示灯绿色 / 数据刷新）。

### iOS 常见失败场景

| 现象 | 原因 | 解决 |
|---|---|---|
| 扫码后 Safari 打不开 | 主机 IP 变了，或手机不在同一网络 | 确认在统一 Wi-Fi；在 TUI 按 `o` 确认 IP |
| 设置里没有"已下载描述文件" | Safari 没弹出下载确认 | 用 Safari 重新扫码（不是相机 app） |
| Web Clip 图标存在但打开白屏 | 没开 Full Trust | 回到 3.3 启用 TUI 显示的 CA Name |
| Web Clip 图标存在但提示"无法验证服务器" | Full Trust 开了但 URL 与证书 SAN 不匹配，或仍在使用旧 profile/cert | 重新运行 `bun run lan:https`，重装 profile，并优先用 App URL (IP) 验证 |
| 证书安装后系统说"未签名" | 正常现象 | MVP 不签名，手动信任即可 |
| 输入密码后安装失败 | iOS 版本 < 15 或设备管理限制 | 升级 iOS 或检查 MDM 限制 |

---

## 第四步：Android 测试

> Android 只安装 root CA 证书，不含 Web Clip。PWA 安装走 Chrome 自带流程。

### 4.1 下载 CA 证书

1. 用系统相机或二维码扫描器扫描 TUI 界面中 **Android 区域**的 QR 码。
   - QR 码指向：`http://192.168.x.x:12080/<token>/android/rootCA.crt`
2. 浏览器打开链接后，自动下载证书文件。
   - [ ] 文件名为 `Marble-Panel-Local-CA.crt`。
3. 如果 `.crt` 下载/导入失败，改扫 App QR 手动在浏览器输入 bootstrap URL，再下载 `.cer` 回退文件。

### 4.2 安装 CA 证书

> 各厂商 Android 设置措辞不同。以下为常见路径，具体可能略有差异。

4. 打开 **设置**。
5. 搜索或导航到证书安装入口：
   - **Samsung**: 设置 → 生物识别与安全 → 其他安全设置 → 从设备存储安装
   - **Pixel / 原生 Android**: 设置 → 安全与隐私 → 更多安全设置 → 加密与凭据 → 安装证书
   - **小米**: 设置 → 密码与安全 → 系统安全 → 加密与凭据 → 安装证书
   - **华为**: 设置 → 安全 → 更多安全设置 → 加密和凭据 → 从存储设备安装
6. 选择 **"CA 证书"**（不是"VPN 和应用用户证书"！）。
7. 系统可能提示"您的网络活动可能会被监控" — 这是正常的，点击继续。
8. 选择下载的 `Marble-Panel-Local-CA.crt` 文件。
9. [ ] 系统提示"Marble Panel Local CA 已安装"。

> **注意：** 如果设备没有设置锁屏密码，Android 可能拒绝安装 CA 证书。需要先去设置锁屏密码。

### 4.3 验证 HTTPS 访问

10. 打开 **Chrome** 浏览器。
11. 在地址栏输入 TUI 显示的 **App URL (IP)**：
    ```
    https://192.168.x.x:12001/
    ```
12. [ ] 不出现"您的连接不是私密连接"警告。
13. [ ] 页面正常显示 Marble Panel 界面。
14. [ ] SSE 连接成功。

### 4.4 PWA 安装（Chrome）

15. Chrome 地址栏或菜单中出现 **"安装应用"** / **"添加到主屏幕"**。
16. 点击安装。
17. [ ] 主屏幕出现 Marble Panel 图标。
18. 从主屏幕图标打开。
    - [ ] 以全屏模式启动（无 Chrome 地址栏）。
    - [ ] 不显示证书警告。
    - [ ] SSE 连接正常。

### Android 常见失败场景

| 现象 | 原因 | 解决 |
|---|---|---|
| 扫码后打不开网页 | 主机 IP 变了 / 不在同一网络 | 确认网络；在 TUI 按 `o` 确认 URL |
| `.crt` 文件无法导入 | 下载时 Content-Type 不对 | 改用 `.cer` 回退文件 |
| "安装证书"按钮灰掉 | 没设锁屏密码 | 先去设置锁屏密码再试 |
| 安装了证书但 Chrome 仍警告 | 装的不是 CA 证书（装成了用户证书） | 删除重装，选择"CA 证书" |
| Chrome 警告 `NET::ERR_CERT_AUTHORITY_INVALID` | Chrome 不信任用户安装的 CA | 试试重启 Chrome；确认 CA 证书安装成功 |
| 没有"安装应用"按钮 | PWA manifest 不被识别 | 确认 HTTPS 连接正常、manifest 可访问 |
| PWA 安装后打开白屏 | URL 与证书 SAN 不匹配 | 确认使用的 URL（hostname vs IP）在证书 SAN 中 |

---

## 第五步：TUI 操作测试

在终端 TUI 界面依次测试以下按键：

| 按键 | 预期行为 | 结果 |
|---|---|---|
| `r` | 屏幕刷新，QR 重新生成 | [ ] |
| `o` | 下方打印 App URL、App URL (IP)、Bootstrap URL | [ ] |
| `c` | 下方打印 CA SHA256 指纹 | [ ] |
| `s` | Bootstrap 服务停止，日志显示 "Bootstrap server stopped" | [ ] |
| 再次 `s` | 日志显示 "Bootstrap server already stopped." | [ ] |
| `q` | 所有服务停止，终端恢复，端口 12001/12080 释放 | [ ] |
| `Ctrl-C` | 与 `q` 效果相同，干净退出 | [ ] |

**退出后验证：**

```bash
lsof -i :12001 -i :12080
# 应该没有任何输出（端口已释放）
```

- [ ] 端口 12001 和 12080 已释放
- [ ] 没有残留的 `bun` 进程

---

## 第六步：.local Hostname 测试（可选）

仅当你的路由器/网络支持 mDNS（大多数家庭网络都支持）时有效。

1. 在 TUI 中确认 App URL 形如 `https://marble-panel.local:12001/`。
2. 在手机 Safari / Chrome 中直接访问这个 `.local` URL。
3. [ ] 如果 `.local` 正常解析，页面可打开。
4. [ ] 如果 `.local` 不解析（超时），用 IP URL 作为回退。

> `.local` 在部分 Android 设备上可能不解析。IP URL + 重新生成 mobileconfig 是可靠的回退方案。

---

## 第七步：IP 变更测试（可选）

模拟主机 IP 变更场景：

1. 记录当前主机 LAN IP（例如 `192.168.2.3`）。
2. 在 TUI 按 `q` 退出。
3. 断开并重新连接 Wi-Fi，使得主机获得新 IP（例如 `192.168.2.8`）。
4. 重新运行 `bun run lan:https`。
5. [ ] 新的 TUI 显示更新后的 IP。
6. [ ] 新的 QR 码指向新 IP。
7. [ ] iOS 需要重新扫码安装 profile（因为 Web Clip URL 变了）。
8. [ ] Android 不需要重装 CA 证书（root CA 没变），但需要在 Chrome 访问新 IP URL。

---

## 验证矩阵（汇总）

| 区域 | 检查项 | 预期 | 结果 |
|---|---|---|---|
| **启动** | `bun run lan:https` | 无错误，TUI 显示 | [ ] |
| **产物** | `data/lan-tls/` 7 个文件 | 全部存在 | [ ] |
| **HTTPS** | `curl --cacert rootCA.pem https://<ip>:12001/` | 返回 Marble Panel HTML | [ ] |
| **Bootstrap** | `curl http://<ip>:12080/<token>/` | 返回安装页面 | [ ] |
| **mobileconfig** | Headers | `application/x-apple-aspen-config` | [ ] |
| **crt** | Headers | `application/x-x509-ca-cert` | [ ] |
| **证书 SAN** | `openssl x509 -text` | 含 IP + hostname + `.local` | [ ] |
| **iOS 扫码** | Safari 扫码 → 下载 | 弹出 profile 安装提示 | [ ] |
| **iOS 安装** | 设置 → 安装 profile | 两个 payload 出现 | [ ] |
| **iOS Full Trust** | 设置 → 证书信任 | 可开启 | [ ] |
| **iOS Web Clip** | 主屏幕 → 打开 | 全屏、无证书警告 | [ ] |
| **iOS SSE** | Web Clip 内观察 | 数据刷新正常 | [ ] |
| **Android CA** | 扫码 → 下载证书 → 安装 | 系统提示安装成功 | [ ] |
| **Android HTTPS** | Chrome 打开 `https://<ip>:12001/` | 无证书警告 | [ ] |
| **Android PWA** | Chrome → 安装应用 | 主屏幕图标 → 全屏启动 | [ ] |
| **Android SSE** | PWA 内观察 | 数据刷新正常 | [ ] |
| **TUI r** | 按 r | 屏幕刷新 | [ ] |
| **TUI q** | 按 q | 干净退出 | [ ] |
| **端口释放** | 退出后 `lsof -i :12001` | 无输出 | [ ] |
| **残留进程** | 退出后 `ps aux | grep bun` | 无残留 | [ ] |

---

## 故障排除速查

### 手机上扫不出 QR 码

- 调整终端字体大小（`Cmd -` 缩小）使 QR 码完整显示
- 确认终端背景是黑色（QR 码白底黑点）
- 可以按 `o` 查看原始 URL，手动在手机浏览器输入

### "无法验证服务器身份"（iOS 即使开了 Full Trust）

1. 确认访问的 URL 主机名或 IP 在证书 SAN 中：
   ```bash
   openssl x509 -in data/lan-tls/app-cert.pem -text | grep -A1 "Subject Alternative"
   ```
2. 确认 Web Clip URL 与你尝试访问的 URL 一致
3. 确认手机和主机在同一局域网（检查 Wi-Fi 名称）

### Android Chrome "您的连接不是私密连接"

1. 确认证书安装时选择了 "CA 证书" 而非 "用户证书"
2. 在设置 → 安全 → 信任的凭据 → 用户 标签页中确认 Marble Panel CA 存在
3. 完全关闭 Chrome（从多任务界面划掉），重新打开
4. 某些 Android 版本 Chrome 可能不信任用户 CA — 尝试 Firefox 测试

### Bootstrap 页面 404

- 确认 URL 中的 token 部分正确（与 TUI 显示的完全一致）
- Token 每次运行重新生成，上次的 token 无效

### macOS 本机看不到 "Marble Panel" 的证书信任

- mkcert root CA 安装到了 login keychain
- 在终端运行 `mkcert -install` 重新安装
- 打开 Keychain Access → System → Certificates 确认存在

---

## 清理

### 停止服务

在 TUI 按 `q` 或 `Ctrl-C`。

### 删除产物

```bash
rm -rf data/lan-tls/
```

### 删除 mkcert root CA（仅在不再需要时）

```bash
mkcert -uninstall
```

### iOS 删除 Profile 和证书

- 设置 → 通用 → VPN 与设备管理 → Marble Panel → 删除描述文件
- 设置 → 通用 → 关于本机 → 证书信任设置 → 关闭 Marble Panel Local CA
- 长按主屏幕 Marble Panel 图标 → 删除

### Android 删除证书

- 设置 → 安全 → 信任的凭据 → 用户 → Marble Panel Local CA → 删除
- 长按主屏幕 Marble Panel 图标 → 卸载
