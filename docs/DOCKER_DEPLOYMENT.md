# Docker Deployment

VibeSlate's public deployment path is Docker Compose only. Bun is not required for end users.

## Quick Start

```bash
cp docker/docker-compose.example.yml docker/docker-compose.yml
cp docker/.env.example docker/.env
./docker/GetCodexAuthInfo.sh
docker compose -f docker/docker-compose.yml up -d app
```

Open `http://localhost:12001`.

All provider credentials, password auth, LAN HTTPS, and user-facing runtime settings now live in `docker/.env`. There is no separate `init` step.

## Main Files

- `docker/docker-compose.yml`: Docker structure only
- `docker/.env`: all provider/auth/TLS/UI settings

## Required Fields

Edit `docker/.env` and fill the provider credentials you actually use:

- `DEEPSEEK_PLATFORM_TOKEN`
- `OPENAI_REFRESH_TOKEN`
- `OPENAI_ACCOUNT_ID`
- `OPENCODE_WORKSPACE_ID`
- `OPENCODE_AUTH_COOKIE`

Unneeded providers can stay empty.

## OpenAI Credentials

Print paste-ready env lines from the host's Codex auth state:

```bash
./docker/GetCodexAuthInfo.sh
```

If `~/.codex/auth.json` is older than a runtime-persisted token, point the helper at an existing state file:

```bash
./docker/GetCodexAuthInfo.sh --state-file /path/to/data/docker/state/openai-token.json
```

Useful variants:

- `./docker/GetCodexAuthInfo.sh --redact`
- `./docker/GetCodexAuthInfo.sh --format yaml`
- `./docker/GetCodexAuthInfo.ps1`

## Optional Password Auth

Password auth is controlled entirely by these `docker/.env` fields:

- `AUTH_ENABLED`
- `AUTH_PASSWORD_HASH`
- `AUTH_COOKIE_SECURE`

Enable it like this:

```dotenv
AUTH_ENABLED=true
AUTH_PASSWORD_HASH='$argon2id$v=19$m=65536,t=2,p=1$...'
AUTH_COOKIE_SECURE=false
```

Use `AUTH_COOKIE_SECURE=false` for plain `http://localhost:12001`.

Use `AUTH_COOKIE_SECURE=true` when either of these is true:

- `TLS_ENABLED=true` in `docker/.env`
- you are serving VibeSlate behind your own HTTPS reverse proxy

To generate the hash, use any Argon2id-compatible tool. If you only have Docker, this works:

```bash
docker run --rm oven/bun:1-slim bun -e 'console.log(await Bun.password.hash("change-me"))'
```

Because Argon2id hashes contain many `$` characters, keep the value single-quoted when you paste it into `docker/.env`.

Disable password auth by setting `AUTH_ENABLED=false`.

## Optional LAN HTTPS

LAN HTTPS is also controlled in `docker/.env`:

```dotenv
TLS_ENABLED=true
TLS_CERT_FILE=/app/data/certs/cert.pem
TLS_KEY_FILE=/app/data/certs/key.pem
TLS_ROOT_CA_FILE=/app/data/certs/rootCA.pem
```

The default compose mount already maps `data/docker/certs/` to `/app/data/certs/`, so the normal host-side layout is:

- `data/docker/certs/cert.pem`
- `data/docker/certs/key.pem`
- `data/docker/certs/rootCA.pem`

Generate them on the host with `mkcert`, then start the app:

```bash
mkdir -p data/docker/certs
mkcert -cert-file data/docker/certs/cert.pem -key-file data/docker/certs/key.pem localhost 192.168.1.10
cp "$(mkcert -CAROOT)/rootCA.pem" data/docker/certs/rootCA.pem
docker compose -f docker/docker-compose.yml up -d app
```

After that, open `https://<your-lan-ip>:12001/lan-setup` to download the root CA and install it on client devices.

Disable LAN HTTPS by setting `TLS_ENABLED=false`.

## Start, Inspect, Verify

```bash
docker compose -f docker/docker-compose.yml up -d app
docker compose -f docker/docker-compose.yml ps
docker compose -f docker/docker-compose.yml logs -f app
```

Optional smoke test from a Bun-capable checkout:

```bash
bun run docker:smoke
```

## Provider Notes

- `DeepSeek`: log into `platform.deepseek.com` and copy the Bearer token from a browser request's `Authorization` header.
- `OpenCode Go`: copy `wrk_...` from the workspace URL and the `auth` cookie from the browser.

## Troubleshooting

- `Refresh token rejected (401)`: use `--state-file` with a current `openai-token.json`.
- Password auth enabled but login loops on plain HTTP: verify `AUTH_COOKIE_SECURE=false`.
- Password auth behind HTTPS: switch `AUTH_COOKIE_SECURE=true`.
- `TLS_ENABLED=true` but the container stays down: check that `TLS_CERT_FILE` and `TLS_KEY_FILE` point to mounted files inside the container.
- `/lan-setup` returns 404: make sure `TLS_ROOT_CA_FILE` exists inside the container and points to your mounted `rootCA.pem`.
