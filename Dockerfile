# Stage 1: build frontend
FROM oven/bun:1-slim AS frontend
COPY web/ /app/web/
WORKDIR /app/web
RUN bun install && bun run build

# Stage 2: runtime
FROM oven/bun:1-slim
COPY server/ /app/server/
COPY --from=frontend /app/web/dist /app/web/dist
WORKDIR /app/server
RUN bun install --production
ENV PORT=80
EXPOSE 80
CMD ["bun", "src/index.ts"]
