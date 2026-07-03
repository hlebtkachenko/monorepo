# Architecture — `@workspace/brain`

## What it is

Track B of the Afframe Brain: the orchestrator + canonical IR + calibrated confidence + librarian that
turns a messy per-org accounting dump into booked, reviewed, learned-from accounting. It is a **tool
inside Afframe**, not a separate deployment — it writes IN-PROCESS to the existing `@workspace/accounting`
tables via `withOrganization`. There is no external MCP/per-org-API-key write channel (that v2 idea was
dropped; the typed-tool layer survives as an internal function boundary).

## Runtime placement (ADR-0025, drafted in M0)

A **dedicated Brain worker container** calling `packages/workers` `boot()` on a `brain` lane — NOT the
api container. It needs `DATABASE_DIRECT_URL` (port 5432, unpooled): pgBouncer transaction pooling
breaks pg-boss advisory locks (ADR-0017).

## Data ownership

Two **Brain-owned** tables, explicitly NOT part of `packages/accounting`, landing in a Track-B migration
AFTER PR #386 merges (their FK `committed_target_id` references live accounting rows):

- **`brain_run`** — one run over an org's fiscal year: `status` (queued→running→paused→awaiting_review→
  committed/aborted), `stage` (0–8 checkpoint), budget/iteration guards, `heartbeat_at`, `kb_version`,
  `confident_wrong_count`, `sdk_session_id` (Agent-SDK resume).
- **`brain_run_item`** — one staged item: `staged_payload jsonb`, `committed_target_id` (null until
  commit), `decision`, calibrated `confidence numeric(5,2)`, `infra_signals jsonb`, advisor verdict,
  `residual_risk`. `UNIQUE(organization_id, run_id, content_hash)`.

Both carry `organization_id` + FORCE-RLS `organization_isolation` on `current_setting('app.organization_id')`.
`types.ts` mirrors these shapes today (Brain-owned, accounting-free) so the package compiles before the
accounting contract exists; the migration + live wrappers bind later (WP-2.1 / WP-0.6→1.6).

## Two resumabilities (never conflate)

- **BUILD** resumability: `PROGRESS.md` / `HANDOFF.md` + branch HEAD + the BGTG reconcile (`scripts/brain-build/`).
- **RUNTIME** resumability: `brain_run.stage` + `sdk_session_id` + `staged_payload`.

## Confidence (ADR-0026)

Calibrated, not self-reported. The 4-tier infra-signal router hard-caps `C_raw`; `calibration.ts` maps it
against eval history so 0.95 ≈ 95% correct (Brier ≤ 0.04, kappa ≥ 0.80 — both M2+ only). ≥ 0.95 =
green/fast-approve; below → a top-tier Advisor resolves or flags. Everything still goes to the human
master-review gate; the tiers are UX sorting under it, not an auto/skip filter.

## Learning (ADR-0027)

Learning artifacts are git-versioned files under `.brain/` (constitution, rules, aliases, memory, judge,
agents, evals, CHANGELOG). A single "librarian" writer proposes rule changes via a GitHub PR
(`workflow_dispatch`) — never a direct parallel-worktree write. Evals run as CI.
