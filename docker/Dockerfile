# Stage 1: build frontend
FROM oven/bun:1-slim AS frontend

LABEL stage="frontend-build"
LABEL description="VibeSlate frontend build stage"
COPY bun.lock /app/bun.lock
COPY package.json /app/package.json
COPY server/package.json /app/server/package.json
COPY web/package.json /app/web/package.json
WORKDIR /app
RUN bun install --frozen-lockfile
COPY web/ /app/web/
WORKDIR /app/web
RUN bun run build

# Stage 2: runtime
FROM oven/bun:1-slim

LABEL org.opencontainers.image.title="VibeSlate"
LABEL org.opencontainers.image.description="LLM usage and spare-device info slate"
LABEL org.opencontainers.image.source="https://github.com/marble810/vibeslate"
LABEL org.opencontainers.image.licenses="AGPL-3.0-only"

RUN apt-get update \
  && apt-get install -y --no-install-recommends nodejs ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY bun.lock /app/bun.lock
COPY package.json /app/package.json
COPY server/package.json /app/server/package.json
COPY web/package.json /app/web/package.json
WORKDIR /app
RUN bun install --frozen-lockfile --production

COPY server/ /app/server/
COPY scripts/openai-auth-login.ts /app/scripts/openai-auth-login.ts
COPY scripts/openai-auth-login-client.ts /app/scripts/openai-auth-login-client.ts
COPY --from=frontend /app/web/dist /app/web/dist
WORKDIR /app/server

RUN mkdir -p /app/data/state /app/data/certs /app/data/codex-home && chmod 700 /app/data/codex-home
ENV HOST=0.0.0.0
ENV PORT=12001
ENV MARBLE_DATA_DIR=/app/data
EXPOSE 12001
CMD ["bun", "src/index.ts"]
