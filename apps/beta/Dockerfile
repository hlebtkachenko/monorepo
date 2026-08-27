# syntax=docker/dockerfile:1.10

ARG NODE_VERSION=24
ARG PNPM_VERSION=11.9.0

# ---------- pruner ----------
# turbo prune emits a minimal subtree: out/json (manifests + lockfile, for a
# stable install layer) and out/full (source of beta + its workspace deps
# only). node_modules is excluded from the build context by .dockerignore,
# so the pruned tree is clean. Keep turbo pinned to the root devDependency.
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-bookworm-slim@sha256:242549cd46785b480c832479a730f4f2a20865d61ea2e404fdb2a5c3d3b73ecf AS pruner
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
COPY . .
RUN TURBO_VERSION="$(node -p "require('./package.json').devDependencies.turbo.replace(/^[~^]/, '')")" \
    && pnpm dlx "turbo@${TURBO_VERSION}" prune beta --docker

# ---------- deps ----------
# Debian-slim (glibc) chosen over alpine to avoid musl-binding compatibility
# issues with native modules (unrs-resolver, etc).
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-bookworm-slim@sha256:242549cd46785b480c832479a730f4f2a20865d61ea2e404fdb2a5c3d3b73ecf AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
COPY --from=pruner /repo/out/json/ ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm fetch --frozen-lockfile && \
    pnpm install --frozen-lockfile --filter=beta... --filter=@workspace/ui...

# ---------- builder ----------
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-bookworm-slim@sha256:242549cd46785b480c832479a730f4f2a20865d61ea2e404fdb2a5c3d3b73ecf AS builder
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
RUN pnpm --filter beta build

# Stage the migration runner as a self-contained /migrate tree. It cannot ride
# along inside the Next.js standalone output: `next build` only traces modules
# reachable from a route, and the entrypoint has to migrate BEFORE the server
# starts.
#
# `apps/beta/node_modules/postgres` is the pnpm symlink for beta's own declared
# dependency, so `cp -RL` copies exactly the version the lockfile pinned — no
# store path and no version string is written into this file. `postgres`
# (porsager) has zero dependencies, so that one directory is a complete install.
# The `{"type":"module"}` manifest makes /migrate an ESM scope of its own,
# independent of whatever the standalone output puts at /app/package.json.
RUN mkdir -p /migrate/node_modules \
    && cp -RL /repo/apps/beta/node_modules/postgres /migrate/node_modules/postgres \
    && cp /repo/apps/beta/db/migrate.mjs /migrate/migrate.mjs \
    && cp -R /repo/apps/beta/db/migrations /migrate/migrations \
    && printf '{"type":"module"}\n' > /migrate/package.json \
    && node --check /migrate/migrate.mjs \
    && cd /migrate && node --input-type=module -e "await import('postgres')"

# Stage the Asistent retention sweep the same way: a self-contained /purge
# tree with its own copy of `postgres`, run as its own ECS scheduled task
# command (infra/cdk/lib/beta-app-stack.ts's RetentionTaskDef), never inside
# the request-serving container. See apps/beta/db/purge-expired-chats.mjs.
RUN mkdir -p /purge/node_modules \
    && cp -RL /repo/apps/beta/node_modules/postgres /purge/node_modules/postgres \
    && cp /repo/apps/beta/db/purge-expired-chats.mjs /purge/purge-expired-chats.mjs \
    && printf '{"type":"module"}\n' > /purge/package.json \
    && node --check /purge/purge-expired-chats.mjs \
    && cd /purge && node --input-type=module -e "await import('postgres')"

# ---------- runner ----------
FROM --platform=$TARGETPLATFORM node:${NODE_VERSION}-bookworm-slim@sha256:242549cd46785b480c832479a730f4f2a20865d61ea2e404fdb2a5c3d3b73ecf AS runner
ARG BUILD_SHA=unknown
ARG BUILD_TIME=unknown
ARG BUILD_VERSION=0.0.0
ARG SOURCE_REPOSITORY_URL=

LABEL org.opencontainers.image.title="monorepo-beta" \
      org.opencontainers.image.source="$SOURCE_REPOSITORY_URL" \
      org.opencontainers.image.revision="$BUILD_SHA" \
      org.opencontainers.image.created="$BUILD_TIME" \
      org.opencontainers.image.version="$BUILD_VERSION" \
      org.opencontainers.image.licenses="UNLICENSED"

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3200 \
    HOSTNAME=0.0.0.0 \
    BUILD_SHA=$BUILD_SHA \
    BUILD_TIME=$BUILD_TIME \
    BUILD_VERSION=$BUILD_VERSION

# apt-get upgrade pulls Debian-Security point releases for base packages,
# patching base-image CVEs at the source instead of allowlisting them.
# Residual no-upstream-fix CVEs live in .github/security/cve-allowlist.txt.
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -s /bin/false nextjs \
    && apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends ca-certificates \
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

COPY --from=builder --chown=nextjs:nodejs /repo/apps/beta/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/beta/.next/static ./apps/beta/.next/static

# Migration runner + the SQL it applies. The entrypoint runs this before the
# server binds; see apps/beta/entrypoint.sh and the task-definition contract in
# infra/cdk/lib/beta-app-stack.ts.
COPY --from=builder --chown=nextjs:nodejs /migrate ./migrate

# Asistent retention sweep, run only by the RetentionTaskDef's own scheduled
# command override — the request-serving CMD below never touches it.
COPY --from=builder --chown=nextjs:nodejs /purge ./purge

COPY --chown=nextjs:nodejs apps/beta/entrypoint.sh /app/entrypoint.sh
RUN chmod 0755 /app/entrypoint.sh

USER nextjs:nodejs
EXPOSE 3200

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3200/healthz',{timeout:2000},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1)).on('timeout',function(){this.destroy();process.exit(1)})" || exit 1

# entrypoint.sh migrates, then execs the standalone server with
# HOSTNAME=0.0.0.0 forced (Fargate overrides the image ENV with the container's
# auto-assigned hostname, and the standalone server would then bind only that
# interface — cloudflared reaching localhost:$PORT gets connection refused).
# The task definition overrides this with `sh -c 'export DATABASE_URL=… && exec
# /app/entrypoint.sh'`; keeping the same script as the image CMD means a local
# `docker run` follows the identical startup path.
CMD ["/app/entrypoint.sh"]
