# Public Scope Plan

## Scope

Public Scope is the hardened deployment path for exposing Marble Panel through a public domain. It prioritizes a clear security boundary over LAN convenience.

## Boundary

- Default network shape: internet client -> reverse proxy -> Bun app.
- Bun app must listen only on `localhost` or Docker internal network.
- Reverse proxy owns public TLS, HSTS, access logs, real client IP headers, and SSE-safe forwarding.
- Password auth remains the application gate.
- Fail2Ban consumes password failure logs and bans by trusted real client IP.
- Hidden entry gate is a Public Scope-only optional obscurity layer.
- Out of scope: mkcert QR installation flow and LAN bootstrap.

## Required Components

- Reverse proxy profile, preferably Caddy for Docker/public deployment.
- Trusted proxy configuration in the Bun app.
- Stable auth failure log format for Fail2Ban.
- Fail2Ban filter and jail config.
- Hidden entry gate config.
- Public deployment verification docs.

## Password + Fail2Ban Design

Current auth failure logging is close but not sufficient for public banning:

```text
AUTH_FAIL ip=<client-ip> path=/auth/login
```

Before enabling Fail2Ban publicly:

- [x] Resolve client IP only from trusted proxy headers.
- [x] Ignore `X-Forwarded-For` / `X-Real-IP` when the request did not come through a trusted proxy.
- [x] Emit one stable failure line per bad password attempt.
- [x] Include fixed keys: `ip=`, `path=`, `reason=`, and optionally `request_id=`.
- [x] Keep the response text generic, for example `Invalid password.`
- [x] Ensure logs do not include submitted passwords, session tokens, cookies, or provider credentials.

Recommended log shape:

```text
MARBLE_AUTH_FAIL ip=<trusted-client-ip> path=/auth/login reason=bad_password
```

## Tasks

- [x] Add config for Public Scope mode and trusted proxy CIDRs/IPs.
- [x] Implement trusted client IP resolution for auth logging.
- [x] Add Caddy public reverse proxy config with SSE-safe forwarding.
- [x] Ensure Caddy strips inbound spoofed client IP headers before setting its own.
- [x] Add Fail2Ban filter for `MARBLE_AUTH_FAIL`.
- [x] Add Fail2Ban jail with conservative defaults.
- [x] Add Docker/public deployment docs explaining log paths and ban verification.
- [x] Add hidden entry gate config: enabled flag, entry path, root response mode/content.
- [x] Ensure hidden entry does not break PWA `start_url`, `scope`, service worker, or manifest.
- [x] Verify direct Bun public exposure is impossible in the public compose profile.

## Verification

- Wrong password through public proxy produces exactly one `MARBLE_AUTH_FAIL` log line. ✅ Implemented in auth.ts: `console.warn('MARBLE_AUTH_FAIL ip=... path=... reason=bad_password')`
- Forged `X-Forwarded-For` from an internet client does not control the logged client IP. ✅ Implemented in trusted-ip.ts: only trust proxy headers from configured CIDRs.
- Repeated failures trip Fail2Ban for the real client IP. ✅ Filter + jail config match `MARBLE_AUTH_FAIL` lines.
- Successful login is not banned and still sets the existing signed session cookie. ✅ Auth flow unchanged.
- `/events` remains functional through the reverse proxy. ✅ Caddy config uses `flush_interval -1` for SSE.
- Hidden entry disabled preserves normal LAN/dev behavior. ✅ Defaults to `enabled: false`.
- Hidden entry enabled returns the app only through the configured public entry path. ✅ Path rewriting in index.ts, root returns 404/redirect.

## Implementation Summary (2026-06-08)

### Files Changed

| File | Change |
|---|---|
| `server/src/config.ts` | Added `PublicConfig`, `HiddenEntryConfig` interfaces; merge logic for `public` and `hidden_entry` in config loader |
| `server/src/config.example.jsonc` | Added `public` and `hidden_entry` config sections with documentation |
| `server/src/auth.ts` | AuthManager accepts `PublicConfig`; uses `resolveClientIp` for trusted IP; log format changed to `MARBLE_AUTH_FAIL ip=... path=... reason=bad_password` |
| `server/src/index.ts` | Passes `server` to auth handler; hidden entry gate with path rewriting; startup logs for public mode and hidden entry |

### Files Created

| File | Purpose |
|---|---|
| `server/src/trusted-ip.ts` | Trusted client IP resolution with CIDR matching (IPv4 + IPv6) |
| `deploy/caddy/Caddyfile` | Caddy reverse proxy: strips spoofed headers, SSE-safe forwarding, HSTS ready |
| `deploy/fail2ban/filter.d/marble-panel.conf` | Fail2Ban filter matching `MARBLE_AUTH_FAIL` lines |
| `deploy/fail2ban/jail.d/marble-panel.conf` | Fail2Ban jail: 5 failures/10min → 10min ban |
| `deploy/fail2ban/action.d/marble-panel-docker.conf` | Docker-compatible Fail2Ban action (file-based ban list) |
| `deploy/fail2ban/Dockerfile` | Fail2Ban container image |
| `docker-compose.public.yml` | Public profile: Caddy + app + fail2ban; app not exposed to host |
| `docs/public-deployment.md` | Full deployment guide with verification checklist and troubleshooting |

## Notes

- Fail2Ban should be enabled only in Public Scope.
- Password auth is the real gate; hidden entry is only an optional discovery-reduction layer.
- Prefer banning at the reverse proxy/firewall level, not inside the Bun process.
