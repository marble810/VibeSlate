# Marble Panel LAN HTTPS Installer Plan

## 1. Decision

Marble Panel 的局域网部署最终走 `mkcert` private CA 路线，并提供一个交互式 TUI 安装引导。TUI 启动后生成局域网 HTTPS 服务、显示二维码，并把手机安装流程拆成两条明确路径：

- iOS: 安装 `cert + Web Clip` 的 `.mobileconfig` profile。
- Android: 只安装 root CA cert，PWA/桌面入口交给 Chrome 自己的安装流程。

这条路径服务的是自有设备、同一局域网、kiosk/PWA 使用场景。它不是公网 TLS 方案，也不用于给不受控终端分发长期根证书。

## 2. Constraints

- Runtime 仍然统一使用 Bun，命令通过 `bun run ...` 暴露。
- 不引入 Docker 作为日常部署依赖；Docker 只用于镜像构建和容器验证。
- 不把任何证书私钥写入 git；尤其不能分发 `rootCA-key.pem`。
- iOS 手动安装证书 profile 后，不会自动启用 SSL/TLS 完全信任。用户仍需要在系统设置里打开 Full Trust。
- TLS 证书必须满足 Apple 现代规则：SAN 覆盖访问 hostname/IP、SHA-2、serverAuth EKU、有效期不超过 825 天。
- PWA 可靠性取决于受信任 HTTPS 和访问 URL 与证书 SAN 完全匹配。

## 3. User-Facing Command

新增命令：

```bash
bun run lan:https
```

推荐的脚本入口：

```text
scripts/lan-https.ts
```

命令职责：

1. 检查 `mkcert` 是否可用。
2. 检查或引导本机安装 mkcert root CA。
3. 发现局域网地址和候选 hostname。
4. 生成 Marble Panel 的 leaf cert/key。
5. build 前端生产资源。
6. 启动 HTTPS Marble Panel 服务。
7. 启动临时 bootstrap HTTP 服务，用于分发 iOS profile 和 Android CA。
8. 打开交互式 TUI，显示 iOS/Android 两条二维码和步骤状态。

## 4. Network Shape

运行时有两个本地服务：

```text
HTTPS App
  https://<lan-host>:12001/
  Marble Panel 正式访问入口，使用 mkcert leaf cert。

HTTP Bootstrap
  http://<lan-ip>:12080/<random-token>/
  临时安装引导页，只服务公开证书/profile/说明，不承载应用。
```

为什么 bootstrap 用 HTTP：

- 手机首次安装 root CA 前，无法信任 Marble Panel HTTPS。
- HTTP bootstrap 只传输公开材料：root CA certificate、mobileconfig、安装说明。
- bootstrap URL 必须带随机 token，并且脚本退出后关闭。

## 5. Hostname And Certificate Strategy

优先使用可读 hostname：

1. `marble-panel.local`
2. 当前机器的 mDNS hostname，例如 `<computer-name>.local`
3. 当前 LAN IP，例如 `192.168.x.x`

leaf cert SAN 应覆盖：

```text
DNS: marble-panel.local
DNS: <machine-hostname>.local
IP:  <detected-lan-ip>
IP:  127.0.0.1
DNS: localhost
```

访问 URL 选择：

- 如果 `.local` 在手机上能解析，TUI 默认展示 `https://marble-panel.local:12001/`。
- 如果 `.local` 验证失败或用户选择 IP 模式，则展示 `https://<lan-ip>:12001/`。
- IP 变化后，如果 Web Clip 使用的是 IP URL，需要重新生成并安装 iOS profile；root CA 不需要重装。

## 6. Generated Artifacts

推荐生成目录：

```text
data/lan-tls/
  app-cert.pem
  app-key.pem
  rootCA.pem
  rootCA.crt
  rootCA.cer
  Marble-Panel.mobileconfig
  manifest.json
```

说明：

