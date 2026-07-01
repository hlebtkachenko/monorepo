# Agent Instructions — `@workspace/brain`

The Afframe Brain (Track B). Read `.context/afframe-brain/AFFRAME-BRAIN-EXECUTOR-BRIEF.md` (v2.1) and
the approved build plan before non-trivial work. Track the build in
`.context/afframe-brain/PROGRESS.md`; gate every WP through `scripts/brain-build/` (the BGTG).

## Hard safety invariants

> **v1 = a Claude Code CLIENT of the system (MCP/HTTP, unprivileged)** — see
> `.context/afframe-brain/REFRAME-v1.2.md` + `START-HERE.md`. The invariants below still hold; their
> ENFORCEMENT point moved from in-process to the **server-side** accounting endpoint. The LOCKED
> `.brain/constitution.md` I1/I5 still describe the old in-process boundary and are **pending
> re-derivation for the HTTP boundary** (WP-N-6, needs a fresh 2× advisor gate).

- Writes go through the accounting **API/MCP endpoint**, which enforces `withOrganization` + the
  confidence gate **server-side**. The Brain client holds **no DB creds**; the org is resolved
  server-side from the API-key principal and is **never a tool input**. **Never `withAdminBypass`.**
- **No `organization_id` / `user_id` / `workspace_id` / `role`** in any tool input schema.
- **No UPDATE/DELETE document tool; no raw-SQL / text-to-SQL writes** (the whitelisted `brain_run_id`
  stamp is the only exception). The typed-tool layer + verifier + HITL + per-run rollback are the
  PRIMARY safety boundary — the DB protects almost nothing at the document layer.
- Every committed row carries a `brain_run_id` rollback stamp. Staged-before-commit. **Human final
  review is the master gate.** Read-side IR only. BYPASSRLS lives only in `brain-control.yml`.
- **Confident-wrong is the cardinal sin** (`confidence ≥ green-threshold` yet wrong). It blocks the next
  autonomous run. Gate confidence on INFRASTRUCTURE signals, never model-verbalized confidence.

## Conventions

- TypeScript 6+, ESM, source-first (`exports["."] → ./src/index.ts`).
- Domain types camelCase in TS; the DB is snake_case. Money is `Money<Currency>` minor units — never
  native `number` for money fields (Brain items reference live rows by id, they don't hold amounts).
- Tests co-located `src/**/*.test.ts` (vitest, node). `pnpm --filter @workspace/brain test`.
- The Brain **never imports `@workspace/accounting`** in v1 — it is an unprivileged MCP/HTTP client. It
  binds to the accounting **API contract** (generated MCP/SDK), not internal types. `types.ts` stays
  Brain-owned and accounting-free.
