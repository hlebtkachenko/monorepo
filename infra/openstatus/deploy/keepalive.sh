#!/usr/bin/env bash
# OpenStatus distro keep-alive. Run by Windows Task OpenStatusKeepAlive.
# Holds the WSL2 distro open (sleep infinity) so cloudflared + the stack stay up.
set -u
for i in $(seq 1 90); do docker info >/dev/null 2>&1 && break; sleep 2; done
cd /opt/openstatus
docker compose -f docker-compose.github-packages.yaml up -d || true
exec sleep infinity
