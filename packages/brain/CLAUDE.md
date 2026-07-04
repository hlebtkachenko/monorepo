# Agent Instructions — `@workspace/brain`

The Afframe Brain (Track B). Read `.context/afframe-brain/AFFRAME-BRAIN-EXECUTOR-BRIEF.md` (v2.1) and
the approved build plan before non-trivial work. Track the build in
`.context/afframe-brain/PROGRESS.md`; gate every WP through `scripts/brain-build/` (the BGTG).

## Hard safety invariants

> **v1 = a Claude Code CLIENT of the system (MCP/HTTP, unprivileged)** — see
> `.context/afframe-brain/REFRAME-v1.2.md` + `START-HERE.md`. The invariants below still hold; their
> ENFORCEMENT point moved from in-process to the **server-side** accounting endpoint. The LOCKED
> `.brain/constitution.md` I1/I5/I4/I10 have **LANDED** their re-derivation to the server-side HTTP
> boundary (advisor-gated): I1 = server-side `withOrganization` from the API-key principal, I5 = the API
> request-schema is PRIMARY + the DB backstop shape (17 mutable / 6 append-only, #445), I4 = the
> `tool_call_log` row + `conversation_id` is the rollback unit (no per-row `brain_run_id` column).

- Writes go through the accounting **API/MCP endpoint**, which enforces `withOrganization` + the
  confidence gate **server-side**. The Brain client holds **no DB creds**; the org is resolved
  server-side from the API-key principal and is **never a tool input**. **Never `withAdminBypass`.**
- **No `organization_id` / `user_id` / `workspace_id` / `role`** in any tool input schema.
- **No UPDATE/DELETE document tool; no raw-SQL / text-to-SQL writes.** The API request-schema +
  server-side gate + verifier + HITL + per-run rollback are the PRIMARY safety boundary — the DB
  protects almost nothing at the document layer.
- The rollback unit is the `tool_call_log` row + its `conversation_id` (no per-row `brain_run_id`
  column exists); postings are never deleted, only corrected via `corrects_posting_id`.
  Staged-before-commit. **Human final review is the master gate.** Read-side IR only. BYPASSRLS lives
  only in `brain-control.yml`.
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
