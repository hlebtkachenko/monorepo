# Review 01: packages/db/src/tenancy.ts

Reviewer stance: adversarial. Assume bugs exist. The helpers are the only barrier
between tenants in a multi-tenant DB; soft-pedaling defects here would be
malpractice.

Related files read for context (issues here are reported on `tenancy.ts`):
- `packages/db/src/client.ts`
- `packages/db/src/policies/rls.ts`
- `packages/db/src/index.ts`
- Callers of `withAdminBypass`: `apps/web/app/onboarding/actions.ts`,
  `apps/web/app/onboarding/_lib/resume.ts`, `apps/web/app/onboarding/(owner)/done/page.tsx`,
  `apps/web/app/onboarding/member/actions.ts`, `apps/web/app/[orgSlug]/layout.tsx`,
  `apps/web/app/workspace/page.tsx`, `apps/web/app/auth/_lib/materialize-invite.ts`,
  `packages/auth/src/invite-issuer.ts`, `packages/auth/scripts/seed-organization.ts`,
  `packages/auth/scripts/delete-user.ts`, `packages/workers/src/lanes/permissions-drain.ts`,
  `packages/workers/src/__tests__/permissions-drain.test.ts`,
  `packages/db/tests/onboarding-flow.test.ts`

## Critical (SECURITY)

- **[packages/db/src/tenancy.ts:179-183, 235-239]** `finally` restore is not
  fault-tolerant. `restorePriorGucs` issues three `tx.execute(...)` calls; any of
  them can fail (savepoint already rolled back, network blip, server restart,
  context cancellation). If the first succeeds and the second throws, the
  remaining GUCs are NOT restored and the OUTER transaction continues with mixed
  GUC state (e.g., new `app.organization_id` restored, but stale `app.user_id`
  leaks into the next operation in the outer scope). Because savepoints do NOT
  undo `set_config`, the leak is real, not theoretical — the file's own header
  comment calls this out at lines 22-25.
  Fix: wrap each restore in its own try/catch, accumulate failures, and after all
  three calls have been attempted, throw an `AggregateError` (or re-throw the
  primary one) AFTER calling `outerTx.rollback()` / aborting the outer txn so the
  connection cannot be reused with stale GUCs. Alternative: on any restore
  failure, force `tx.execute(sql\`ROLLBACK\`)` to abort the entire outer
  transaction.

- **[packages/db/src/tenancy.ts:315-323]** `withAdminBypass` `finally` block has
  the same defect for elevated role restoration. `SET LOCAL ROLE app_admin`
  succeeds, `fn` returns, then `SET LOCAL ROLE <priorRole>` throws — the OUTER
  transaction keeps the `app_admin` role for every subsequent statement, which
  is a `BYPASSRLS` role. Every subsequent statement in the outer scope now reads
  across tenants. This is the worst-case escape-hatch failure mode in the file.
  Fix: on restore failure, abort the outer transaction (`tx.execute(sql\`ROLLBACK\`)`)
  before re-throwing. Also: combine the restore with the GUC restore problem
  above — both need to fail closed by aborting the txn rather than letting the
  caller see a successful return.

- **[packages/db/src/tenancy.ts:136-185]** `withOrganization` only clears
  `app.user_id` in the composed case via the `finally` snapshot/restore; it does
  NOT explicitly clear or overwrite `app.user_id` when called with `userId=null`
  inside the try block. Concretely: if an outer scope set `app.user_id = U`, and
  a caller invokes `withOrganization(orgId, null, fn, outerTx)`, the body `fn`
  executes with the outer `U` still bound. Audit triggers and any policy that
  consults `current_setting('app.user_id', true)` will attribute writes to the
  wrong user. The header comment for `withWorkspace` explicitly calls out the
  symmetric concern for `app.organization_id` (lines 26-27) and clears it on
  line 229-231 — `withOrganization` lacks the parallel clear of `app.user_id`.
  Fix: when `userId` is null, explicitly clear with
  `SELECT set_config('app.user_id', '', true)` inside the try block (mirroring
  the workspace-tier clear of organization_id at 229-231). The existing snapshot
  in `prior` will still restore on exit.

