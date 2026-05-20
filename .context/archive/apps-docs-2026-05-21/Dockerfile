# syntax=docker/dockerfile:1.10

ARG NODE_VERSION=24
ARG PNPM_VERSION=11.0.9

# ---------- pruner ----------
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-bookworm-slim AS pruner
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
COPY . .
RUN pnpm dlx turbo@2.9.12 prune docs --docker

# ---------- deps ----------
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-bookworm-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
COPY --from=pruner /repo/out/json/ ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm fetch --frozen-lockfile && \
    pnpm install --frozen-lockfile --filter=docs... --filter=@workspace/ui...

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
RUN pnpm --filter docs build

# ---------- runner ----------
FROM --platform=$TARGETPLATFORM node:${NODE_VERSION}-bookworm-slim AS runner
ARG BUILD_SHA=unknown
ARG BUILD_TIME=unknown
ARG BUILD_VERSION=0.0.0

LABEL org.opencontainers.image.title="monorepo-docs" \
      org.opencontainers.image.source="https://github.com/hlebtkachenko/monorepo" \
      org.opencontainers.image.revision="$BUILD_SHA" \
      org.opencontainers.image.created="$BUILD_TIME" \
      org.opencontainers.image.version="$BUILD_VERSION" \
      org.opencontainers.image.licenses="UNLICENSED"

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3300 \
    HOSTNAME=0.0.0.0 \
    BUILD_SHA=$BUILD_SHA \
    BUILD_TIME=$BUILD_TIME \
    BUILD_VERSION=$BUILD_VERSION

RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -s /bin/false nextjs \
    && apt-get update && apt-get install -y --no-install-recommends wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Strip npm + npx + corepack from the runner — mirrors apps/web/Dockerfile.
# Next.js standalone server.js doesn't need them, and the bundled npm ships
# older node-gyp/cacache tar copies that trip Trivy HIGH/CRITICAL CVEs.
RUN rm -rf /usr/local/lib/node_modules/npm \
           /usr/local/bin/npm \
           /usr/local/bin/npx \
           /usr/local/bin/corepack

WORKDIR /app

COPY --from=builder --chown=nextjs:nodejs /repo/apps/docs/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/docs/.next/static ./apps/docs/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/docs/public ./apps/docs/public
# MDX content loaded at runtime by `lib/content.ts` via fs.readFileSync.
# Next standalone does not auto-copy runtime-read files, so explicit COPY.
# The `/api/raw/[...path]` Markdown-mirror route + the dynamic
# `/developers/[slug]` page both depend on this directory.
COPY --from=builder --chown=nextjs:nodejs /repo/apps/docs/content ./apps/docs/content
# The Ask AI corpus reads the committed OpenAPI spec at runtime. Copy it
# into the image so the route handler can find it without a network hop.
COPY --from=builder --chown=nextjs:nodejs /repo/apps/api/openapi/v1.json ./apps/api/openapi/v1.json
ENV AFFRAME_OPENAPI_PATH=/app/apps/api/openapi/v1.json

USER nextjs:nodejs
EXPOSE 3300

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O- http://127.0.0.1:3300/ >/dev/null || exit 1

CMD ["sh", "-c", "HOSTNAME=0.0.0.0 exec node apps/docs/server.js"]
