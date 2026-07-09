# 26. Afframe Brain confidence — infrastructure-gated, calibrated, never model-verbalized

- Status: Accepted
- Date: 2026-06-25 (Accepted 2026-07-08)
- Deciders: Hleb Tkachenko

> Records a decision from the approved Afframe Brain plan (v1.1), embodied in `packages/brain/src/confidence/`
> (WP-0.7). Source of truth: `research/deep/D6-confidence-and-review-model.md`.

## Context and Problem Statement

Every booking the Brain produces is scored, and the score decides routing: a high-confidence booking
can fast-track human approval, a low one is held for review. The **cardinal sin** is a _confident-wrong_
booking — `confidence ≥ 0.95` yet incorrect — because it erodes the human reviewer's trust and, once it
slips through, corrupts the ledger.

The naive source of a confidence number — asking the model "how sure are you?" — is exactly wrong: LLM
self-reported confidence is uncalibrated, sycophantic, and trivially gamed by the same model whose
output it is judging. The score must come from signals the model cannot talk past, and it must be
_calibrated_ (a stated 0.95 must actually be right ~95% of the time).

## Decision

Adopt the **D6 confidence engine**. Confidence is computed from **infrastructure signals**, never the
model's self-report:

1. A 4-tier infra-signal router: Tier-1 + Tier-3 (and `spolek_scope`) hard-block → `0.0`; Tier-2 caps
   the score; Tier-4 imposes no cap.
2. A composite raw score `C_raw = blocked ? 0 : min(C_caps, C_kb + C_verify + 0.15·extractionQuality +
C_recon)` — KB-rule strength + independent verification bonuses + extraction quality + reconciliation.
3. A **PAV isotonic calibration** map fit on `{score, correct?}` pairs from real runs; **cold-start =
   identity map + a raised 0.97 green threshold** until ≥10 runs exist (no data ⇒ no fabricated curve).
4. A **0.95 calibrated green threshold**; **Brier ≤ 0.04** monitored; a green-confident wrong booking is
   counted as confident-wrong and blocks the next autonomous run.

## Consequences

Positive:

- Calibrated and auditable — a 0.95 means a measured ~95%, and every input signal is inspectable.
- Hard to game — the score is grounded in KB/verify/recon/extraction infrastructure, not model rhetoric.
- The cardinal sin is a first-class, machine-checked metric (`confident_wrong == 0`).

Negative / trade-offs:

- Conservative cold-start — with <10 runs the identity map + 0.97 threshold abstains more, slowing early
  autonomy (deliberate: a fabricated early curve would be the real bug).
- The signal taxonomy (tiers, caps, bonuses) must be maintained as the domain widens.

Follow-up work required:

- Calibration re-fit every 10 runs (M3); kappa (Hleb-vs-Advisor) monitor (M2+).
- Locked reference fixtures already pin the formula (`scripts/brain-build/calibration-fixtures.json`).

## Alternatives considered

- **Model-verbalized confidence** — rejected: uncalibrated, gameable, the precise failure mode this ADR
  exists to prevent.
- **A single fixed threshold, no calibration** — rejected: no correction for per-run drift; a stated
  probability would not match reality.
- **Logistic regression on features** — rejected for the calibration map: PAV isotonic is monotone and
  non-parametric, so it does not overfit the small-N early data the way a parametric fit would.

## See also

- [ADR-0025](0025-brain-runtime-placement.md) (runtime), [ADR-0027](0027-brain-learning-artifact-store.md) (learning store)
- `research/deep/D6-confidence-and-review-model.md`; `.brain/constitution.md` (confident-wrong = cardinal sin)
- Code anchor: `packages/brain/src/confidence/` (`signals.ts`, `score.ts`, `calibration.ts`)