- `app-key.pem` 是 leaf private key，仅给本机 HTTPS 服务使用。
- `rootCA.pem` / `rootCA.crt` 是公开 root certificate，可以分发给手机。
- `rootCA.cer` 是 DER 格式 fallback，供对 PEM 导入不稳定的系统使用。
- `rootCA-key.pem` 只存在于 mkcert `CAROOT`，绝不复制到 repo 或 bootstrap 目录。
- `manifest.json` 记录本次生成的 LAN IP、hostname、fingerprint、cert path、profile path，供 TUI 显示和重跑复用。

`.gitignore` / `.dockerignore` 已经忽略 `*.pem`、`*.key`、`*.crt` 和 `data/`，实现时仍需保持这个边界。

## 7. TUI Design

TUI 第一屏显示运行状态：

```text
Marble Panel LAN HTTPS

App URL       https://marble-panel.local:12001/
Bootstrap    http://192.168.1.23:12080/a8f3c2/
CA SHA256    12:34:...:EF

Services
  Web build       ready
  HTTPS app       running
  Bootstrap       running
  mkcert CA       found
```

随后分两列或两个 section 展示安装路径：

```text
iOS - cert + Web Clip
  [QR: /ios/Marble-Panel.mobileconfig]
  1. Use Safari to scan this QR.
  2. Download the Marble Panel profile.
  3. Settings > Profile Downloaded > Install.
  4. Settings > General > About > Certificate Trust Settings.
  5. Enable Full Trust for Marble Panel Local CA.
  6. Open Marble Panel from Home Screen.

Android - cert only
  [QR: /android/rootCA.crt]
  1. Scan this QR to download the CA certificate.
  2. Install it as a CA certificate in Android settings.
  3. Open the HTTPS App URL in Chrome.
  4. Use Chrome Install / Add to Home Screen for PWA entry.
```

TUI 操作项：

- `r`: regenerate QR/status
- `o`: print URLs
- `c`: show CA fingerprint
- `s`: stop bootstrap only
- `q`: stop all services

MVP 可以先只做静态步骤显示，不做手机安装状态回传。后续再通过 bootstrap page 的 ping 或 check-in 增加状态。

## 8. iOS Profile

生成文件：

```text
Marble-Panel.mobileconfig
```

payloads：

1. Root certificate payload
   - `PayloadType`: `com.apple.security.root`
   - `PayloadContent`: base64 DER root CA certificate bytes
   - `PayloadDisplayName`: `Marble Panel Local CA`

2. Web Clip payload
   - `PayloadType`: `com.apple.webClip.managed`
   - `Label`: `Marble Panel`
   - `URL`: selected HTTPS App URL
   - `FullScreen`: true
   - `IsRemovable`: true
   - `Precomposed`: true
   - `Icon`: existing PWA icon, preferably `web/public/icons/icon-180.png` or generated PNG data

Bootstrap response headers：

```text
Content-Type: application/x-apple-aspen-config
Content-Disposition: attachment; filename="Marble-Panel.mobileconfig"
Cache-Control: no-store
```

Known iOS friction:

- Unsigned profile will show as unverified. Acceptable for MVP if TUI displays CA fingerprint and the operator controls the LAN.
- Full Trust cannot be automated through a manually downloaded profile.
- Safari should be the recommended scanner/browser for `.mobileconfig`.
- If user only installs the profile but skips Full Trust, the Web Clip exists but HTTPS still fails.

Future hardening:

- Optionally sign the `.mobileconfig` if a suitable signing identity is available.
- Add Apple Configurator / MDM deployment notes for environments that need automatic certificate trust.

## 9. Android Certificate Flow

Generated download：

```text
rootCA.crt
rootCA.cer
```

Bootstrap response headers：

```text
Content-Type: application/x-x509-ca-cert
Content-Disposition: attachment; filename="Marble-Panel-Local-CA.crt"
Cache-Control: no-store
```

Android TUI copy should stay precise:

- Android receives only the root CA certificate.
- Default QR can point to `.crt`; bootstrap page should also expose `.cer` DER fallback if import fails.
- No Web Clip/mobileconfig equivalent is generated.
- After cert install, user opens the HTTPS App URL in Chrome.
- Home screen entry is created with Chrome's PWA install or Add to Home Screen flow.

