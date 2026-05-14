#!/usr/bin/env bash
# build.sh -- Compile Cerbos policies to a WASM bundle
#
# Usage:
#   bash infra/cerbos/build.sh [--skip-tests]
#
# Must be run from the repo root or the infra/cerbos/ directory.
# The compiled bundle is written to infra/cerbos/policies/bundle.wasm.
# The Cerbos binary must be on PATH (installed in the Docker builder stage).

set -euo pipefail
IFS=$'\n\t'

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Description:
  Compiles Cerbos policies to an embedded WASM bundle. Runs policy test
  suite unless --skip-tests is passed.

Options:
  --skip-tests  Skip the .cerbos-tests assertions (use during local iteration)
  -h, --help    Show this help and exit.
EOF
}

info() { printf '\033[1;34minfo\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarn\033[0m %s\n' "$*" >&2; }
err()  { printf '\033[1;31merr\033[0m  %s\n' "$*" >&2; exit 1; }

SKIP_TESTS=false

main() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --skip-tests) SKIP_TESTS=true; shift;;
      -h|--help) usage; exit 0;;
      *) err "Unknown argument: $1";;
    esac
  done

  # Resolve script directory so this script works from any cwd.
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  POLICIES_DIR="${SCRIPT_DIR}/policies"
  TESTS_DIR="${SCRIPT_DIR}/.cerbos-tests"
  BUNDLE_OUT="${POLICIES_DIR}/bundle.wasm"

  if ! command -v cerbos &>/dev/null; then
    err "cerbos binary not found on PATH. Install via: https://docs.cerbos.dev/cerbos/latest/installation/binary"
  fi

  info "Cerbos version: $(cerbos version 2>/dev/null || echo 'unknown')"
  info "Compiling policies from: ${POLICIES_DIR}"

  if [ "${SKIP_TESTS}" = "true" ]; then
    info "Skipping test assertions (--skip-tests)"
    cerbos compile \
      --output "${BUNDLE_OUT}" \
      "${POLICIES_DIR}"
  else
    info "Running policy tests from: ${TESTS_DIR}"
    cerbos compile \
      --tests "${TESTS_DIR}" \
      --output "${BUNDLE_OUT}" \
      "${POLICIES_DIR}"
  fi

  info "Bundle written to: ${BUNDLE_OUT}"
}

main "$@"
