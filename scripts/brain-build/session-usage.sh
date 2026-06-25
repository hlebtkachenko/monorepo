#!/usr/bin/env bash
# session-usage.sh — read the CURRENT Claude session (5h) + weekly (7d) utilization the way the
# TokenBar app (~/Developer/tokenbar) does: probe api.anthropic.com rate-limit response headers
# using the Claude Code OAuth token from the macOS keychain. The orchestrator has NO built-in tool
# for session %, so this is the objective source for the Brain-build session-limit protocol
# (PROGRESS.md standing rule): at >=90% 5h utilization -> STOP, refresh HANDOFF, wait for reset.
#
# NEVER prints the token (read straight into a var, piped to curl, never echoed).
# Exit 0 = read ok; 3 = no token in keychain; 4 = no rate-limit headers (token expired / blocked).
set -euo pipefail

TOKEN="$(security find-generic-password -s 'Claude Code-credentials' -w 2>/dev/null | jq -r '.claudeAiOauth.accessToken // empty')"
[ -n "$TOKEN" ] || { echo "no-token: could not read Claude OAuth token from keychain 'Claude Code-credentials'"; exit 3; }

HDRS="$(curl -sS -D - -o /dev/null https://api.anthropic.com/v1/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "anthropic-beta: oauth-2025-04-20" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -H "user-agent: brain-build/1.0" \
  --data '{"model":"claude-haiku-4-5-20251001","max_tokens":1,"messages":[{"role":"user","content":"."}]}' 2>/dev/null || true)"

get() { printf '%s' "$HDRS" | grep -i "^$1:" | tr -d '\r' | awk '{print $2}' | tail -1; }
pct() { awk -v v="$1" 'BEGIN{ if(v=="") {print "?"} else if(v<=1){printf "%.0f%%", v*100} else {printf "%.0f%%", v} }'; }

s5=$(get anthropic-ratelimit-unified-5h-utilization)
r5=$(get anthropic-ratelimit-unified-5h-reset)
w7=$(get anthropic-ratelimit-unified-7d-utilization)
r7=$(get anthropic-ratelimit-unified-7d-reset)

[ -n "$s5$w7" ] || { echo "no-headers: no anthropic-ratelimit-unified-* headers (token expired? open TokenBar to refresh)"; exit 4; }

echo "5h SESSION utilization: $(pct "$s5")   (raw=$s5  reset_epoch=${r5:-?})"
echo "7d WEEKLY  utilization: $(pct "$w7")   (raw=$w7  reset_epoch=${r7:-?})"
awk -v v="$s5" 'BEGIN{ n=(v<=1?v*100:v); if(n>=90){print "ACTION: >=90% -> STOP, refresh HANDOFF, wait for 5h reset."} }'
