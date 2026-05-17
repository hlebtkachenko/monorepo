---
phase: 06-materialize-invite
reviewed: 2026-05-15T00:00:00Z
depth: deep
files_reviewed: 1
files_reviewed_list:
  - apps/web/app/auth/_lib/materialize-invite.ts
findings:
  critical: 4
  warning: 6
  info: 4
  total: 14
status: issues_found
---

# Phase 06: Code Review Report — `materialize-invite.ts`

**Reviewed:** 2026-05-15
**Depth:** deep (cross-file: invite-issuer, tenancy, schemas, both callers)
**Files Reviewed:** 1 primary + 6 referenced
**Status:** issues_found

## Summary

`materializeInvite` is the convergence point of the invite redemption flow and runs under `withAdminBypass` — meaning every defense it skips is unfiltered by RLS. The atomic UPDATE-then-diagnose pattern for `auth_invite` is correct in spirit, but the function leaves three legitimate concerns to the caller (email match, role authority, organization authority) while accepting all three as untrusted parameters. The result is that the materializer's safety contract is "trust the caller fully," which is exactly what a cross-tenant escalation surface should not do.

Cross-file findings:
- The `email` parameter is declared but never consumed inside the function — the documented "enforce email match" duty is unenforced.
- The `role` parameter is also never cross-checked against the `auth_invite.role` column the UPDATE just returned (the RETURNING clause omits `role`). A caller bug or call-site tampering directly escalates org role.
- The comment on line 158 ("partial unique index ... WHERE active = true") is factually wrong: `organization_membership` has a FULL `UNIQUE (organization_id, user_id)` constraint (see schema-snapshot.sql:1011 and schema/organization_membership.ts:46-49). The misleading comment may have driven the choice to "no-op if exists" instead of UPSERT/insert-and-catch-23505.
- Error codes are surfaced directly to the client (acceptInviteAction in `apps/web/app/auth/(default)/invite/actions.ts:91` uses `(err as Error).message`) — `invite-issuer.ts:145` deliberately avoids this token-enumeration leak; the materializer reintroduces it.

## Critical Issues

### CR-01: `email` parameter accepted but never enforced — email-match contract lives only in the caller

**File:** `apps/web/app/auth/_lib/materialize-invite.ts:42` (declared) — never referenced in body
**Issue:**
The `MaterializeInviteInput` interface accepts `email` with the docstring "Email recorded on the invite." It is never read inside `materializeInvite`. The session-user vs invite-email match is performed in `acceptInviteAction` (lines 70-75) but is **not** re-checked here under the privileged `withAdminBypass` transaction. A second caller that forgets the pre-check (or any future call path) materializes any invite for any signed-in user. Cross-tenant escalation surface.

`invite-issuer.ts` already returns `email` on the record; the materializer should re-fetch it inside the same transaction and assert `record.email.toLowerCase() === session.user.email.toLowerCase()`. Better: the materializer should accept the session-user identity as input, not the email, and re-derive the email-match from a single source of truth.

**Fix:**
```ts
// Drop input.email entirely. RETURNING the email from the UPDATE and
// pass the BA user id; assert match inside the transaction:
const updated = await db
  .update(auth_invite)
  .set({ status: "accepted", accepted_at: new Date(), accepted_by_user_id: input.userId })
  .where(and(
    eq(auth_invite.token_hash, tokenHash),
    eq(auth_invite.status, "pending"),
    sql`${auth_invite.expires_at} > now()`,
  ))
  .returning({
    id: auth_invite.id,
    organization_id: auth_invite.organization_id,
    workspace_id: auth_invite.workspace_id,
    role: auth_invite.role,
    email: auth_invite.email,
  })

// then compare against a fresh app_user lookup by input.userId, not a
// caller-provided email string.
const [user] = await db.select({ email: app_user.email }).from(app_user)
  .where(eq(app_user.id, input.userId)).limit(1)
if (!user || user.email.toLowerCase() !== updated[0].email.toLowerCase()) {
  throw new InviteAcceptError("invite-not-found")
}
```

### CR-02: `role` parameter trusted — caller controls organization role assignment

**File:** `apps/web/app/auth/_lib/materialize-invite.ts:36` (declared), `:179` (used)
**Issue:**
The function takes `role: "owner" | "admin" | "member" | "agent" | "guest"` as a caller parameter and writes it directly to `organization_membership.role`. The UPDATE's RETURNING clause (lines 81-85) returns `id`, `organization_id`, `workspace_id` — but **not** `role`. The DB-true role from `auth_invite.role` is never read inside this function. Both current callers happen to derive `role` from `readInviteByRawToken`, but the contract is "trust me." Any future caller, any wiring mistake, any client-controlled path = role escalation. The whole point of opaque-token + DB-claims (per the docstring in `tokens/invite.ts:7-18`) is to make role server-derived; trusting a caller-provided role inverts that.

