#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# resolve-base.sh -- print the diff base ref for local hooks + preflight
#
# Hardcoding origin/main as the diff base false-positives every size/
# changelog/cache-buster gate on beta/* branches (base main-beta): it
# measures the whole main<->main-beta divergence instead of the branch's
# own diff. This resolves the correct base instead, in order:
#
#   1. PREFLIGHT_BASE env override (explicit, always wins)
#   2. the current branch's open PR base (`gh pr view --json baseRefName`),
#      when a PR exists and gh is authenticated. Bounded by a short
#      timeout (skipped entirely if `timeout` is unavailable) so it never
#      stalls a pre-push hook when offline.
#   3. nearest-base heuristic: whichever of origin/main / origin/main-beta
#      has the smaller `git rev-list --count <merge-base>..HEAD` -- fully
#      offline, only reads refs already fetched locally.
#   4. origin/main fallback.
#
# On a main-based branch this resolves to origin/main (step 3 ties resolve
# to the first candidate, origin/main) -- zero behavior change there.
#
# Usage:
#   base="$(bash scripts/ci/resolve-base.sh)"
#
# Prints only the resolved ref to stdout. All diagnostics go to stderr.

usage() {
  cat <<EOF
Usage: $(basename "$0")

Prints the resolved diff base ref (e.g. origin/main) to stdout.
See PREFLIGHT_BASE env override.
EOF
}

warn() { printf '[resolve-base] %s\n' "$*" >&2; }

resolve_from_pr() {
  command -v gh >/dev/null 2>&1 || return 1

  local pr_base=""
  if command -v timeout >/dev/null 2>&1; then
    pr_base="$(timeout 3 gh pr view --json baseRefName --jq .baseRefName 2>/dev/null || true)"
  else
    warn "'timeout' not available -- skipping gh PR-base lookup (offline-safe fallback)"
    return 1
  fi

  [ -n "${pr_base}" ] || return 1

  local ref="origin/${pr_base}"
  git rev-parse --verify --quiet "${ref}" >/dev/null 2>&1 || return 1

  printf '%s\n' "${ref}"
  return 0
}

resolve_nearest() {
  local best_ref="" best_count="" ref merge_base count

  for ref in origin/main origin/main-beta; do
    git rev-parse --verify --quiet "${ref}" >/dev/null 2>&1 || continue
    merge_base="$(git merge-base HEAD "${ref}" 2>/dev/null || true)"
    [ -n "${merge_base}" ] || continue
    count="$(git rev-list --count "${merge_base}..HEAD")"
    if [ -z "${best_ref}" ] || [ "${count}" -lt "${best_count}" ]; then
      best_ref="${ref}"
      best_count="${count}"
    fi
  done

  [ -n "${best_ref}" ] || return 1
  printf '%s\n' "${best_ref}"
  return 0
}

main() {
  case "${1:-}" in
    -h | --help)
      usage
      exit 0
      ;;
  esac

  if [ -n "${PREFLIGHT_BASE:-}" ]; then
    printf '%s\n' "${PREFLIGHT_BASE}"
    return 0
  fi

  if resolve_from_pr; then
    return 0
  fi

  if resolve_nearest; then
    return 0
  fi

  warn "no candidate ref resolvable -- falling back to origin/main"
  printf 'origin/main\n'
}

main "$@"
