# Docker Deployment UX Plan

## Summary

- Goal: unify the public Docker deployment path around one documented flow.
- In scope: `README.md`, `docs/DOCKER_DEPLOYMENT.md`, `docker/docker-compose.example.yml`, `docker:GetCodexAuthInfo` helpers, and compose-level bool/string toggles for optional auth and TLS.
- Out of scope: browser `/install` onboarding, `.env`-based deployment, provider secret entry in the web UI, interactive init flows, and auto-mutating local deployment files.

## Decisions

- Primary deployment path stays `docker-compose.example.yml -> docker-compose.yml`.
- Provider secrets stay host-side and are pasted manually into compose.
- Optional password auth and LAN HTTPS are enabled or disabled directly in compose with bool/string fields.
- Public docs prefer raw `docker compose`; Bun wrappers remain convenience helpers for repo contributors.

## Implementation

- Keep `README.md` as a short quick start and move detailed setup guidance to `docs/DOCKER_DEPLOYMENT.md`.
- Rework helper output so OpenAI bootstrap scripts print paste-ready YAML by default.
- Remove the `init` wrapper and container entrypoint from the deployment path.
- Add explicit TLS config fields so Docker TLS is controlled by compose rather than auto-detection.
- Update compose template comments so required, optional auth, optional LAN HTTPS, and optional UI/runtime knobs are clearly separated.
- Sync `ROADMAP.md` only for the doc/CLI UX work that is actually implemented here.

## Verification

- `./docker/GetCodexAuthInfo.sh --help`
- `./docker/GetCodexAuthInfo.sh --redact`
- `bun run help`
- `bun run build`
- `bun x tsc -p server/tsconfig.json --noEmit`

## Assumptions

- Public users may have Docker Compose but not Bun.
- `docker/GetCodexAuthInfo.ps1` can be updated statically, but Windows runtime validation may still remain unverified afterward.
