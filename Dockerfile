# Reader Sensei web app. Serves pre-processed books; no Python/GPU needed here.
# The books/ folder (with each book's .sync/ produced by prep/prep.py) is mounted at /books.

FROM oven/bun:1 AS build
WORKDIR /app
COPY app/package.json app/bun.lock ./
RUN bun install --frozen-lockfile
COPY app/ ./
RUN bun run build

FROM oven/bun:1-slim
WORKDIR /app
COPY --from=build /app/.output ./.output
# Database migrations, applied on startup.
COPY --from=build /app/drizzle ./drizzle
ENV NODE_ENV=production \
    BOOKS_DIR=/books \
    DATA_DIR=/data \
    PORT=3000
EXPOSE 3000
CMD ["bun", ".output/server/index.mjs"]
