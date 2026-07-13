#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "$0")/../../.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

mkdir -p "$work/bin" "$work/bootstrap"

cat > "$work/bin/openfga" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf '%s|%s|%s\n' \
  "${OPENFGA_METRICS_ENABLED:-unset}" \
  "${OPENFGA_HTTP_ADDR:-unset}" \
  "${OPENFGA_GRPC_ADDR:-unset}" > "$OPENFGA_CONFIG_CAPTURE"
trap 'exit 0' TERM INT
while :; do /bin/sleep 1; done
MOCK

cat > "$work/bin/curl" <<'MOCK'
#!/usr/bin/env bash
exit 0
MOCK

cat > "$work/bin/node" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
if [ "${1:-}" = "-e" ]; then
  printf '%s' 'test_password'
else
  printf '%s\n' "$*" >> "$NODE_CALLS"
fi
MOCK

chmod +x "$work/bin/openfga" "$work/bin/curl" "$work/bin/node"

export PATH="$work/bin:$PATH"
export OPENFGA_CONFIG_CAPTURE="$work/openfga-config"
export NODE_CALLS="$work/node-calls"
export OPENFGA_BOOTSTRAP_DIR="$work/bootstrap"
export MONOREPO_ENV=staging
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=test
export DB_ADMIN_USER=test_admin
export DB_ADMIN_PASSWORD=test_password
export AWS_REGION=eu-central-1

output=$(bash "$repo_root/infra/scripts/openfga-bootstrap-init.sh" 2>&1)

test "$(<"$OPENFGA_CONFIG_CAPTURE")" = 'false|127.0.0.1:8180|127.0.0.1:8181'
grep -q 'bootstrap.mjs --env staging' "$NODE_CALLS"
grep -q 'bootstrap: done' <<< "$output"

echo "openfga bootstrap listener isolation test passed"
