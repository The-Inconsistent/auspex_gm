# Build context = repo root:
#   docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_… .
# Both are baked in at build time: the publishable key into the client bundle, and API_ORIGIN into the rewrites
# (next.config.ts), which Next freezes into the routes manifest. The runtime API_ORIGIN (compose) serves apiGet.

# Node base with Bun copied in: Bun installs, Node runs `next build` (Bun 1.3 crashes with SIGTRAP running Next's
# build itself when there is no node binary to hand the shebang to).
FROM node:22-bookworm-slim AS base
COPY --from=oven/bun:1.3-debian /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s bun /usr/local/bin/bunx
WORKDIR /app

FROM oven/bun:1.3-debian AS pruner
WORKDIR /app
RUN bun install -g turbo@^2
COPY . .
RUN turbo prune @wg/web --docker

# One stage for install + build, so the workspace symlinks survive.
FROM base AS builder
COPY --from=pruner /app/out/json/ .
RUN bun install --no-verify
COPY --from=pruner /app/out/full/ .
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG API_ORIGIN=http://api:4000
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY API_ORIGIN=$API_ORIGIN
RUN bunx turbo run build --filter=@wg/web

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
