#!/usr/bin/env bash
# Run on the VPS inside the openstatus WSL2 distro, invoked by the
# deploy-statuspage.yml workflow's "Install + recompose" step.
#
# Reads the staging bundle from /tmp/openstatus-deploy/ (placed there by the
# Upload step's Windows -> WSL bridge copy) and installs each artifact into
# /opt/openstatus, then pulls + recreates the stack.
#
# Lives as its own file so the workflow does not have to embed multi-line
# bash inside `ssh "...powershell -Command \"wsl ... bash -lc '<multi-line>'\""`
# — that nested-quote chain has bitten us once (PowerShell parses newlines as
# command separators, terminates the bash heredoc early). Single-file +
# `bash <path>` keeps the SSH argument one line, zero quote dance.

set -euo pipefail

STAGING="${OPENSTATUS_DEPLOY_STAGING:-/tmp/openstatus-deploy}"
TARGET="${OPENSTATUS_DEPLOY_TARGET:-/opt/openstatus}"

if [ ! -d "$STAGING" ]; then
    echo "staging dir not found: $STAGING" >&2
    exit 1
fi
if [ ! -d "$TARGET" ]; then
    echo "target dir not found: $TARGET" >&2
    exit 1
fi

cd "$TARGET"

# Back up the previous env so a botched secret rotation is recoverable
# without re-running CI (operator can mv .env.docker.prev .env.docker by hand).
if [ -f .env.docker ]; then
    install -m 600 .env.docker .env.docker.prev
fi

install -m 600 "$STAGING/.env.docker" .env.docker
install -m 644 "$STAGING/docker-compose.github-packages.yaml" docker-compose.github-packages.yaml
install -m 755 "$STAGING/patch-emails.sh" patch-emails.sh
install -m 755 "$STAGING/keepalive.sh" keepalive.sh
mkdir -p caddy
install -m 644 "$STAGING/caddy/Caddyfile" caddy/Caddyfile

# Wipe the staging copy so the rendered env file does not linger outside
# $TARGET. `find ... -exec shred -u {} +` is idempotent on an empty tree.
find "$STAGING" -type f -exec shred -u {} + 2>/dev/null || true
rm -rf "$STAGING"

docker compose -f docker-compose.github-packages.yaml pull
docker compose -f docker-compose.github-packages.yaml up -d
docker compose -f docker-compose.github-packages.yaml ps
