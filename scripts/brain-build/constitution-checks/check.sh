#!/usr/bin/env bash
# constitution-checks/check.sh — BGTG check #4 (plan §11.4). Executable enforcement of the LOCKED
# constitution: the greppable invariants — I2 (no withAdminBypass in the agent path), I3 (no tenancy
# field in a tool/function INPUT), I5 (no raw UPDATE/DELETE/SQL write, incl. the Drizzle builder, in
# tool code). Hardened after the WP-0.2 advisor gate (false-negative findings: Drizzle .update/.delete,
# lowercase SQL, optional/shorthand/Pick I3 forms). "A test that fails, not a doc an advisor skims."
#
#   check.sh            scan the real Brain tree -> exit 0 clean, 1 violation(s)
#   check.sh --selftest prove the detector surfaces EVERY EVADE-* form in __fixtures__/known-bad.txt
#                       AND the real tree is clean
#
# SCOPE: I2 over all of packages/brain/src. I3 + I5 over src/tools/ — tool/function INPUT types and DB
# writes live there by convention (constitution: inputs under src/tools/; org/user ids on STORED domain
# ROW types like BrainRun are not inputs and are intentionally out of scope, else they false-positive).
# I1/I4/I6/I7/I8/I10 gain checks as their target code lands.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
BRAIN_SRC="$ROOT/packages/brain/src"
FIXTURE="$HERE/__fixtures__/known-bad.txt"

ids="organization_id|user_id|workspace_id|organizationId|userId|workspaceId|role"
# I3: tenancy identifier in DECLARATION position (property / param / destructure / optional `?:` /
# definite-assignment `!:`) or as a quoted type-member literal. Excludes property ACCESS
# (e.g. ctx.organizationId) via the prefix class.
I3RE="(^|[,{([:space:]])(${ids})[[:space:]]*[!?]?[[:space:]]*[:,)}]|[\"'](${ids})[\"']"
# I5: Drizzle write builder (.update(/.delete(/.insert(), a raw UPDATE/DELETE keyword (case-insensitive),
# a sql-tagged template, or a raw .execute(/.query( call.
I5RE='\.(update|delete|insert)[[:space:]]*\(|\b(update|delete)\b|sql`|\.(execute|query)[[:space:]]*\('
# I2: withAdminBypass OR any raw escalation to app_admin (the execution-context bypass its prose names),
# in every Postgres-valid form: SET [LOCAL] ROLE app_admin / ROLE "app_admin" / ROLE TO app_admin /
# ROLE = app_admin / set_config('role','app_admin',...). Case-insensitive.
I2RE="withAdminBypass|SET[[:space:]]+(LOCAL[[:space:]]+)?ROLE([[:space:]]+|[[:space:]]*=[[:space:]]*|[[:space:]]+TO[[:space:]]+)[\"']?app_admin|SET[[:space:]]+SESSION[[:space:]]+AUTHORIZATION[[:space:]]+[\"']?app_admin|set_config[[:space:]]*\\([[:space:]]*[\"']role[\"'][[:space:]]*,[[:space:]]*[\"']app_admin"

# scan <i2-scope> <i3-scope> <i5-scope> -> prints matches, returns count of invariants violated (0..3)
scan() {
  local v=0 hit
  # I2: the withAdminBypass call OR any raw app_admin role escalation (see I2RE).
  hit=$(grep -rniE "$I2RE" "$1" 2>/dev/null || true)
  if [ -n "$hit" ]; then echo "$hit"; echo "  ^ I2: withAdminBypass / raw app_admin role escalation in the agent path"; v=$((v + 1)); fi
  hit=$(grep -rnE "$I3RE" "$2" 2>/dev/null || true)
  if [ -n "$hit" ]; then echo "$hit"; echo "  ^ I3: tenancy field in a tool/function input"; v=$((v + 1)); fi
  hit=$(grep -rniE "$I5RE" "$3" 2>/dev/null || true)
  if [ -n "$hit" ]; then echo "$hit"; echo "  ^ I5: raw/ORM UPDATE/DELETE/SQL write in tool code"; v=$((v + 1)); fi
  return $v
}

if [ "${1:-}" = "--selftest" ]; then
  # Every realistic evasion form an advisor named must be surfaced. EVADE-I2-CALL (an aliased call site
  # `wab(...)`) is intentionally NOT required: it cannot exist without its aliased IMPORT, which IS caught.
  REQUIRED="EVADE-I2-IMPORT EVADE-I2-ALIAS EVADE-I2-SETROLE EVADE-I2-SETROLE-QUOTED \
EVADE-I2-SETROLE-TO EVADE-I2-SETROLE-EQ EVADE-I2-SETCONFIG EVADE-I2-SETCONFIG-SPACED \
EVADE-I2-SESSIONAUTH EVADE-I3-SNAKE EVADE-I3-OPTIONAL EVADE-I3-BANG EVADE-I3-ROLE \
EVADE-I3-SHORTHAND EVADE-I3-LITERAL EVADE-I5-DRIZZLE-UPDATE EVADE-I5-DRIZZLE-DELETE \
EVADE-I5-LOWER-UPDATE EVADE-I5-UPPER-DELETE"
  out=$(scan "$FIXTURE" "$FIXTURE" "$FIXTURE"); bad=$?
  missing=""
  for m in $REQUIRED; do printf '%s' "$out" | grep -q "$m" || missing="$missing $m"; done
  scan "$BRAIN_SRC" "$BRAIN_SRC/tools" "$BRAIN_SRC/tools" >/dev/null; clean=$?
  if [ -z "$missing" ] && [ "$bad" -ge 3 ] && [ "$clean" -eq 0 ]; then
    echo "SELFTEST PASS: every EVADE-* form surfaced; all 3 invariants fired on the fixture; real tree clean."
    exit 0
  fi
  echo "SELFTEST FAIL: missing markers =>$missing ; fixture invariants fired=$bad (want >=3); real-tree=$clean (want 0)."
  exit 1
fi

echo "== constitution-check: I2(packages/brain/src) I3+I5(src/tools) =="
scan "$BRAIN_SRC" "$BRAIN_SRC/tools" "$BRAIN_SRC/tools"; v=$?
if [ "$v" -eq 0 ]; then echo "clean."; exit 0; fi
echo "FAIL: $v constitution invariant(s) violated."
exit 1
