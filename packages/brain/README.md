# @workspace/brain

> **⚠️ Partly stale — read [`docs/AFFRAME-BRAIN.md`](../../docs/AFFRAME-BRAIN.md) first.** This file
> describes the pre-reframe **in-process orchestrator** design. Brain v1 shipped as an **unprivileged
> Claude Code CLIENT** of the accounting API (a local stdio MCP bridge → the public REST API, no Brain
> server; ADR-0025 amended 2026-07-01). The `orchestrator/` `runtime/` `librarian/` layout below is partly
> aspirational (the librarian is not built). Authoritative: [`docs/AFFRAME-BRAIN.md`](../../docs/AFFRAME-BRAIN.md)
> + [`docs/AFFRAME-BRAIN-TECHNICAL.md`](../../docs/AFFRAME-BRAIN-TECHNICAL.md).

Afframe **Brain** (Track B): an autonomous, self-improving Czech-accounting ingestion + booking
orchestrator. It parses a company's messy per-org 2025 dump, books it into the existing
`@workspace/accounting` tables (agent-native, no write templates), scores every line with a
**calibrated** confidence, routes everything to a final human review (the master gate), and learns
run-over-run — without ever raising the _confident-wrong_ rate.

Consumed **source-first** (no build step required by consumers): `import { ... } from "@workspace/brain"`.

## Layout (filled in across M0–M2)

```
src/
  types.ts        # BrainRun, BrainRunItem, ConfidenceSignal, AdvisorVerdict + lifecycle enums  [WP-0.1 ✓]
  index.ts        # public surface
  ir/             # canonical IR + provenance envelope (read-side only)                          [WP-0.5]
  confidence/     # 4-tier infra-signal router, score composition, calibration.ts               [WP-0.7]
  parsers/        # deterministic per-format parsers (Money S3 XML + Fio first)                  [WP-1.2]
  orchestrator/   # deterministic stage machine, Agent-SDK fan-out, HITL hooks, resume           [WP-1.4]
  runtime/        # BrainRunContext, runBrain, heartbeat + budget guards                         [WP-1.5]
  tools/write/    # typed wrappers — ONE @workspace/accounting call each, inside withOrganization [WP-0.6/1.6]
  tools/read/     # typed query fns over the 5 books views (security_invoker)                    [WP-1.6]
  librarian/      # correction clustering → distilled rule → GitHub-PR dispatch                  [WP-1.11]
```

## Scripts

`pnpm --filter @workspace/brain build | typecheck | lint | test`

## Reference

Build spec + governance: `.context/afframe-brain/AFFRAME-BRAIN-EXECUTOR-BRIEF.md` and the approved
build plan. Safety invariants are enforced as executable checks (the constitution; WP-0.2) and the
Build Ground-Truth Gate (`scripts/brain-build/`). See `CLAUDE.md` + `ARCHITECTURE.md`.
