# syntax=docker/dockerfile:1.10

ARG NODE_VERSION=24
ARG ALPINE_VERSION=3.20
ARG PNPM_VERSION=11.0.9

# ---------- deps ----------
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY packages packages
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm fetch --frozen-lockfile && \
    pnpm install --frozen-lockfile --filter=api...

# ---------- builder ----------
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS builder
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
RUN pnpm --filter api build
RUN pnpm --filter api deploy --prod --legacy /prod

# ---------- runner ----------
FROM --platform=$TARGETPLATFORM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS runner
ARG BUILD_SHA=unknown
ARG BUILD_TIME=unknown
ARG BUILD_VERSION=0.0.0

LABEL org.opencontainers.image.title="windhoek-api" \
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

RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nestjs

# Strip npm + npx from the runner. NestJS only needs `node`; the bundled npm
# inside node:24-alpine ships older node-gyp/cacache tarballs that trip Trivy
# HIGH/CRITICAL CVEs (CVE-2026-31802, -29786, -26960, -24842, -23950, -23745).
RUN rm -rf /usr/local/lib/node_modules/npm \
           /usr/local/bin/npm \
           /usr/local/bin/npx \
           /usr/local/bin/corepack

WORKDIR /app

COPY --from=builder --chown=nestjs:nodejs /prod ./

USER nestjs:nodejs
EXPOSE 3001

# No Docker HEALTHCHECK - ALB target group does HTTP /health checks from outside.
# Docker-level health adds a second source of truth that can drift from ALB's view.

CMD ["node", "dist/main.js"]