- **[packages/db/src/tenancy.ts:172-176]** `withOrganization` only sets
  `app.workspace_id` when the org row has a non-null `workspace_id`. If
  `workspaceId` is null/empty (schema constraint regression or partial seed),
  the prior outer-scope `app.workspace_id` is preserved unchanged. In a composed
  call, that means the inner org-bound scope runs against the OUTER workspace's
  GUC — a workspace-tier RLS policy will silently scope to the wrong workspace.
  Fix: always set `app.workspace_id` explicitly. If `wsRows[0].workspace_id` is
  null/empty, set it to `''` so the `NULLIF(...,'')::uuid` guard yields NULL and
  policies match nothing rather than inheriting the outer value. Defense in
  depth even though the schema currently has organization.workspace_id NOT NULL.

- **[packages/db/src/tenancy.ts:281-325]** `withAdminBypass` is called from
  21+ non-test callsites across `apps/web` and `packages/auth`. Several call
  sites are doing things that look like ordinary user-scoped reads/writes
  outside a yet-bound organization context (`apps/web/app/workspace/page.tsx`
  `listWorkspacesForUser`, `apps/web/app/[orgSlug]/layout.tsx`
  `resolveMembershipForSlug`, `apps/web/app/onboarding/_lib/resume.ts`). Each
  of these UPDATE/SELECT statements runs under `BYPASSRLS` — if the WHERE clause
  is even slightly wrong, you read or write across tenants with zero RLS
  protection. The helper's docstring lists three narrow "callers are narrow by
  design" cases (org-switcher, invite-consume, admin console mutations); reality
  is much wider. This is a process / governance issue but it shows in tenancy.ts
  as a too-permissive escape hatch with no enforcement.
  Fix: at minimum, gate `withAdminBypass` with an explicit reason string
  argument (`withAdminBypass(reason, fn, outerTx?)`) and log every invocation
  with caller location + reason for audit. Optionally maintain an allowlist
  of caller files in an ESLint rule mirroring `require-with-organization`.

## High (QUALITY)

- **[packages/db/src/tenancy.ts:104-111]** `restorePriorGucs` restores
  `app.user_id` and `app.workspace_id` regardless of whether they were modified
  inside the wrapper. For `withOrganization` with `userId=null`, the body never
  sets `app.user_id`, but the finally still runs the restore. This works
  because we restore to the snapshotted value, but it wastes a roundtrip and
  obscures intent. More importantly: restoring an unrelated GUC means the
  restore is a "blanket reset" rather than a precise undo. If a future caller
  legitimately mutates a GUC mid-callback, this would clobber it. Document this
  invariant or scope restores to GUCs the wrapper actually wrote.
  Fix: pass an explicit `gucsTouched: Array<'app.organization_id' | 'app.user_id'
  | 'app.workspace_id'>` set into `restorePriorGucs` and only reset those.

- **[packages/db/src/tenancy.ts:87-93, 163-165, 291-294, 308-312]** Repeated
  `(result as unknown as Array<...>)` casts because `drizzle-orm/postgres-js`'s
  `tx.execute<T>()` returns a `Result` type rather than `T[]`. This makes the
  type system useless at the boundary — if the row shape changes, TypeScript
  will not flag it. There are four near-identical patterns in this file.
  Fix: extract a typed helper `async function executeRow<T>(tx, query): Promise<T | null>`
  that performs the cast once and is checked in one place. Use it for `readGuc`,
  the workspace_id lookup, the `pg_has_role` probe, and the `current_user`
  probe.

- **[packages/db/src/tenancy.ts:319-322]** `assertSafeRoleName` then
  `sql.raw(priorRole)`. The regex `/^[a-z_][a-z0-9_]*$/i` is fine for safety,
  but `sql.raw` is the kind of construct a future contributor might copy and
  use without the regex. Add a comment explaining why `sql.raw` is unavoidable
  here (Postgres `SET ROLE` requires an unquoted identifier, parameter binding
  is rejected) and that the regex is load-bearing. Better: use
  `sql.identifier(priorRole)` if Drizzle supports it for this context; that
  produces a double-quoted identifier, which is safer than raw.

