#!/usr/bin/env bash
#
# Materialize INGEST_SECRET into apps/bot/.dev.vars for local bot dev + the
# ask.ts HITL CLI. INGEST_SECRET is the SAME shared bearer as the app's
# NOTIFY_SHARED_SECRET — source of truth is Vault at
# platform/{env}/notify-shared-secret, synced to SSM at
# /monorepo/{env}/notify-shared-secret (see docs/ENVIRONMENT-VARIABLES.md). Defaults to
# reading SSM directly (fast, no VPN); pass --source vault to read Vault
# instead (needs `vault login` first, see docs/runbooks/VAULT-OPS.md).
#
# NEVER prints the secret value. Writes/updates the INGEST_SECRET= line in
# apps/bot/.dev.vars idempotently, preserving every other line, and chmods
# the file 600.
#
# Usage:
#   scripts/bot-dev-vars.sh                          # production, via SSM
#   scripts/bot-dev-vars.sh --env staging             # staging, via SSM
#   scripts/bot-dev-vars.sh --source vault             # production, via Vault
#   scripts/bot-dev-vars.sh --env staging --source vault
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEV_VARS="${ROOT}/apps/bot/.dev.vars"

ENV_NAME="production"
SOURCE="ssm"
REGION="eu-central-1"

usage() {
  cat <<EOF
Usage: $(basename "$0") [--env production|staging] [--source ssm|vault]

Description:
  Fetches the shared INGEST_SECRET / NOTIFY_SHARED_SECRET bearer value and
  writes it into apps/bot/.dev.vars (created if missing, chmod 600). Never
  prints the secret value.

Options:
  --env production|staging   Which env's secret to fetch (default: production
                              — the live bot is a single Cloudflare Worker).
  --source ssm|vault         Where to read from (default: ssm).
                                ssm:   aws ssm get-parameter, region ${REGION},
                                       requires AWS_PROFILE=hleb creds.
                                vault: vault kv get, requires an active
                                       'vault login' session.
  -h, --help                 Show this help and exit.
EOF
}

err() {
  echo "ERR: $*" >&2
  exit 1
}

main() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --env)
        ENV_NAME="${2:?--env requires a value}"
        shift 2
        ;;
      --source)
        SOURCE="${2:?--source requires a value}"
        shift 2
        ;;
      -h | --help)
        usage
        exit 0
        ;;
      *)
        err "unknown argument: $1 (see --help)"
        ;;
    esac
  done

  case "$ENV_NAME" in
    production | staging) ;;
    *) err "--env must be 'production' or 'staging', got: $ENV_NAME" ;;
  esac

  case "$SOURCE" in
    ssm | vault) ;;
    *) err "--source must be 'ssm' or 'vault', got: $SOURCE" ;;
  esac

  local value=""
  if [ "$SOURCE" = "ssm" ]; then
    command -v aws >/dev/null 2>&1 || err "aws CLI not found (needed for --source ssm)"
    value="$(aws ssm get-parameter \
      --name "/monorepo/${ENV_NAME}/notify-shared-secret" \
      --with-decryption \
      --region "$REGION" \
      --query 'Parameter.Value' \
      --output text 2>/dev/null)" || err "failed to fetch /monorepo/${ENV_NAME}/notify-shared-secret from SSM (check AWS_PROFILE=hleb creds and region ${REGION})"
  else
    command -v vault >/dev/null 2>&1 || err "vault CLI not found (needed for --source vault)"
    value="$(vault kv get -field=value "platform/${ENV_NAME}/notify-shared-secret" 2>/dev/null)" \
      || err "failed to fetch platform/${ENV_NAME}/notify-shared-secret from Vault (run 'vault login' first, see docs/runbooks/VAULT-OPS.md)"
  fi

  [ -n "$value" ] || err "fetched an empty value for notify-shared-secret (env: ${ENV_NAME}, source: ${SOURCE})"

  mkdir -p "$(dirname "$DEV_VARS")"
  touch "$DEV_VARS"

  local tmp
  tmp="$(mktemp "${DEV_VARS}.XXXXXX")"
  trap 'rm -f "$tmp"' EXIT

  if grep -q '^INGEST_SECRET=' "$DEV_VARS" 2>/dev/null; then
    INGEST_VAL="$value" awk '
      /^INGEST_SECRET=/ { print "INGEST_SECRET=" ENVIRON["INGEST_VAL"]; next }
      { print }
    ' "$DEV_VARS" >"$tmp"
  else
    cp "$DEV_VARS" "$tmp"
    printf 'INGEST_SECRET=%s\n' "$value" >>"$tmp"
  fi

  mv "$tmp" "$DEV_VARS"
  trap - EXIT
  chmod 600 "$DEV_VARS"

  echo "Wrote INGEST_SECRET to apps/bot/.dev.vars (source: ${SOURCE}, env: ${ENV_NAME})"
}

main "$@"