**Fix:**
```ts
.returning({
  id: auth_invite.id,
  organization_id: auth_invite.organization_id,
  workspace_id: auth_invite.workspace_id,
  role: auth_invite.role,
})
// ... later, when inserting org membership:
await db.insert(organization_membership).values({
  organization_id: org.id,
  workspace_id: org.workspace_id,
  user_id: input.userId,
  workspace_membership_id: wsMembershipId,
  role: inviteRow.role as "owner" | "admin" | "member" | "agent" | "guest",
})
```
Drop `role` from `MaterializeInviteInput` after this change. The role is a DB fact, not a caller hint.

### CR-03: Same problem for `organizationId` — caller controls the org being joined

**File:** `apps/web/app/auth/_lib/materialize-invite.ts:34` (declared), `:118` (used)
**Issue:**
`input.organizationId` is used in the `organization` lookup (line 118), and only then cross-checked against `inviteRow.organization_id` at line 121. The defense-in-depth comment on line 122 acknowledges this concern. But the pattern is backwards: trust the DB row (`inviteRow.organization_id`), look up the organization from THAT, and ignore the caller's hint. As written, a malicious caller passing a wrong `organizationId` just gets `invite-not-found`, which is acceptable but unnecessarily fragile — change the diagnostic-vs-real-error logic and you might silently materialize against the wrong org.

**Fix:**
```ts
const [org] = await db
  .select({ id: organization.id, workspace_id: organization.workspace_id, slug: organization.slug })
  .from(organization)
  .where(eq(organization.id, inviteRow.organization_id))  // not input.organizationId
  .limit(1)
if (!org) throw new InviteAcceptError("organization-not-found")
// drop the org.id !== inviteRow.organization_id check; it's now structurally impossible.
```
Drop `organizationId` from `MaterializeInviteInput` after this change.

### CR-04: Token-enumeration leak via distinct error codes returned to the client

**File:** `apps/web/app/auth/_lib/materialize-invite.ts:52-57` (codes) + `apps/web/app/auth/(default)/invite/actions.ts:91`
**Issue:**
`InviteAcceptError.message` is the error code itself (`super(code)` on line 47). The caller `acceptInviteAction` returns this to the client via `error: (err as Error).message`. So a probe with a guessed token hash distinguishes `invite-not-found` from `invite-already-accepted` from `invite-revoked` from `invite-expired`. `invite-issuer.ts:145` explicitly documents the choice to **not** distinguish missing-from-expired in the read path "to avoid token-enumeration leaks" — and then the materializer breaks that invariant.

SHA-256 hex (64 chars) is practically unguessable, so this is not "an attacker enumerates tokens overnight." But it does mean: anyone who has ever held a valid raw token can probe its lifecycle state via the client-visible error, beyond what the documented contract permits. The onboarding caller already uses a stable `errorKey: "acceptInviteFailed"` (member/actions.ts:124) — the invite action should match.

**Fix:**
In `apps/web/app/auth/(default)/invite/actions.ts:87-93`:
```ts
} catch (err) {
  console.error("[auth/invite] acceptInviteAction failed", err)
  // Single opaque error to the client. Server logs carry the discriminating code.
  return { ok: false, error: "Could not accept invitation." }
}
```
Optionally collapse the InviteAcceptError codes to two buckets server-side as well: `usable` vs `not-usable` for the rendered UI, with the discriminator only in logs.

## Warnings

### WR-01: Misleading comment about `organization_membership` unique index

**File:** `apps/web/app/auth/_lib/materialize-invite.ts:158-160`
**Issue:**
The comment states "partial unique index on (organization_id, user_id) WHERE active = true." That is false. `schema/organization_membership.ts:46-49` defines a FULL `UNIQUE (organization_id, user_id)`, and `schema-snapshot.sql:1011` confirms `organization_membership_unique UNIQUE (organization_id, user_id)`. A previously-inactive row will block insertion. The current "select then insert" path covers that — but only by accident, because it filters `active = true` in the select and then a unique violation will still fire if any row exists, active or not. Test: user removed from org (set active=false), then re-invited. The materializer would either crash on a 23505 or — worse, depending on Drizzle's onConflict default — silently no-op. Neither behaviour is documented.

