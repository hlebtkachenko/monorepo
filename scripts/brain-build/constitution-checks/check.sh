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
# I1/I4/I6/I7/I8/I10 gain checks as their target code lands. Control-2 (untrusted-prior-book) over
# reconcile/bookable.ts: GLEntry never a booking source (the no-prior-agreement-bonus half is a TS
# allowlist test on VERIFY_BONUS in confidence.test.ts, not a grep).
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

# Control-2 (untrusted-prior-book design, 2026-07-01) — the bookable-source whitelist backstop: the
# `BOOKABLE_IR_RECORD_TYPES` declaration in reconcile/bookable.ts lists PRIMARY facts only — a `gl_entry`
# (a prior journal row) / `attachment` (a blob) is NEVER a booking source. Backstop only: the primary
# enforcement is the `BookableRecord` type (DERIVED via Extract, so drift is inexpressible) + bookable.test.ts.
# The sibling "no prior-book agreement bonus" control is a TS allowlist test on VERIFY_BONUS (confidence.test.ts),
# NOT a grep — a name grep is spelling-locked and would false-positive on the legit `bankVsKsSsMatch` verifier.
# c2 <bookable-file> -> prints match, returns 1 if the whitelist grew a non-primary member, else 0.
c2() {
  local v=0 arr
  # Isolate exactly the `export const BOOKABLE_IR_RECORD_TYPES = [ ... ] as const` declaration (anchored so
  # the later `BookableRecordType` / `new Set(...)` mentions don't re-trigger the range).
  arr=$(sed -n '/export const BOOKABLE_IR_RECORD_TYPES = \[/,/\] as const/p' "$1" 2>/dev/null || true)
  if printf '%s' "$arr" | grep -qE '"(gl_entry|attachment)"'; then
    printf '%s\n' "$arr"; echo "  ^ CONTROL-2: gl_entry/attachment in the bookable-source whitelist (GLEntry is never a booking source)"; v=$((v + 1))
  fi
  return $v
}

if [ "${1:-}" = "--selftest" ]; then
  # Every realistic evasion form an advisor named must be surfaced. EVADE-I2-CALL (an aliased call site
  # `wab(...)`) is intentionally NOT required: it cannot exist without its aliased IMPORT, which IS caught.
  REQUIRED="EVADE-I2-IMPORT EVADE-I2-ALIAS EVADE-I2-SETROLE EVADE-I2-SETROLE-QUOTED \
EVADE-I2-SETROLE-TO EVADE-I2-SETROLE-EQ EVADE-I2-SETCONFIG EVADE-I2-SETCONFIG-SPACED \
EVADE-I2-SESSIONAUTH EVADE-I3-SNAKE EVADE-I3-OPTIONAL EVADE-I3-BANG EVADE-I3-ROLE \
EVADE-I3-SHORTHAND EVADE-I3-LITERAL EVADE-I5-DRIZZLE-UPDATE EVADE-I5-DRIZZLE-DELETE \
EVADE-I5-LOWER-UPDATE EVADE-I5-UPPER-DELETE EVADE-C2-BOOKABLE-GL"
  out=$(scan "$FIXTURE" "$FIXTURE" "$FIXTURE"); bad=$?
  c2out=$(c2 "$FIXTURE"); c2bad=$?
  out="$out
$c2out"
  missing=""
  for m in $REQUIRED; do printf '%s' "$out" | grep -q "$m" || missing="$missing $m"; done
  scan "$BRAIN_SRC" "$BRAIN_SRC/tools" "$BRAIN_SRC/tools" >/dev/null; clean=$?
  c2 "$BRAIN_SRC/reconcile/bookable.ts" >/dev/null; c2clean=$?
  if [ -z "$missing" ] && [ "$bad" -ge 3 ] && [ "$c2bad" -ge 1 ] && [ "$clean" -eq 0 ] && [ "$c2clean" -eq 0 ]; then
    echo "SELFTEST PASS: every EVADE-* form surfaced; all 3 invariants + the control-2 check fired on the fixture; real tree clean."
    exit 0
  fi
  echo "SELFTEST FAIL: missing markers =>$missing ; fixture invariants fired=$bad (want >=3); control-2 fired=$c2bad (want >=1); real-tree=$clean (want 0); control-2 real-tree=$c2clean (want 0)."
  exit 1
fi

echo "== constitution-check: I2(packages/brain/src) I3+I5(src/tools) + control-2 =="
scan "$BRAIN_SRC" "$BRAIN_SRC/tools" "$BRAIN_SRC/tools"; v=$?
c2 "$BRAIN_SRC/reconcile/bookable.ts"; v=$((v + $?))
if [ "$v" -eq 0 ]; then echo "clean."; exit 0; fi
echo "FAIL: $v constitution/control invariant(s) violated."
exit 1
