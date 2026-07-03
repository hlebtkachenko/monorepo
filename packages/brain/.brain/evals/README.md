# `.brain/evals/` — eval cases + metrics

The eval set that gates learning (eval-as-CI). `cases/` holds golden `case.yaml` files (Fixture-0 REM
FROZEN, Fixture-1 SRO-2025-PLATCE-CZK-01, …; authored in WP-0.8, hashed in
`scripts/brain-build/fixtures.lock`). `metrics.jsonl` is append-only, one row per run (green%,
edit-rate, confident-wrong→0, Brier, kappa, tier breakdown). Thresholds are locked in
`scripts/brain-build/eval-thresholds.lock` (never loosened — BGTG #3). A WP touches `cases/**` XOR the
grader, never both unloged. Empty at M0.
