#!/usr/bin/env bash
# check-track-a.sh — recheck whether the accounting WRITE CONTRACT the Brain binds to has landed on main.
#
# Reframed 2026-07-01 (ADR-0025 amendment / REFRAME-v1.2 R-2). Brain v1 is an unprivileged MCP/HTTP
# CLIENT: it binds to the accounting API CONTRACT (generated MCP/SDK from the OpenAPI registry), NOT
# internal @workspace/accounting TS symbols. So GATE-A A0 clears when the accounting write endpoints
# listed in expected-endpoints.json exist in origin/main's OpenAPI spec — NOT merely when the package
# file lands (a merged domain with no registered endpoints is not a landing for a client).
#
# Exit 0 = every expected accounting write endpoint IS in origin/main's OpenAPI spec (blocker cleared;
#          run the A0 hard re-eval §1). Exit 1 = not yet, OR the contract list is still empty (#395 pending).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXPECTED="$HERE/expected-endpoints.json"
SPEC_PATH="$(jq -r '.openapi_spec_path' "$EXPECTED")"

git fetch origin --quiet

echo "== Track-A contract landing check (client model) =="

n_expected="$(jq '.operations | length' "$EXPECTED")"
if [ "$n_expected" -eq 0 ]; then
  echo "STATUS: expected-endpoints.json is EMPTY -> the accounting write contract is not defined yet."
  echo "        Reframed GATE-A A0 = the Brain's write endpoints exist in the OpenAPI registry."
  echo "        Populate expected-endpoints.json when #395 registers post/createEvent (pnpm gen:all)."
  gh pr view 395 --json number,title,state,mergedAt,headRefName \
    --jq '"  #\(.number) [\(.state)] \(.headRefName)\(if .mergedAt then " merged="+.mergedAt else "" end) — \(.title)"' 2>/dev/null \
    || echo "  #395 (gh lookup failed)"
  echo "STILL BLOCKED. Build the foundation-independent pre-landing tracks (REFRAME-v1.2 / START-HERE)."
  exit 1
fi

# Fetch the OpenAPI spec as it exists on origin/main.
spec="$(git show "origin/main:$SPEC_PATH" 2>/dev/null || true)"
if [ -z "$spec" ]; then
  echo "STATUS: $SPEC_PATH not found on origin/main -> the API surface hasn't landed. BLOCKED."
  exit 1
fi

missing=0
while IFS= read -r op; do
  if printf '%s' "$spec" | jq -e --arg op "$op" \
    '[.paths[] | to_entries[] | .value.operationId] | index($op) != null' >/dev/null 2>&1; then
    echo "  present: $op"
  else
    echo "  MISSING operation in OpenAPI spec: $op"
    missing=1
  fi
done < <(jq -r '.operations[].operationId' "$EXPECTED")

if [ "$missing" -eq 0 ]; then
  echo "STATUS: all expected accounting write endpoints are in origin/main OpenAPI -> blocker CLEARED."
  echo "NEXT: run the A0 HARD re-eval (§1) — hand the advisor the OpenAPI operation diff (not a summary),"
  echo "      then bind the generated MCP/SDK (WP-0.6 reframed) and unblock M1."
  exit 0
fi

echo "STATUS: some expected accounting write endpoints are NOT yet in origin/main OpenAPI -> BLOCKED."
exit 1