Known Android friction:

- Settings wording varies by vendor and Android version.
- Some Android apps do not trust user-installed CAs, but the Marble Panel browser/PWA path targets Chrome, not arbitrary native apps.
- User may need lock screen credentials enabled before installing a CA certificate.

## 10. Server Changes

Update `server/src/index.ts` to support HTTPS without changing normal dev defaults.

Environment variables:

```text
HOST=0.0.0.0
PORT=12001
TLS_CERT_FILE=data/lan-tls/app-cert.pem
TLS_KEY_FILE=data/lan-tls/app-key.pem
PUBLIC_BASE_URL=https://marble-panel.local:12001
```

Behavior:

- If both `TLS_CERT_FILE` and `TLS_KEY_FILE` are present, pass `tls: { cert: Bun.file(...), key: Bun.file(...) }` to `Bun.serve`.
- If either is missing, keep existing HTTP behavior.
- Log `https://...` when TLS is enabled.
- Keep SSE `idleTimeout: 0`.
- Do not require TLS for `bun run dev`.

## 11. Package Changes

Root `package.json`:

```json
{
  "scripts": {
    "lan:https": "bun scripts/lan-https.ts"
  },
  "devDependencies": {
    "@clack/prompts": "...",
    "qrcode-terminal": "..."
  }
}
```

Implementation can choose minimal dependencies:

- `@clack/prompts` for operator-friendly TUI prompts.
- `qrcode-terminal` for terminal QR rendering.
- No frontend UI dependency is needed.

If dependency footprint is a concern, MVP can render QR through a small local helper or plain URL first, then add QR in phase 2.

## 12. Bootstrap Server Routes

Routes are scoped under a random token:

```text
GET /<token>/
  HTML install guide with iOS and Android sections.

GET /<token>/ios/Marble-Panel.mobileconfig
  iOS profile: cert + Web Clip.

GET /<token>/android/rootCA.crt
  Android CA cert only.

GET /<token>/android/rootCA.cer
  Android DER fallback CA cert.

GET /<token>/ca/rootCA.pem
  Optional desktop CA download.

GET /<token>/status
  Optional JSON status for future TUI/device check-ins.
```

Everything else returns 404.

Bootstrap HTML should be functional and restrained:

- Plain system font.
- No external assets.
- Show the same CA fingerprint as the TUI.
- Show the HTTPS App URL.
- Warn that only `rootCA.pem` / `.crt` is public; no private key is included.

## 13. Implementation Phases

### Phase 1 - Foundation

- Add `lan:https` script.
- Detect LAN IP and hostname.
- Check `mkcert`.
- Generate leaf cert/key into `data/lan-tls/`.
- Copy public root CA certificate into `data/lan-tls/`.
- Build web assets.
- Start HTTPS Marble Panel server with existing backend.

Acceptance:

```bash
bun run lan:https
curl --cacert data/lan-tls/rootCA.pem https://<host>:12001/
```

The curl response must return the Marble Panel app shell.

### Phase 2 - Bootstrap Downloads

- Add temporary HTTP bootstrap server.
- Serve root CA as `.crt` / `.pem`.
- Generate and serve iOS `.mobileconfig`.
- Serve simple bootstrap HTML with iOS/Android instructions.

Acceptance:

```bash
curl -I http://<lan-ip>:12080/<token>/ios/Marble-Panel.mobileconfig
curl -I http://<lan-ip>:12080/<token>/android/rootCA.crt
```

Headers must match expected profile/certificate content types.

### Phase 3 - TUI

- Add TUI status display.
- Render separate iOS and Android QR codes.
- Show app URL, bootstrap URL, CA fingerprint.
- Add quit/cleanup behavior.

Acceptance:

- TUI starts after HTTPS app and bootstrap server are ready.
- Ctrl-C or `q` stops child services cleanly.
- No repeated Bun server processes remain after exit.

### Phase 4 - Device Verification

iOS:

