# syntax=docker/dockerfile:1.10

ARG NODE_VERSION=24
ARG PNPM_VERSION=11.0.9

# ---------- pruner ----------
# turbo prune emits a minimal subtree: out/json (manifests + lockfile, for a
# stable install layer) and out/full (source of api + its workspace deps
# only). node_modules is excluded from the build context by .dockerignore,
# so the pruned tree is clean. Keep turbo pinned to the root devDependency.
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-bookworm-slim AS pruner
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
COPY . .
RUN pnpm dlx turbo@2.9.12 prune api --docker

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
    pnpm install --frozen-lockfile --filter=api...

# ---------- builder ----------
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-bookworm-slim AS builder
ARG BUILD_SHA=unknown
ARG BUILD_TIME=unknown
ARG BUILD_VERSION=0.0.0
ENV BUILD_SHA=$BUILD_SHA \
    BUILD_TIME=$BUILD_TIME \
    BUILD_VERSION=$BUILD_VERSION
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
COPY --from=deps /repo /repo
COPY --from=pruner /repo/out/full/ ./

# Cerbos L3 runs as a sidecar (ghcr.io/cerbos/cerbos with policies baked in),
# NOT embedded. The api container talks to it over localhost:3593 gRPC.
# See ADR-0018 amendment 2026-05-14: Cerbos closed-source Rust transpiler
# makes self-hosted WASM bundle generation impossible, so the embedded path
# was abandoned in favor of the sidecar pattern (same as OpenFGA).
#
# Policy compile + tests still run in CI via the upstream cerbos binary
# (see .github/workflows/cerbos-policies-test.yml); no policy code is built
# into this image.

RUN pnpm --filter api build
RUN pnpm --filter api deploy --prod --legacy /prod

# ---------- runner ----------
FROM --platform=$TARGETPLATFORM node:${NODE_VERSION}-bookworm-slim AS runner
ARG BUILD_SHA=unknown
ARG BUILD_TIME=unknown
ARG BUILD_VERSION=0.0.0

LABEL org.opencontainers.image.title="monorepo-api" \
      org.opencontainers.image.source="https://github.com/hlebtkachenko/monorepo" \
      org.opencontainers.image.revision="$BUILD_SHA" \
      org.opencontainers.image.created="$BUILD_TIME" \
      org.opencontainers.image.version="$BUILD_VERSION" \
      org.opencontainers.image.licenses="UNLICENSED"

ENV NODE_ENV=production \
    PORT=3001 \
    HOST=0.0.0.0 \
    BUILD_SHA=$BUILD_SHA \
    BUILD_TIME=$BUILD_TIME \
    BUILD_VERSION=$BUILD_VERSION

RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -s /bin/false nestjs \
    && apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN rm -rf /usr/local/lib/node_modules/npm \
           /usr/local/bin/npm \
           /usr/local/bin/npx \
           /usr/local/bin/corepack

WORKDIR /app

COPY --from=builder --chown=nestjs:nodejs /prod ./

USER nestjs:nodejs
EXPOSE 3001

# Liveness probe — hits the NestJS health controller at /api/health.
# Uses node's built-in fetch (Node 22+) so no extra system deps needed.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" \
    || exit 1

CMD ["node", "dist/main.js"]
