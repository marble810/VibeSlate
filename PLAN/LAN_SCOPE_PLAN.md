# LAN Scope Plan

## Scope

LAN Scope is the recommended deployment path for trusted personal devices on the same local network. It optimizes for convenient kiosk/PWA use, trusted HTTPS, and minimal moving parts.

## Boundary

- Default network shape: client device -> Bun HTTPS app.
- Recommended command: `bun run lan:https`.
- TLS source: `mkcert` private CA and generated leaf certificate.
- Installation helper: temporary HTTP bootstrap with QR code links.
- Security posture: direct HTTPS + optional password auth.
- Out of scope by default: reverse proxy, fail2ban, hidden entry gate, public-domain ACME TLS.

## Current State

- `scripts/lan-https.ts` implements the LAN HTTPS installer.
- `package.json` exposes `bun run lan:https`.
- The app can serve HTTPS directly when `TLS_CERT_FILE` and `TLS_KEY_FILE` are set.
- iOS receives a profile containing root CA + Web Clip.
- Android receives the root CA certificate and uses Chrome for PWA installation.
- `TESTING_LAN_HTTPS.md` remains the human verification checklist.

## Tasks

- [x] Keep `PLAN/Archive/LAN_HTTPS_INSTALLER_PLAN.md` as historical design context only.
- [x] Update LAN docs that still pointed to `PLAN/LAN_HTTPS_INSTALLER_PLAN.md`.
- [x] Verify `bun run lan:https` on the host machine after the next implementation batch.
- [x] Confirm generated cert SAN covers selected hostname, LAN IP, `127.0.0.1`, and `localhost`.
- [ ] Confirm iOS profile install + manual Full Trust + Web Clip launch. 🔴 Human test
- [ ] Confirm Android CA install + Chrome HTTPS access + PWA install prompt. 🔴 Human test
- [x] Keep password auth optional and config-driven for LAN.
- [x] Do not add fail2ban or hidden entry requirements to LAN unless explicitly requested.

## Verification

- `bun run lan:https` ✅ — Smoke test passed (2026-06-08). Script starts, detects LAN IP (`10.92.70.62`), reuses valid certs, starts HTTPS + bootstrap servers, renders TUI with QR codes.
- `openssl verify -CAfile data/lan-tls/rootCA.pem data/lan-tls/app-cert.pem` ✅ — `app-cert.pem: OK`
- `plutil -lint data/lan-tls/Marble-Panel.mobileconfig` ✅ — `Marble-Panel.mobileconfig: OK`
- Cert SAN ✅ — DNS:marble-panel.local, DNS:localhost, DNS:Leungs-MacBook.local, IP:127.0.0.1, IP:10.92.70.62
- Cert validity ✅ — 823 days (under Apple's 825-day limit), SHA-256, serverAuth EKU
- Human device checks from `TESTING_LAN_HTTPS.md` 🔴 — Pending iOS & Android physical device tests

## Automated Checks Performed (2026-06-08)

| Check | Tool/Method | Result |
|---|---|---|
| mkcert available | `which mkcert` | `/opt/homebrew/bin/mkcert` |
| Web build succeeds | `bun run build` | ✅ 631 modules, PWA SW generated |
| Script smoke test | `bun run lan:https` (10s) | ✅ TUI renders, services start |
| Cert chain verification | `openssl verify -CAfile` | ✅ OK |
| mobileconfig syntax | `plutil -lint` | ✅ OK |
| Cert SAN coverage | `openssl x509 -text` | ✅ All 5 names present |
| Password auth optional | Code audit `auth.ts` + `config.ts` | ✅ Disabled by default, config-driven |
| No fail2ban in LAN | Code grep across non-Archive sources | ✅ Only in `PUBLIC_SCOPE_OPTIMIZATION_PLAN.md` |
| Archive plan isolation | Grep for `LAN_HTTPS_INSTALLER_PLAN` outside Archive | ✅ Only self-referential in this plan |

## Notes

- The HTTP bootstrap may distribute only public install material: root certificate, profile, and instructions.
- Never distribute or copy `rootCA-key.pem` into the repo.
- If LAN IP changes, regenerate the leaf cert and iOS Web Clip profile; root CA reinstall should not be required.