- Scan iOS QR in Safari.
- Install profile.
- Enable Full Trust manually.
- Launch Home Screen Web Clip.
- Confirm app shell loads over HTTPS.
- Confirm SSE connects after login/auth state is valid.
- Confirm fullscreen/kiosk behavior still works.

Android:

- Scan Android QR.
- Install CA certificate.
- Open HTTPS App URL in Chrome.
- Confirm no certificate warning.
- Install/Add to Home Screen through Chrome.
- Confirm launched PWA connects to SSE.

### Phase 5 - Documentation And Hardening

- Link this plan from `ROADMAP.md` or fold into a future HTTPS phase after implementation starts.
- Add a short README operation section.
- Add troubleshooting for `.local` failures, IP changes, profile removal, and certificate renewal.
- Optional: support signed `.mobileconfig`.

## 14. Verification Matrix

| Area | Check | Expected |
|---|---|---|
| mkcert | `mkcert -CAROOT` | root CA exists |
| leaf cert | `openssl x509 -text` | SAN includes selected URL host |
| HTTPS app | `curl --cacert rootCA.pem` | app shell response |
| bootstrap | QR URL opens on phone | install page loads |
| iOS profile | Safari downloads `.mobileconfig` | Settings shows downloaded profile |
| iOS trust | Full Trust enabled | Web Clip HTTPS loads |
| Android cert | CA installed | Chrome trusts app URL |
| PWA | app installed/launched | fullscreen/standalone behavior works |
| SSE | `/events` | connection stays open |
| cleanup | process exit | no bootstrap/server child remains |

## 15. Failure Handling

`mkcert` missing:

- TUI shows install instructions.
- On macOS: `brew install mkcert`.
- On Windows/WSL: clarify whether script is running in WSL or host OS; certificate trust must match the OS serving HTTPS.

No LAN IP:

- Fall back to localhost mode.
- TUI explains mobile install cannot proceed until a LAN interface is available.

Port occupied:

- Detect whether the port is Marble Panel.
- If occupied by another process, fail with the exact port and process hint where possible.
- Do not silently kill unrelated processes.

`.local` not resolving:

- Show IP fallback QR/profile option.
- Explain that IP-based Web Clip may need regeneration when LAN IP changes.

iOS profile installed but Web Clip fails:

- Check Full Trust was enabled.
- Check URL host matches cert SAN.
- Check phone and host are on same LAN/VLAN.

Android cert installed but Chrome warns:

- Check the downloaded cert is CA/root, not leaf cert.
- Check URL host matches cert SAN.
- Re-open Chrome after CA installation if needed.

## 16. Security Notes

- Installing a private root CA gives that CA authority to sign HTTPS certificates trusted by the device. Keep this limited to trusted personal devices.
- Never expose `rootCA-key.pem`.
- Prefer rotating/regenerating the mkcert CA if the root private key may have leaked.
- Keep bootstrap local, tokenized, short-lived, and no-store.
- For managed fleets or non-personal devices, use MDM/Apple Configurator or a real domain with DNS-01 instead.

## 17. Source Notes

- Apple certificate trust guidance: manually installed certificate profiles are not automatically trusted for SSL/TLS; Full Trust must be enabled manually unless deployed through Configurator/MDM enrollment paths. See https://support.apple.com/en-gb/102390
- Apple Web Clip guidance: `com.apple.webClip.managed` can add a Home Screen Web Clip and launch full screen on iOS/iPadOS. See https://support.apple.com/en-mide/guide/deployment/depbc7c7808/web
- Apple TLS requirements: server certs need SAN, SHA-2, serverAuth EKU, and 825-day maximum validity. See https://support.apple.com/en-gb/103769
- Bun TLS guidance: `Bun.serve` supports TLS by passing `tls.key` and `tls.cert`. See https://bun.com/docs/runtime/http/tls
- mkcert mobile device guidance: install the mobile root CA from `mkcert -CAROOT`, and do not share `rootCA-key.pem`. See https://github.com/FiloSottile/mkcert