**Fix:**
Either (a) actually make the constraint partial (DROP CONSTRAINT, CREATE UNIQUE INDEX ... WHERE active = true) and update the schema to match, or (b) keep the full unique and switch the logic to:
```ts
const [existing] = await db.select({ id: organization_membership.id, active: organization_membership.active })
  .from(organization_membership)
  .where(and(
    eq(organization_membership.organization_id, org.id),
    eq(organization_membership.user_id, input.userId),
  )).limit(1)

if (existing && existing.active) {
  // already a member — no-op
} else if (existing && !existing.active) {
  await db.update(organization_membership).set({ active: true, role: inviteRow.role, updated_at: new Date() })
    .where(eq(organization_membership.id, existing.id))
} else {
  await db.insert(organization_membership).values({ ... })
}
```
Decide consciously what "re-invite after removal" should do.

### WR-02: Race between SELECT existingWsM and INSERT workspace_membership

**File:** `apps/web/app/auth/_lib/materialize-invite.ts:128-156`
**Issue:**
Two concurrent invite accepts for the same user (e.g. user double-clicks "Accept" or the page is open in two tabs) both pass the auth_invite UPDATE-set check (different tokens), both read `existingWsM = null`, both attempt INSERT. The partial unique `workspace_membership_active_unique (workspace_id, user_id) WHERE active = true` (schema-snapshot.sql:1347) causes one to raise 23505. The function does not catch this; the error bubbles to the caller, who in `acceptInviteAction` returns `err.message` — which on a Postgres unique violation includes constraint name and possibly column values. This combines with CR-04 to leak schema details.

**Fix:**
```ts
try {
  const [inserted] = await db.insert(workspace_membership).values({...}).returning()
  wsMembershipId = inserted!.id
} catch (err) {
  // Concurrent insertion lost the race — re-read.
  if (isUniqueViolation(err)) {
    const [retry] = await db.select({ id: workspace_membership.id })
      .from(workspace_membership)
      .where(and(
        eq(workspace_membership.workspace_id, org.workspace_id),
        eq(workspace_membership.user_id, input.userId),
        eq(workspace_membership.active, true),
      )).limit(1)
    if (!retry) throw err
    wsMembershipId = retry.id
  } else throw err
}
```
Or — simpler — use `ON CONFLICT (workspace_id, user_id) WHERE active DO UPDATE SET updated_at = now() RETURNING id`. Same applies to organization_membership at lines 161-181.

### WR-03: `workspace_id` on org_membership not cross-checked against `inviteRow.workspace_id`

**File:** `apps/web/app/auth/_lib/materialize-invite.ts:147, 176`
**Issue:**
The function uses `org.workspace_id` for both memberships. It does not verify `org.workspace_id === inviteRow.workspace_id`. If those diverge — for any reason the schema allows now or later — the user is granted membership in the org's current workspace, not the workspace the invite was issued against. There is a CHECK trigger (`app_organization_membership_ws_consistent` at schema-snapshot.sql:312) that enforces workspace_membership.workspace_id === organization.workspace_id, but nothing enforces this against the invite row. A misplaced organization (a future "move org to different workspace" migration) would silently misroute invites.

**Fix:**
After resolving `org`, assert:
```ts
if (org.workspace_id !== inviteRow.workspace_id) {
  throw new InviteAcceptError("invite-not-found")
}
```

### WR-04: Generic `Error` thrown for insert-failed path instead of `InviteAcceptError`

**File:** `apps/web/app/auth/_lib/materialize-invite.ts:152-154`
**Issue:**
`throw new Error("Could not create workspace membership.")` is a raw Error, breaks the InviteAcceptError discriminator pattern, and leaks the human string to the client through the acceptInviteAction error-message pass-through. Either define a code (`workspace-membership-failed`) or wrap.

**Fix:**
Use the typed error class consistently, or — better — let the Postgres error propagate and centralize the leak prevention in the caller per CR-04.

### WR-05: `accepted_by_user_id` and `accepted_at` not asserted against `app_user`

**File:** `apps/web/app/auth/_lib/materialize-invite.ts:69-72`
**Issue:**
`accepted_by_user_id: input.userId` is written from caller input with no verification that `input.userId` exists in `app_user` or matches `session.user.id`. The FK on `auth_invite.accepted_by_user_id` (schema/auth_invite.ts:35) catches non-existent users, but a caller could pass any valid `app_user.id` — most importantly, the previously-invited user from a prior session — and the audit row would attribute the accept to the wrong identity. Tie-in with CR-01: the materializer never fetches the user record at all, so it can't even prove the user is the email-match person.

**Fix:**
After fetching `app_user` for email-match (CR-01 fix), the same row supplies the user_id authoritatively. The signature can drop `userId` in favor of a session-bound identity.

