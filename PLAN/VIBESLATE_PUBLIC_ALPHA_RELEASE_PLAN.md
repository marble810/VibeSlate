# VibeSlate Public Alpha Release Plan

## Summary

- Public-facing project name: `VibeSlate`
- Public deployment path: Docker Compose only
- Image target: `ghcr.io/marble810/vibeslate`
- Alpha tag target: `v0.1.0-alpha.1`

## Implemented

- Added `docker/.env.example` and `docker/docker-compose.example.yml` as the tracked public templates.
- Moved real local deployment file expectation to `docker/.env` + `docker/docker-compose.yml` and ignored both.
- Added `docker/GetCodexAuthInfo.sh` and `docker/GetCodexAuthInfo.ps1`.
- Switched public docs and helper copy to `.env`-level provider/auth/TLS/user settings.
- Updated Dockerfile OCI metadata to `VibeSlate` + `AGPL-3.0-only`.
- Added GHCR alpha image workflow for `linux/amd64` and `linux/arm64`.
- Renamed public app, PWA, login, and LAN setup strings to `VibeSlate`.

## Still Needs Verification

- Clean-checkout Docker-only deployment from copied compose template.
- GHCR workflow execution on GitHub.
- Final repo rename and publicize on GitHub.
- Release tag creation and release notes publication.

## Acceptance Notes

- Runtime verification is still pending and remains explicit in `ROADMAP.md`.
- Existing user-local secrets under `data/docker/` and `server/config.json` remain out of git scope.
