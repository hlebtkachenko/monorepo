#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "$0")/../../.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

mkdir -p "$work/extracted" "$work/invalid"

"$repo_root/infra/scripts/build-migration-bundle.sh" \
  "$repo_root/packages/db/migrations" "$work/migrations.tar.gz"
tar -xzf "$work/migrations.tar.gz" -C "$work/extracted"

expected_count=$(find "$repo_root/packages/db/migrations" -maxdepth 1 -type f -name '*.sql' | wc -l | tr -d ' ')
test "$(jq 'length' "$work/extracted/manifest.json")" -eq "$expected_count"

while IFS=$'\t' read -r name expected; do
  file="$work/extracted/migrations/$name"
  test -f "$file"
  actual=$(sha256sum "$file" | awk '{print $1}')
  test "$actual" = "$expected"
done < <(jq -r '.[] | [.name, .sum] | @tsv' "$work/extracted/manifest.json")

printf '%s\n' 'SELECT 1;' > "$work/invalid/bad-name.sql"
if "$repo_root/infra/scripts/build-migration-bundle.sh" \
  "$work/invalid" "$work/invalid.tar.gz" >/dev/null 2>&1; then
  echo "invalid migration filename was accepted" >&2
  exit 1
fi

echo "migration bundle test passed"
