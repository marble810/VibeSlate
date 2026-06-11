# Stage 1: build frontend
FROM oven/bun:1-slim AS frontend
ARG MARBLE_HIDDEN_ENTRY_PATH=""
ENV MARBLE_HIDDEN_ENTRY_PATH=${MARBLE_HIDDEN_ENTRY_PATH}
COPY web/ /app/web/
WORKDIR /app/web
RUN bun install && bun run build

# Stage 2: runtime
FROM oven/bun:1-slim
COPY server/ /app/server/
COPY --from=frontend /app/web/dist /app/web/dist
WORKDIR /app/server
RUN bun install --production
ENV HOST=0.0.0.0
ENV PORT=12001
EXPOSE 12001
CMD ["bun", "src/index.ts"]
