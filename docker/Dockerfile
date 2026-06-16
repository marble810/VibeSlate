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

COPY bun.lock /app/bun.lock
COPY package.json /app/package.json
COPY server/package.json /app/server/package.json
COPY web/package.json /app/web/package.json
WORKDIR /app
RUN bun install --frozen-lockfile --production

COPY server/ /app/server/
COPY --from=frontend /app/web/dist /app/web/dist
WORKDIR /app/server

RUN mkdir -p /app/data/state /app/data/certs
ENV HOST=0.0.0.0
ENV PORT=12001
EXPOSE 12001
CMD ["bun", "src/index.ts"]
