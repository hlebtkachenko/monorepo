#!/usr/bin/env bash
# check-track-a.sh — recheck whether the Track-A accounting domain has landed on main.
#
# The Afframe Brain build (plan §1 A0, §11.1) hard-depends on the @workspace/accounting
# surface being on main. Until it is, WP-0.0a / 0.6 / 0.8 stay BLOCKED. This script is the
# objective recheck: it fetches origin and reports whether packages/accounting exists on
# origin/main, plus the open/merged state of the two candidate PRs (#386 v1, #395 v2).
#
# Exit 0 = accounting domain IS on main (blocker cleared, run A0 hard re-eval §1).
# Exit 1 = NOT on main yet (still blocked).
set -euo pipefail

git fetch origin --quiet

echo "== Track-A landing check =="
if git ls-tree -r --name-only origin/main | grep -q '^packages/accounting/src/index.ts$'; then
  echo "STATUS: packages/accounting IS on origin/main -> blocker CLEARED."
  echo "NEXT: run the A0 HARD re-eval (§1): re-run BGTG §11.1 vs merged main, diff merged"
  echo "      @workspace/accounting signatures against expected-symbols.json, hand the advisor"
  echo "      the diff (not a summary), then unblock WP-0.0a -> 0.6 -> 0.8."
  exit 0
fi

echo "STATUS: packages/accounting is NOT on origin/main -> Track-A still BLOCKED."
echo
echo "Candidate PRs (which surface is canonical is an OPEN human decision — see PROGRESS.md ## Decisions):"
for pr in 386 395; do
  gh pr view "$pr" --json number,title,state,mergedAt,headRefName \
    --jq '"  #\(.number) [\(.state)] \(.headRefName)\(if .mergedAt then " merged="+.mergedAt else "" end) — \(.title)"' 2>/dev/null \
    || echo "  #$pr (gh lookup failed)"
done
echo
echo "Until one lands on main, build only the foundation-independent WPs (0.0c/0.1/0.2/0.3/0.4*/0.5/0.7/0.9 + ADRs)."
exit 1
