# @workspace/brain

Afframe **Brain**: an autonomous, self-improving Czech-accounting ingestion + booking agent.

Brain v1 is an **unprivileged external client** of the accounting API, not a server-side worker. The
operator (Hleb) runs a local Claude Code session that drives a nested sandboxed Agent-SDK session,
which talks to a local stdio MCP bridge, which calls the public REST API (`apps/api`). There is no
in-process Brain server and no direct DB connection. Every write goes through the server-side write
gate, which **HELDs everything at cold start** for human review — see
`docs/brain/README.md` (approvals gate section).

This package (`packages/brain`) holds the read-side pieces that run inside that client: canonical IR,
the confidence engine, the gate, reconciliation, and evals (`src/agent/ confidence/ gate/ ir/
reconcile/ eval/`). Consumed source-first: `import { ... } from "@workspace/brain"`.

## Source of truth

- [`docs/brain/README.md`](../../docs/brain/README.md) — the landing doc (A-Z index)
- [`docs/brain/TECHNICAL.md`](../../docs/brain/TECHNICAL.md) — debug-level technical reference
- [GitHub epic #524](https://github.com/hlebtkachenko/monorepo/issues/524) — delivery status and open work

The safety invariants (constitution) are locked at `packages/brain/.brain/constitution.md`.

## Scripts

`pnpm --filter @workspace/brain build | typecheck | lint | test`
