#!/usr/bin/env bash
#
# Inline test harness for the `capture()` function copied out of
# `.github/workflows/_deploy-aws.yml`. Stubs the `aws` CLI so describe-secret
# returns deterministic ARNs and asserts the suffix-validation logic accepts
# real ARNs while rejecting bare ones. Runs locally and in CI's shellcheck job.
#
# Keep `capture()` here in sync with the version in _deploy-aws.yml.

set -euo pipefail

# Stub: pretend we're AWS Secrets Manager describe-secret. The args we care
# about are at positions 4 (the secret name following `--secret-id`).
aws() {
  if [ "$1" = "secretsmanager" ] && [ "$2" = "describe-secret" ]; then
    case "$4" in
      good) echo "arn:aws:secretsmanager:eu-central-1:111111111111:secret:good-AbCdEf" ;;
      bare) echo "arn:aws:secretsmanager:eu-central-1:111111111111:secret:bare" ;;
      none) echo "None" ;;
      *)    echo "" ;;
    esac
  else
    echo "stub-aws: unexpected args: $*" >&2
    return 2
  fi
}
export -f aws
export AWS_REGION=eu-central-1
GITHUB_OUTPUT=$(mktemp)
export GITHUB_OUTPUT

# ---- copy of capture() from _deploy-aws.yml ----
capture() {
  local out="$1" name="$2"
  local arn
  arn=$(aws secretsmanager describe-secret \
    --secret-id "$name" \
    --region "$AWS_REGION" \
    --query ARN --output text)
  if [ -z "$arn" ] || [ "$arn" = "None" ]; then
    echo "::error::Failed to read ARN of secret $name (describe-secret returned empty)"
    exit 1
  fi
  if ! [[ "$arn" =~ -[A-Za-z0-9]{6}$ ]]; then
    echo "::error::Captured ARN $arn for $name is missing the -XXXXXX suffix. Refusing — would cause IAM/Resource mismatch at task start." >&2
    exit 1
  fi
  echo "$out=$arn" >> "$GITHUB_OUTPUT"
  echo "captured: $out=$arn"
}
# ---- end copy ----

fail=0
expect_pass() {
  local label="$1" out="$2" name="$3"
  if ( capture "$out" "$name" ) >/dev/null 2>&1; then
    echo "PASS  $label"
  else
    echo "FAIL  $label (expected pass)"; fail=1
  fi
}
expect_fail() {
  local label="$1" out="$2" name="$3"
  if ( capture "$out" "$name" ) >/dev/null 2>&1; then
    echo "FAIL  $label (expected reject)"; fail=1
  else
    echo "PASS  $label"
  fi
}

expect_pass "well-formed ARN accepted"            good_arn good
expect_fail "bare ARN rejected (no -XXXXXX)"      bare_arn bare
expect_fail "None response rejected"              none_arn none
expect_fail "empty response rejected"             empty_arn missing

rm -f "$GITHUB_OUTPUT"
exit "$fail"
