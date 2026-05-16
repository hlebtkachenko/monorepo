# syntax=docker/dockerfile:1.10

ARG NODE_VERSION=24
ARG PNPM_VERSION=11.0.9

# ---------- pruner ----------
# turbo prune emits a minimal subtree: out/json (manifests + lockfile, for a
# stable install layer) and out/full (source of web + its workspace deps
# only). node_modules is excluded from the build context by .dockerignore,
# so the pruned tree is clean. Keep turbo pinned to the root devDependency.
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-bookworm-slim AS pruner
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
COPY . .
RUN pnpm dlx turbo@2.9.12 prune web --docker

# ---------- deps ----------
# Debian-slim (glibc) chosen over alpine to avoid musl-binding compatibility
# issues with native modules (unrs-resolver, ssh2, etc).
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-bookworm-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
COPY --from=pruner /repo/out/json/ ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm fetch --frozen-lockfile && \
    pnpm install --frozen-lockfile --filter=web... --filter=@workspace/ui...

# ---------- builder ----------
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-bookworm-slim AS builder
ARG BUILD_SHA=unknown
ARG BUILD_TIME=unknown
ARG BUILD_VERSION=0.0.0
ENV NEXT_TELEMETRY_DISABLED=1 \
    BUILD_SHA=$BUILD_SHA \
    BUILD_TIME=$BUILD_TIME \
    BUILD_VERSION=$BUILD_VERSION
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
COPY --from=deps /repo /repo
COPY --from=pruner /repo/out/full/ ./
RUN pnpm --filter web build

# ---------- runner ----------
FROM --platform=$TARGETPLATFORM node:${NODE_VERSION}-bookworm-slim AS runner
ARG BUILD_SHA=unknown
ARG BUILD_TIME=unknown
ARG BUILD_VERSION=0.0.0

LABEL org.opencontainers.image.title="monorepo-web" \
      org.opencontainers.image.source="https://github.com/hlebtkachenko/monorepo" \
      org.opencontainers.image.revision="$BUILD_SHA" \
      org.opencontainers.image.created="$BUILD_TIME" \
      org.opencontainers.image.version="$BUILD_VERSION" \
      org.opencontainers.image.licenses="UNLICENSED"

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    BUILD_SHA=$BUILD_SHA \
    BUILD_TIME=$BUILD_TIME \
    BUILD_VERSION=$BUILD_VERSION

RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -s /bin/false nextjs \
    && apt-get update && apt-get install -y --no-install-recommends wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Strip npm + npx + corepack from the runner. Next.js standalone server.js
# does not need them, and the bundled npm ships an older node-gyp/cacache
# tar copies that trip Trivy HIGH/CRITICAL CVEs. Removing kills the alerts
# at the source.
RUN rm -rf /usr/local/lib/node_modules/npm \
           /usr/local/bin/npm \
           /usr/local/bin/npx \
           /usr/local/bin/corepack

WORKDIR /app

COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/public ./apps/web/public

USER nextjs:nodejs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O- http://127.0.0.1:3000/api/version >/dev/null || exit 1

# Force HOSTNAME=0.0.0.0 at exec time. Without this, Fargate/Docker runtime
# overrides our ENV HOSTNAME with the container's auto-assigned hostname
# (like ip-10-42-x-x), and Next.js standalone server binds to that non-
# loopback interface only. The cloudflared sidecar reaching localhost:3000
# then gets connection refused.
CMD ["sh", "-c", "HOSTNAME=0.0.0.0 exec node apps/web/server.js"]
