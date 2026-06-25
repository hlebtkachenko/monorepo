# `scripts/brain-build/` — Build Ground-Truth Gate (BGTG) harness

The objective spine of the Afframe Brain build (plan §11–§13). _Gates made of LLMs are not ground
truth — two advisors can share one hallucination._ Every BGTG check anchors a "Done" to a signal an
LLM cannot talk past (a symbol that resolves or not, a hash that matches or not, a test that passes or
not, a commit that exists or not) and **fails closed**.

Run at every WP close **and** every resume. Each check emits an **exit code, not prose**.

## Placement decision (deviation from plan §0.1, logged)

Plan §0.1 lists the lock/state files under `.context/afframe-brain/brain-build/`. But in _this_ repo
`.context/` is **gitignored** (`.gitignore:53`), which would defeat the whole point of a git-anchored
tamper-evidence lock. So:

- **Tamper-evidence anchors → committed here** (`scripts/brain-build/`): `eval-thresholds.lock`,
  `fixtures.lock`, `expected-symbols.json`. A downward threshold move / changed golden hash / invented
  symbol shows in `git diff`.
- **Ephemeral build state → gitignored** (`.context/afframe-brain/brain-build/`): `budget.json`,
  `heartbeat.json`, `loop-state.json`.

Surfaced for Hleb in `PROGRESS.md ## Decisions` (D-002).

## Checks (plan §11) — status

| #   | Check                                                                                | File                   | Status                                                                     |
| --- | ------------------------------------------------------------------------------------ | ---------------------- | -------------------------------------------------------------------------- |
| 1   | Symbol/signature existence (`expected-symbols.json` resolved vs real Track-A source) | `symbol-check.ts`      | TODO — needs WP-0.0a vendored contract (BLOCKED on Track-A)                |
| 2   | Fixture tamper-evidence (golden hash in `fixtures.lock`)                             | `fixtures-check.ts`    | TODO — needs WP-0.8 fixtures                                               |
| 3   | Threshold tamper-evidence (no downward move in `eval-thresholds.lock`)               | `thresholds-check.ts`  | lock committed; checker TODO                                               |
| 4   | Constitution as executable checks (AST/grep invariants)                              | `constitution-checks/` | **DONE** (WP-0.2) — I2/I3/I5, `--selftest` 19 forms, wired into brain test |
| 5   | PROGRESS↔git reconcile (every Done row names a real SHA; verify re-run)              | `reconcile.ts`         | TODO                                                                       |
| 6   | OFF-PATH tripwires (self-checks + BGTG enforce)                                      | `OFF-PATH.md`          | doc present                                                                |

The TODO checks are **foundation-independent in design** but each needs its target to exist first
(the vendored contract, the package, the constitution, the fixtures). They get built alongside the WP
that produces their target, not before.

## Operable now

- `check-track-a.sh` — objective recheck of whether the accounting domain landed on `origin/main`.
  Exit 0 = blocker cleared (run A0 hard re-eval §1); exit 1 = still blocked. Run this every resume.
- `eval-thresholds.lock` — the canonical §9 thresholds, committed as the tamper anchor.

## HALT-and-ask vs self-correct (plan §11)

- **self-correct** (within the §12 loop cap of 3): compile/type/lint error, single eval-case fail.
- **HALT-and-ask**: invented symbol / signature drift, golden or threshold tamper, constitution-check
  fail, PROGRESS↔git drift, advisor disagreement / failed-twice, re-eval concluding "change architecture".
