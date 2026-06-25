# Agent Instructions — `@workspace/brain`

The Afframe Brain (Track B). Read `.context/afframe-brain/AFFRAME-BRAIN-EXECUTOR-BRIEF.md` (v2.1) and
the approved build plan before non-trivial work. Track the build in
`.context/afframe-brain/PROGRESS.md`; gate every WP through `scripts/brain-build/` (the BGTG).

## Hard safety invariants (encoded as executable checks in `.brain/constitution.md`, WP-0.2)

- Writes go **in-process** through `@workspace/accounting` inside `withOrganization` only. The org comes
  from `brain_run`, flows down, and is **never an input**. **Never `withAdminBypass` on an agent write.**
- **No `organization_id` / `user_id` / `workspace_id` / `role`** in any exported tool input type.
- **No UPDATE/DELETE document tool; no raw-SQL / text-to-SQL writes** (the whitelisted `brain_run_id`
  stamp is the only exception). The typed-tool layer + verifier + HITL + per-run rollback are the
  PRIMARY safety boundary — the DB protects almost nothing at the document layer.
- Every committed row carries a `brain_run_id` rollback stamp. Staged-before-commit. **Human final
  review is the master gate.** Read-side IR only. BYPASSRLS lives only in `brain-control.yml`.
- **Confident-wrong is the cardinal sin** (`confidence ≥ 0.95` yet wrong). It blocks the next
  autonomous run. Gate confidence on INFRASTRUCTURE signals, never model-verbalized confidence.

## Conventions

- TypeScript 6+, ESM, source-first (`exports["."] → ./src/index.ts`).
- Domain types camelCase in TS; the DB is snake_case. Money is `Money<Currency>` minor units — never
  native `number` for money fields (Brain items reference live rows by id, they don't hold amounts).
- Tests co-located `src/**/*.test.ts` (vitest, node). `pnpm --filter @workspace/brain test`.
- No accounting-domain import until the contract is vendored (WP-0.0a) + bound (WP-0.6); `types.ts`
  stays Brain-owned and accounting-free.
