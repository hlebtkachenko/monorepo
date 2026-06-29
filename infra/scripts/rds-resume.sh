#!/usr/bin/env bash
#
# Ensure the env's RDS instance reaches `available`, resilient to cold-start
# latency and the cost-control re-stop Lambdas.
#
# Single source for the RDS-resume logic shared by:
#   - .github/workflows/_deploy-aws.yml  ("Ensure RDS is available" step)
#   - .github/workflows/power.yml        (action=resume)
# Both previously had their own brittle copy: a single `aws rds wait
# db-instance-available` (the AWS CLI waiter is hard-capped at ~30 min) plus a
# fire-once `remove-tags ... || true`. A deeply-cold DB exceeded the 30-min cap
# (v0.7.0 deploy, 2026-06-29), and a single tag-removal loses to the
# RdsRestartWatcher Lambda, which re-stops the DB the moment it reaches
# `available` while still tagged `cost-stop-requested`.
#
# This version polls with a generous deadline, tolerates every transitional
# RDS state, re-issues `start` if the DB falls back to `stopped`, and
# re-asserts the tag removal EVERY iteration so the watcher cannot win the
# eventual-consistency race. If the DB is re-stopped repeatedly it aborts with
# a distinct, actionable error (fingerprints the watcher/autostop case) instead
# of silently spinning to the deadline.
#
# Env:
#   ENV_NAME              required — "staging" | "production"
#   AWS_REGION            required
#   RDS_MAX_WAIT_SECONDS  optional — overall deadline (default 2400 = 40 min)
#
# NOTE (follow-up, needs IAM): the strictly-correct fix for the watcher race is
# to `aws events disable-rule monorepo-${ENV_NAME}-rds-restart-watch` for the
# resume window and re-enable it after. That needs events:Disable/EnableRule on
# the deploy role (bootstrap-managed, not in this repo). Until that grant is
# confirmed, the re-assert-every-iteration loop below is the perm-free defense.
set -euo pipefail

: "${ENV_NAME:?ENV_NAME required}"
: "${AWS_REGION:?AWS_REGION required}"
MAX_WAIT="${RDS_MAX_WAIT_SECONDS:-2400}"
POLL=20
MAX_RESTOPS=3

# Resolve the env's DB id. --output json | jq (NOT --output text with a JMESPath
# `| [0]`): a paginated describe with --output text can append a NextToken line
# and corrupt a shell-captured single value.
SID="$(aws rds describe-db-instances --region "$AWS_REGION" --output json \
  | jq -r --arg p "data-${ENV_NAME}" \
      '[.DBInstances[] | select(.DBInstanceIdentifier | startswith($p)) | .DBInstanceIdentifier] | first // empty')"
if [ -z "$SID" ]; then
  echo "::error::No RDS instance found for env=${ENV_NAME} (prefix data-${ENV_NAME})."
  exit 1
fi

ACCT="$(aws sts get-caller-identity --query Account --output text)"
echo "::add-mask::$ACCT"
DB_ARN="arn:aws:rds:${AWS_REGION}:${ACCT}:db:${SID}"

untag() {
  # Re-assert removal every iteration: the RdsRestartWatcher Lambda re-stops the
  # DB whenever it observes `available` + tag cost-stop-requested=true. Tolerant
  # on purpose — a missing perm or transient API blip must NOT abort the resume
  # (the restop fingerprint below surfaces a genuinely-stuck DB clearly).
  aws rds remove-tags-from-resource --region "$AWS_REGION" \
    --resource-name "$DB_ARN" --tag-keys cost-stop-requested >/dev/null 2>&1 \
    || echo "::warning::remove-tags cost-stop-requested failed (perm/transient) — continuing"
}

echo "Ensuring RDS ${SID} is available (deadline ${MAX_WAIT}s)…"
deadline=$(( $(date +%s) + MAX_WAIT ))
restops=0

while :; do
  untag
  STATUS="$(aws rds describe-db-instances --region "$AWS_REGION" \
    --db-instance-identifier "$SID" \
    --query 'DBInstances[0].DBInstanceStatus' --output text)"
  echo "RDS ${SID} status=${STATUS}"

  case "$STATUS" in
    available)
      echo "RDS ${SID} is available."
      exit 0
      ;;
    stopped)
      restops=$((restops + 1))
      if [ "$restops" -ge "$MAX_RESTOPS" ]; then
        echo "::error::RDS ${SID} returned to 'stopped' ${restops}x — a cost-control Lambda is almost certainly re-stopping it (RdsRestartWatcher / autostop). Disable the 'monorepo-${ENV_NAME}-rds-restart-watch' EventBridge rule for the deploy window, or verify the deploy role holds rds:RemoveTagsFromResource."
        exit 1
      fi
      echo "Starting RDS ${SID} (start attempt ${restops})…"
      aws rds start-db-instance --region "$AWS_REGION" \
        --db-instance-identifier "$SID" >/dev/null 2>&1 \
        || echo "::warning::start-db-instance returned non-zero (may already be starting) — continuing"
      ;;
    starting | configuring-* | modifying | backing-up | maintenance | renaming | upgrading | rebooting | resetting-master-credentials | storage-optimization)
      : # transitional — keep waiting
      ;;
    *)
      echo "::warning::unexpected RDS status '${STATUS}' — continuing to wait"
      ;;
  esac

  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "::error::RDS ${SID} did not reach 'available' within ${MAX_WAIT}s (last status=${STATUS})."
    exit 1
  fi
  sleep "$POLL"
done
