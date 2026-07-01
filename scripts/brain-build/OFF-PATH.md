# OFF-PATH tripwires (plan §11.6)

Agent self-checks; the BGTG also enforces. If **any** of these is observed, **HALT-and-ask** — do not
self-correct, do not "reconcile" silently.

- Built against an accounting operation **not in** `expected-endpoints.json` (a hallucinated endpoint).
- Touched a file **outside** the current WP's declared `where`.
- A golden fixture hash changed (vs `fixtures.lock`) without a matching `[fixture-change]` PROGRESS
  entry carrying a ≥2-advisor sign-off id.
- A threshold in `eval-thresholds.lock` moved in the **loosening** direction.
- The **same error fingerprint** (first-line + file:rule) seen twice.
- A `Done` WP whose `pnpm verify` now **fails**.
- Touched `evals/cases/**` **and** `src/eval/**` in the same WP (editing the grader with the cases).
- A `Done` WP whose landing SHA is absent from `git log afframe-brain`, or whose diff doesn't touch the
  claimed files (PROGRESS↔git drift).
- A §2.3-gated WP whose `gates/<wp>.md` has fewer than two valid structured advisor verdicts.

**Falsifiable DoD rule:** a WP cannot _start_ without a machine-checkable "what proves it works" =
named test + symbol-resolves + metric-number.