### WR-06: `withAdminBypass` justified, but the bypass scope is wider than necessary

**File:** `apps/web/app/auth/_lib/materialize-invite.ts:64`
**Issue:**
The whole 120-line transaction body runs under BYPASSRLS. The auth_invite UPDATE legitimately needs it (no tenancy bound yet). But the post-UPDATE `organization_membership` and `workspace_membership` inserts happen with `app_user_role_name` unset (per tenancy.ts:11) — meaning the last-owner-demotion trigger and other FORCE-RLS-aware checks may behave differently than under a real bound role. The docstring (tenancy.ts:268) lists invite-consume as a sanctioned admin-bypass user; that's fine. The narrower pattern would be: read `auth_invite` + write its `status='accepted'` under `withAdminBypass`, then exit and call `withOrganization(inviteRow.organization_id, userId, ...)` for the membership inserts. The membership inserts then run under the bound tenant role and exercise the same RLS surface they'll be queried through.

This is a hardening recommendation more than a bug, but the function is now the only place in the codebase that creates `organization_membership` with elevated privilege — every other path goes through `withOrganization`.

**Fix:** Split the transaction at the auth_invite UPDATE boundary; let the membership inserts run under `withOrganization`. Note: doing so means the writes are no longer atomic with the invite-status flip across crash boundaries. If atomicity is required, keep the current scope and document it explicitly as the chosen tradeoff.

## Info

### IN-01: `inviteRawToken` field name is inconsistent

**File:** `apps/web/app/auth/_lib/materialize-invite.ts:40`
**Issue:**
The field is `inviteRawToken`, but `invite-issuer.ts` uses `rawToken` and the cookie reader uses `readRawInviteToken`. Pick one. Rename to `rawToken` to match the package surface.

### IN-02: `sha256` reimplemented locally instead of importing `hashInviteToken`

**File:** `apps/web/app/auth/_lib/materialize-invite.ts:62, 187-189`
**Issue:**
The function defines its own `sha256(input)` helper (line 187-189) and calls it at line 62. `packages/auth/src/tokens/invite.ts:36` already exports `hashInviteToken(rawToken)` with the identical implementation. Duplicate cryptographic helpers are a maintainability footgun (one gets upgraded to a stronger hash, the other doesn't, the invite issued-side hash no longer matches the consume-side hash, all invites break silently).

**Fix:**
```ts
import { hashInviteToken } from "@workspace/auth/tokens"
// ...
const tokenHash = hashInviteToken(input.inviteRawToken)
// drop the local sha256 helper.
```

### IN-03: `updated[0]!` non-null assertion is unnecessary

**File:** `apps/web/app/auth/_lib/materialize-invite.ts:109`
**Issue:**
The non-null assertion (`updated[0]!`) is unnecessary because `if (updated.length === 0) { throw ... }` on line 87 already narrows. TypeScript's flow analysis just doesn't see `.length === 0` as narrowing `[0]`. Use a destructure that TypeScript understands:
```ts
const [inviteRow] = updated
if (!inviteRow) {
  // (do the diagnostic SELECT and throw) — moves the existing length-check inline
}
```

### IN-04: 189 lines for membership creation is heavy — most of the bulk is diagnostic branching

**File:** entire file
**Issue:**
The whole "diagnose why the UPDATE didn't match" section (lines 87-108) is 22 lines for what should be either "throw a single error" or "let RETURNING do the work." Combined with the dead `email` param (CR-01) and the `sha256` duplication (IN-02), the function is significantly larger than its core responsibility. After the fixes above, the function should land around 80-100 lines: one UPDATE-with-RETURNING (including email/role), one user/email match check, one workspace_membership upsert, one organization_membership upsert, return slug. The current "fetch organization row to get slug" can be folded into a single CTE or into the UPDATE-with-FROM if your migration policy allows it.

---

## Cross-Cutting Observation

The materializer's design treats itself as a private utility called by trusted server actions, and the security guarantees are spread across:
- `acceptInviteAction` (email-match check, role from DB, org from DB)
- `submitMemberPasswordAction` (claims read from cookie-bound `readInviteByRawToken`, role from DB)
- `materializeInvite` itself (defense-in-depth org check, atomic UPDATE)

The contract works if you read all three files. It breaks the moment someone writes a third caller without reading the first two. The fixes above push every security guarantee into `materializeInvite` itself, so the contract becomes "you give me a raw token and a user id; I produce a slug or I throw." That's the contract this function should always have had.

---

_Reviewed: 2026-05-15_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