- **[packages/db/src/tenancy.ts:142-144, 209-211, 285-287]** `outerTx ?? db` then
  `runner.transaction(...)`. When `outerTx` is provided, this opens a SAVEPOINT;
  when not, a top-level transaction. The branch behavior is fine, but the
  `composed = outerTx !== undefined` flag is then used to drive the GUC
  snapshot/restore logic. If a caller passes `outerTx` that is itself NOT in a
  transaction (e.g., a stale handle), Drizzle's behavior is undefined. There is
  no runtime check that `outerTx` is actually live.
  Fix: document that `outerTx` must be an active transaction handle, and
  optionally validate by issuing a `SELECT 1` probe before the snapshot. Not
  strictly required if callers are well-behaved.

- **[packages/db/src/tenancy.ts:88-90, 163-165]** The `<{ value: string | null }>`
  generic on `tx.execute<T>` is documentation-only — Drizzle does not enforce
  it. The actual runtime shape comes from `(result as unknown as Array<...>)`.
  If the SQL is changed (e.g., column alias renamed), the cast silently
  produces a row with the wrong shape. Confirmed by the awkward
  `as unknown as Array<...>` double-cast.
  Fix: use a runtime validator (zod, valibot, or hand-rolled) for the
  three execute() results. This is a security-adjacent code path; the
  type system carrying no weight is a real liability.

- **[packages/db/src/tenancy.ts:281-325]** No timeout / cancellation handling.
  `withAdminBypass` opens a transaction with elevated privileges and awaits
  `fn`. If `fn` hangs (slow upstream service, deadlock), the connection holds
  `app_admin` indefinitely. Add a wall-clock timeout via `AbortSignal` and
  abort the txn on timeout.
  Fix: accept an optional `AbortSignal`; on abort, issue `ROLLBACK` and reject.
  Less invasive: wrap the `fn` call in `Promise.race([fn(...), timeout])` with
  a sensible upper bound (e.g., 30s) and ROLLBACK on timeout.

- **[packages/db/src/client.ts:51-64]** The `sqlClient` Proxy returns a Function
  shell as the target so `apply` can fire. Reflect.get on every property access
  reconstructs the underlying client per-call. For a hot path (every query
  takes this branch) it is wasted work. More importantly, the `Db` and
  `sqlClient` proxies make it harder to reason about lifecycle in tests.
  Not strictly a tenancy bug, but it shapes how callers reason about the
  identity of `db` — and `tenancy.ts` imports `db` from this Proxy. Defer.

## Medium (SIMPLIFY)

- **[packages/db/src/tenancy.ts:51-55]** `organizationBrand` and
  `workspaceBrand` use `Symbol(...)` (unique per realm), while `adminBypassBrand`
  uses `Symbol.for(...)` (cross-realm). The asymmetry is unexplained. If
  cross-realm branding matters (multiple module copies, vitest isolation), all
  three should use `Symbol.for`; if it doesn't, all three should use `Symbol`.
  Fix: pick one. Comment explains why.

- **[packages/db/src/tenancy.ts:144-184, 211-240, 287-324]** The three helpers
  have substantial structural duplication (open txn, snapshot prior GUCs in
  composed mode, set new GUCs in try, restore in finally). Refactoring to a
  single helper `withGucScope(setup, fn, outerTx)` would collapse the
  duplication. Caveat: each helper has subtle differences (workspace-id
  derivation in withOrganization, organization-id clear in withWorkspace, role
  switch in withAdminBypass) — the abstraction must be careful not to leak
  these into a config bag and lose readability. If the abstraction makes the
  code longer or less clear, leave it; CLAUDE.md says "three similar lines >
  one helper used once."
  Recommendation: skip unless the team is comfortable with a small
  internal helper. The duplication here is load-bearing.

