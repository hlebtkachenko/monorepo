#!/usr/bin/env bash
#
# Preflight: assert every URL path that the smoke step in _deploy-aws.yml
# probes maps to a real Next.js route.ts in apps/web or apps/admin.
#
# Catches the class of bug where a smoke probe is added for a route that
# was never built — the probe 404s forever and rollback fires every
# deploy. (Exact failure mode that landed in May 2026: /api/auth/me did
# not exist; smoke flagged it; rollback fired on a clean deploy.)
#
# Run by .github/workflows/workflow-lint.yml shellcheck job. Stays in
# pure bash so it never adds a new toolchain.

set -euo pipefail

WORKFLOW="${WORKFLOW:-.github/workflows/_deploy-aws.yml}"
if [ ! -f "$WORKFLOW" ]; then
  echo "::error::$WORKFLOW not found (run from repo root)"
  exit 2
fi

# Extract every `curl ... "$<VAR>_URL/api/..."` reference inside the smoke
# step. We only care about /api/* paths probed via APP_URL or ADMIN_URL.
# The smoke step keeps probes on single lines, so a per-line grep is
# enough — multi-line probes would need a real YAML parser.
#
# `mapfile` is bash 4+; macOS ships bash 3.2, so use a while-read loop to
# stay portable between dev laptops and CI.
# Single-quotes around the grep patterns are intentional — we want
# literal `$APP_URL` / `$ADMIN_URL` to land in grep's regex, not be
# interpolated by this shell.
# shellcheck disable=SC2016
extract_probes() {
  grep -E 'curl .*\$(APP_URL|ADMIN_URL)/api/' "$WORKFLOW" \
    | grep -oE '\$(APP_URL|ADMIN_URL)/api/[A-Za-z0-9_./-]+' \
    | sort -u
}
probes=()
while IFS= read -r line; do
  [ -z "$line" ] && continue
  probes+=("$line")
done < <(extract_probes)

if [ ${#probes[@]} -eq 0 ]; then
  echo "no APP_URL/ADMIN_URL /api/* probes found in $WORKFLOW"
  exit 0
fi

# Map probe → expected source file. Next.js catch-all routes
# (apps/web/app/api/auth/[...all]/route.ts) cover every /api/auth/<x>
# request; for those we look for ANY route.ts under the parent dir.
fail=0
route_exists() {
  local app="$1" path="$2"
  local dir="apps/${app}/app${path}"
  # Direct match
  if [ -f "${dir}/route.ts" ]; then
    return 0
  fi
  # Walk up looking for a Next.js catch-all segment — `[...name]` dirs
  # absorb any deeper path. Square brackets are character-class in shell
  # globs, so use `find -maxdepth 1` to spot the literal `[...]` token.
  local cur="$dir"
  while [ "$cur" != "apps/${app}/app" ] && [ -n "$cur" ]; do
    cur="$(dirname "$cur")"
    if [ -d "$cur" ] && find "$cur" -maxdepth 1 -mindepth 1 -type d -name '[[]...*[]]' \
         -exec test -f '{}/route.ts' ';' -print 2>/dev/null | grep -q .; then
      return 0
    fi
  done
  return 1
}

for probe in "${probes[@]}"; do
  var="${probe%%/*}"        # $APP_URL
  path="/${probe#*/}"       # /api/...
  path="${path#//}"; path="/${path#/}"
  app=""
  case "$var" in
    "\$APP_URL")   app="web" ;;
    "\$ADMIN_URL") app="admin" ;;
    *) echo "::error::unknown var in probe: $probe"; fail=1; continue ;;
  esac
  if route_exists "$app" "$path"; then
    echo "OK   ${app}${path} → route.ts exists"
  else
    echo "::error::smoke probe ${app}${path} has no matching route.ts under apps/${app}/app${path} (or any catch-all parent)" >&2
    fail=1
  fi
done

exit "$fail"
