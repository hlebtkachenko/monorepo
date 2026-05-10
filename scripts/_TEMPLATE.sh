#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# <script-name> -- <one-line purpose>
#
# Usage:
#   bash scripts/<script-name>.sh [--flag] [arg]

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Description:
  <what this does, in 1-2 lines>

Options:
  -h, --help    Show this help and exit.
EOF
}

info() { printf '\033[1;34minfo\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarn\033[0m %s\n' "$*" >&2; }
err()  { printf '\033[1;31merr\033[0m  %s\n' "$*" >&2; exit 1; }

main() {
  while [ $# -gt 0 ]; do
    case "$1" in
      -h|--help) usage; exit 0;;
      *) shift;;
    esac
  done

  info "ok"
}

main "$@"
