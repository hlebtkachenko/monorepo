#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "$0")/../../.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

mkdir -p "$work/bin" "$work/migrations"
printf '%s\n' 'SELECT 1;' > "$work/migrations/0001_test.sql"

cat > "$work/bin/psql" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$PSQL_CALLS"
if [[ "$*" == *"SELECT 1"* ]]; then
  attempts=$(grep -c -- '-c SELECT 1$' "$PSQL_CALLS")
  if [ "$attempts" -lt 3 ]; then
    exit 1
  fi
fi
MOCK

cat > "$work/bin/sleep" <<'MOCK'
#!/usr/bin/env bash
exit 0
MOCK

chmod +x "$work/bin/psql" "$work/bin/sleep"

export PATH="$work/bin:$PATH"
export PSQL_CALLS="$work/psql-calls"
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=test
export DB_ADMIN_USER=test_admin
export DB_ADMIN_PASSWORD=test_password
export APP_USER_PASSWORD=test_app_password
export DB_CONNECT_WAIT_SECONDS=120
export MIGRATIONS_DIR="$work/migrations"

output=$(bash "$repo_root/infra/scripts/apply-migrations-init.sh" 2>&1)
test "$(grep -c -- '-c SELECT 1$' "$PSQL_CALLS")" -eq 3
test "$(grep -c 'database unavailable; retrying' <<< "$output")" -eq 2
grep -q 'init: connected.' <<< "$output"
grep -q 'init: done.' <<< "$output"

if DB_CONNECT_WAIT_SECONDS=invalid \
  bash "$repo_root/infra/scripts/apply-migrations-init.sh" >/dev/null 2>&1; then
  echo "invalid DB_CONNECT_WAIT_SECONDS was accepted" >&2
  exit 1
fi

echo "apply migrations connection wait test passed"
