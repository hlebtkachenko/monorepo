#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# seed-dev.sh -- thin wrapper around `pnpm --filter @workspace/db db:seed`.
#
# Lives in infra/scripts/ so the dev / restore-drill flows can call it the
# same way (no need to remember which package owns the seed). Forwards all
# arguments to the underlying pnpm script.

usage() {
  cat <<EOF
Usage: $(basename "$0") [-- <pnpm seed args>]

Description:
  Wrapper over \`pnpm --filter @workspace/db db:seed\`. Use this from the
  repo root or from any directory; the wrapper always resolves to the
  monorepo root via the script's own location.

Options:
  -h, --help    Show this help and exit.
EOF
}

info() { printf '\033[1;34minfo\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarn\033[0m %s\n' "$*" >&2; }
err()  { printf '\033[1;31merr\033[0m  %s\n' "$*" >&2; exit 1; }

main() {
  if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
    usage; exit 0
  fi

  command -v pnpm >/dev/null 2>&1 || err "pnpm not found on PATH"

  local script_dir
  script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
  local repo_root="${script_dir%/infra/scripts}"

  info "running pnpm --filter @workspace/db db:seed in $repo_root"
  cd "$repo_root"
  pnpm --filter @workspace/db db:seed "$@"
}

main "$@"
