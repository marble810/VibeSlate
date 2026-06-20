# VibeSlate Copilot Instructions

Follow the repository source of truth in `AGENTS.md` first.

- Use Bun only: `bun install`, `bun run`, and Bun workspace scripts. Do not add npm/yarn/pnpm workflows.
- Do not use Tailwind, Windi, UnoCSS, or other atomic CSS. Frontend UI uses Svelte 5 runes and component-scoped `<style lang="scss">` with CSS variables.
- Read `DESIGN.md` before UI changes. If the design rule is missing or ambiguous, update the design source before implementing UI.
- Docker is the only deployment path. Docker source files live in `docker/`; runtime generated data lives in `data/docker/` and must remain gitignored.
- Plans live in `PLAN/`. Active plans stay in `PLAN/`; completed or superseded plans move to `PLAN/Archive/`.
- Before task work, run `backlog instructions overview` and use the Backlog CLI for task updates. Do not edit Backlog markdown files directly.

## OpenAI / Codex Auth

- OpenAI usage monitoring uses Codex app-server with Docker-owned auth state.
- The app container owns `CODEX_HOME=/app/data/codex-home`; the backend supervises `codex app-server --stdio`.
- Do not restore or document the old refresh-token bootstrap. Never ask users to copy `OPENAI_REFRESH_TOKEN`, `OPENAI_ACCOUNT_ID`, host `~/.codex/auth.json`, or `openai-token.json`.
- `data/docker/codex-home/auth.json` is Codex-owned sensitive runtime state. Logs, SSE, SQLite, docs examples, and doctor output must not expose raw tokens or raw auth.json content.
- Docker login command: `docker compose -f docker/docker-compose.yml exec --workdir /app app bun run openai:auth:login`.
- Convenience wrapper: `bun run docker:openai:login`.
- Dev login requires the backend first: run `bun run dev`, then run `bun run openai:auth:login` in another terminal. Use `--base-url` for non-default ports and `VIBESLATE_PASSWORD` only as a local non-interactive fallback.

## Verification

Prefer these checks for OpenAI/Codex auth changes:

- `bun test server/src/*.test.ts scripts/openai-auth-login-client.test.ts`
- `bun x tsc -p server/tsconfig.json --noEmit`
- `bun run build`
- `bun run check:codex-app-server-schema`
- `docker compose -f docker/docker-compose.example.yml config`

Keep manual Docker/account checks explicit in docs and ROADMAP until a real device-code login, `auth.json` creation, rate-limit polling, SQLite write, and UI/SSE broadcast have been run.
