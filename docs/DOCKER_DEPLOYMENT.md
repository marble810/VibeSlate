# Docker Deployment

VibeSlate's public deployment path is Docker Compose only. Bun is not required
for end users.

## Quick Start

```bash
cp docker/docker-compose.example.yml docker/docker-compose.yml
cp docker/.env.example docker/.env
docker compose -f docker/docker-compose.yml up -d app
docker compose -f docker/docker-compose.yml exec --workdir /app app bun run openai:auth:login
```

Open `http://localhost:12001`.

All provider credentials, OpenAI app-server settings, password auth, LAN HTTPS,
and user-facing runtime settings live in `docker/.env`. There is no separate
host-side OpenAI credential extraction step.

## Main Files

- `docker/docker-compose.yml`: Docker structure only
- `docker/.env`: provider/auth/TLS/UI/app-server settings
- `data/docker/`: persisted runtime state mounted to `/app/data`

## Runtime State

The compose example mounts the whole runtime data root:

```text
data/docker/ -> /app/data
```

Important paths:

- `data/docker/codex-home/auth.json`: Codex-owned sensitive auth state
- `data/docker/codex-home/config.toml`: Codex app-server config
- `data/docker/state/usage.sqlite`: non-sensitive OpenAI usage snapshots
- `data/docker/state/auth-status.json`: non-sensitive auth metadata
- `data/docker/certs/`: optional LAN HTTPS certs

Do not copy host `~/.codex/auth.json`, refresh tokens, account IDs, or old
token-state files into Docker. The container creates and refreshes its own Codex
login session.

## Required Fields

Edit `docker/.env` and fill the providers you use:

- `DEEPSEEK_PLATFORM_TOKEN`
- `OPENAI_ENABLED`
- `OPENAI_CODEX_HOME`
- `OPENAI_CODEX_CLI_PATH`
- `OPENAI_POLL_INTERVAL_SECONDS`
- `OPENAI_SQLITE_PATH`
- `OPENAI_AUTH_STATUS_PATH`
- `OPENCODE_WORKSPACE_ID`
- `OPENCODE_AUTH_COOKIE`

Unneeded providers can stay empty or disabled.

## OpenAI / Codex Login

OpenAI uses Codex app-server inside the app container.

Preferred CLI flow:

```bash
docker compose -f docker/docker-compose.yml exec --workdir /app app bun run openai:auth:login
```

The command runs inside the app container, calls the running VibeSlate backend,
prints the device-code URL/code, and waits for completion. If password auth is
enabled, it prompts for the VibeSlate password and reuses the normal app
session cookie.

From a Bun-capable checkout, this wrapper runs the same container command:

```bash
bun run docker:openai:login
```

UI flow:

1. Start Docker.
2. Open the VibeSlate UI.
3. In the `OpenAI` card, choose `Login`.
4. Open the device-code URL and enter the displayed code.
5. Wait for the next poll; usage snapshots are stored in SQLite.

The app-server process is started by the VibeSlate backend over stdio. No
app-server HTTP/WebSocket port is exposed.

Useful local diagnostics:

```bash
bun run openai:auth:doctor
bun run check:codex-app-server-schema
```

Doctor output is redacted and reports only metadata such as hashes, mtimes,
file modes, and connectivity state.

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

To generate the hash, use any Argon2id-compatible tool. If you only have
Docker, this works:

```bash
docker run --rm oven/bun:1-slim bun -e 'console.log(await Bun.password.hash("change-me"))'
```

Because Argon2id hashes contain many `$` characters, keep the value
single-quoted when you paste it into `docker/.env`.

Disable password auth by setting `AUTH_ENABLED=false`.

## Optional LAN HTTPS

LAN HTTPS is controlled in `docker/.env`:

```dotenv
TLS_ENABLED=true
TLS_CERT_FILE=/app/data/certs/cert.pem
TLS_KEY_FILE=/app/data/certs/key.pem
TLS_ROOT_CA_FILE=/app/data/certs/rootCA.pem
```

The default compose mount maps `data/docker/` to `/app/data/`, so the normal
host-side cert layout is:

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

After that, open `https://<your-lan-ip>:12001/lan-setup` to download the root
CA and install it on client devices.

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

OpenAI login from a Bun-capable checkout:

```bash
bun run docker:openai:login
```

## Provider Notes

- `DeepSeek`: log into `platform.deepseek.com` and copy the Bearer token from a
  browser request's `Authorization` header.
- `OpenCode Go`: copy `wrk_...` from the workspace URL and the `auth` cookie
  from the browser.

## Troubleshooting

- OpenAI card says `Codex app-server unavailable`: run
  `bun run openai:auth:doctor` and check the Codex CLI path plus
  `data/docker/codex-home` permissions.
- `bun run docker:openai:login` says the app container is not running: start it
  with `bun run docker:up`.
- `bun run openai:auth:login` in dev cannot connect: start the local backend
  first with `bun run dev`, or pass `--base-url <url>` when using a non-default
  address.
- Password prompt fails in a non-interactive terminal: set `VIBESLATE_PASSWORD`
  for that one command instead of pasting any OpenAI/Codex token.
- OpenAI card says another process is using this Codex home: stop duplicate
  containers or processes sharing the same `data/docker/` mount.
- Password auth enabled but login loops on plain HTTP: verify
  `AUTH_COOKIE_SECURE=false`.
- Password auth behind HTTPS: switch `AUTH_COOKIE_SECURE=true`.
- `TLS_ENABLED=true` but the container stays down: check that `TLS_CERT_FILE`
  and `TLS_KEY_FILE` point to mounted files inside the container.
- `/lan-setup` returns 404: make sure `TLS_ROOT_CA_FILE` exists inside the
  container and points to your mounted `rootCA.pem`.
