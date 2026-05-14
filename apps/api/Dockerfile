# syntax=docker/dockerfile:1.10

ARG NODE_VERSION=24
ARG PNPM_VERSION=11.0.9

# ---------- deps ----------
# Debian-slim (glibc) chosen over alpine to avoid musl-binding compatibility
# issues with native modules (unrs-resolver, ssh2, etc).
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-bookworm-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY packages packages
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
COPY . .

# Install Cerbos CLI and compile policies to a WASM bundle.
# The bundle is copied to the runner stage and loaded at runtime by CerbosModule.
#
# Version pinned to latest stable (v0.53.0). To update:
#   1. Download the new release tarball for Linux_arm64
#   2. Run: shasum -a 256 cerbos_<version>_Linux_arm64.tar.gz
#   3. Update CERBOS_VERSION + CERBOS_SHA256 below
#
# SHA256 source: https://github.com/cerbos/cerbos/releases/download/v0.53.0/checksums.txt
ARG CERBOS_VERSION=0.53.0
ARG CERBOS_SHA256=c8adbd22e41676d8957d24af11ebb3dec312eabf0361731f9bef0604144af493
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && \
    curl -fsSL \
      "https://github.com/cerbos/cerbos/releases/download/v${CERBOS_VERSION}/cerbos_${CERBOS_VERSION}_Linux_arm64.tar.gz" \
      -o /tmp/cerbos.tgz && \
    echo "${CERBOS_SHA256}  /tmp/cerbos.tgz" | sha256sum -c && \
    tar -xz -C /usr/local/bin cerbos -f /tmp/cerbos.tgz && \
    rm /tmp/cerbos.tgz && \
    apt-get remove -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
# Compile policies to WASM bundle (also runs .cerbos-tests assertions).
RUN cd infra/cerbos && bash ./build.sh

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
# Cerbos WASM bundle — loaded at runtime by CerbosModule from /app/cerbos-bundle.wasm
COPY --from=builder --chown=nestjs:nodejs /repo/infra/cerbos/policies/bundle.wasm /app/cerbos-bundle.wasm

USER nestjs:nodejs
EXPOSE 3001

# Liveness probe — hits the NestJS health controller at /api/health.
# Uses node's built-in fetch (Node 22+) so no extra system deps needed.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" \
    || exit 1

CMD ["node", "dist/main.js"]
