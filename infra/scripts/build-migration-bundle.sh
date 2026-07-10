#!/usr/bin/env bash

# Build one verified archive for the migration Fargate task. Keeping every SQL
# file and its checksum behind one object removes the per-file S3 upload and
# presign loop from the deployment critical path.
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <migration-directory> <output.tar.gz>" >&2
  exit 1
fi

migration_dir=$1
output=$2

if [ ! -d "$migration_dir" ]; then
  echo "Migration directory not found: $migration_dir" >&2
  exit 1
fi

stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/migrations"
manifest="$stage/manifest.json"
echo '[]' > "$manifest"

count=0
while IFS= read -r file; do
  name=$(basename "$file")
  if [[ ! "$name" =~ ^[0-9]{4}_[a-z][a-z0-9_]*\.sql$ ]]; then
    echo "Invalid migration filename: $name" >&2
    exit 1
  fi

  sum=$(sha256sum "$file" | awk '{print $1}')
  cp "$file" "$stage/migrations/$name"
  jq --arg name "$name" --arg sum "$sum" \
    '. + [{name: $name, sum: $sum}]' "$manifest" > "$manifest.next"
  mv "$manifest.next" "$manifest"
  count=$((count + 1))
done < <(find "$migration_dir" -maxdepth 1 -type f -name '*.sql' | sort)

if [ "$count" -eq 0 ]; then
  echo "No migration files found in $migration_dir" >&2
  exit 1
fi

tar -czf "$output" -C "$stage" manifest.json migrations
echo "Built migration bundle with ${count} entries."