- **[packages/db/src/tenancy.ts:78-81]** `AdminBypassBound` is exported as a
  bare-brand type but `OrganizationBoundDb` / `WorkspaceBoundDb` are exported as
  `AnyTx & { ...brand }`. The asymmetry means callers can write functions that
  take `AdminBypassBound` but not the underlying tx — a footgun. Either expose
  `AdminBypassDb` only (drop `AdminBypassBound` from the public surface in
  `index.ts:23`) or also expose `OrganizationBound` / `WorkspaceBound` for
  symmetry.
  Fix: drop `AdminBypassBound` from `packages/db/src/index.ts` if it has no
  consumers. Confirmed: no consumer imports it by name.

- **[packages/db/src/tenancy.ts:307-313]** `priorRole` capture is a triple-nested
  expression with two casts. Awful to read.
  Fix: extract a `readCurrentUser(tx): Promise<string | null>` helper. Mirror of
  `readGuc`.

- **[packages/db/src/tenancy.ts:248-254]** `assertSafeRoleName` throws inside
  `finally`, which clobbers the original error from `fn`. If `fn` throws
  legitimately and the captured `priorRole` is somehow malformed (which it
  shouldn't be — it came from `SELECT current_user`), the original failure is
  hidden behind a confusing "unsafe role name" message.
  Fix: in the finally block, catch the assert error and chain it via
  `error.cause = originalError` before rethrowing, OR rely on the AggregateError
  pattern proposed in the Critical fix above.

## Info

- **[packages/db/src/tenancy.ts:9-11]** Comment references "the last-owner-demotion
  trigger" — fine for context but the testcontainer note is the only actionable
  bit. Consider extracting to a short note in `client.ts` (which already
  documents the probe) and trimming this file's header.

- **[packages/db/src/tenancy.ts:53-55]** `Symbol.for("@workspace/db/adminBypassBrand")`
  string is a key in the global symbol registry. If any other package in the
  monorepo registers the same string, the brand collides silently. This is the
  same liability as any `Symbol.for` use; just be aware.

- **[packages/db/src/tenancy.ts:156]** `if (userId)` — note that this skips
  setting on empty string `""` as well. Empty-string user IDs are not valid
  anyway, but consider `if (userId != null)` for explicitness about intent
  (set only on null/undefined elision).

- **[packages/db/src/tenancy.ts:283-285]** Documentation says `withAdminBypass`
  exists for three narrow use cases. The `Grep` shows 21+ callsites including
  generic page-level loaders. Either expand the documented use cases to match
  reality, or constrain callers (preferred — see Critical finding 5).

- **[packages/db/src/policies/rls.ts:50-56]** `applyOrganizationPolicy` builds
  SQL via string concatenation of `tableName`. Comment says it is for test
  harnesses, but if a future caller passes user-influenced input, this is a
  DDL injection. Lock it down by validating `tableName` against
  `ORGANIZATION_SCOPED_TABLES` before interpolating.

- **[packages/db/src/client.ts:160-163]** `console.warn` in `runStartupProbe`
  catch block — for a multi-tenant safety guard, warning rather than failing
  could let an environment ship without the GUC configured. The trade-off is
  documented (build-time imports must not crash), but consider gating on
  `process.env.NODE_ENV === 'production'` to fail closed in prod and warn in
  dev.

## Summary

- Findings: 5 critical, 7 high, 5 medium, 5 info
- Recommendation: **FIX BEFORE COMMIT** — the two `finally` block defects
  (restore failures leaking cross-scope state, especially the elevated-role
  variant in `withAdminBypass`) are real cross-tenant exposure paths. Even if
  the failure mode is rare in practice, the consequence is severe and the fix
  is small (abort the txn on restore failure). The `app.user_id` clear gap in
  `withOrganization` and the `app.workspace_id` fallback gap are smaller
  blast radius but should ship together. The `withAdminBypass` proliferation
  is process-level but needs at minimum a reason-string argument so callsites
  are auditable. Re-review after fixes.
