#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "$0")/../../.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

mkdir -p "$work/bin"

cat > "$work/bin/aws" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$AWS_CALLS"
case "$*" in
  "rds describe-db-instances --region eu-central-1 --output json")
    printf '%s\n' '{"DBInstances":[{"DBInstanceIdentifier":"data-staging-test"}]}'
    ;;
  "sts get-caller-identity --query Account --output text")
    printf '%s\n' '123456789012'
    ;;
  events\ disable-rule*)
    if [ "${AWS_MOCK_DISABLE_FAIL:-false}" = true ]; then exit 1; fi
    ;;
  events\ enable-rule* | rds\ remove-tags-from-resource*)
    ;;
  rds\ describe-db-instances*--db-instance-identifier*)
    count=$(grep -c -- '--db-instance-identifier' "$AWS_CALLS")
    if [ "$count" -lt 3 ]; then printf '%s\n' 'starting'; else printf '%s\n' 'available'; fi
    ;;
  *)
    echo "unexpected aws call: $*" >&2
    exit 1
    ;;
esac
MOCK

cat > "$work/bin/sleep" <<'MOCK'
#!/usr/bin/env bash
exit 0
MOCK

chmod +x "$work/bin/aws" "$work/bin/sleep"
export PATH="$work/bin:$PATH"
export ENV_NAME=staging
export AWS_REGION=eu-central-1
export RDS_MAX_WAIT_SECONDS=120

export AWS_CALLS="$work/success-calls"
bash "$repo_root/infra/scripts/rds-resume.sh" >/dev/null
test "$(grep -c 'remove-tags-from-resource' "$AWS_CALLS")" -eq 1
test "$(grep -c 'events enable-rule' "$AWS_CALLS")" -eq 1

export AWS_CALLS="$work/fallback-calls"
export AWS_MOCK_DISABLE_FAIL=true
bash "$repo_root/infra/scripts/rds-resume.sh" >/dev/null
test "$(grep -c 'remove-tags-from-resource' "$AWS_CALLS")" -eq 3
test "$(grep -c 'events enable-rule' "$AWS_CALLS")" -eq 1

echo "RDS resume tag-removal test passed"
