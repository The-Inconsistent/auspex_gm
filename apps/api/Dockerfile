# Build context = repo root:  docker build -f apps/api/Dockerfile .
# Bun runs the api from source (it handles the decorators), so there is no build step. Migrations run at startup
# (src/core/db.ts runMigrations). --omit=peer skips Next, which @wg/auth lists as a peer for its web subpath: the api
# only imports @wg/auth/api (@clerk/backend), and Next is ~370 MB of a 5 GB-free VPS disk.

FROM oven/bun:1.3-debian AS pruner
WORKDIR /app
RUN bun install -g turbo@^2
COPY . .
RUN turbo prune @wg/api --docker

FROM oven/bun:1.3-debian
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN bun install --no-verify --production --omit=peer
COPY --from=pruner /app/out/full/ .
WORKDIR /app/apps/api
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
CMD ["bun", "src/main.ts"]
