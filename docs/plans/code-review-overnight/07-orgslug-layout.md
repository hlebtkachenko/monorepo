---
phase: 07-orgslug-layout
reviewed: 2026-05-15T00:00:00Z
depth: deep
files_reviewed: 1
files_reviewed_list:
  - apps/web/app/[orgSlug]/layout.tsx
findings:
  blocker: 3
  warning: 6
  info: 4
  total: 13
status: issues_found
---

# Phase 07: Code Review — `apps/web/app/[orgSlug]/layout.tsx`

**Reviewed:** 2026-05-15
**Depth:** deep (cross-file: db schema, tenancy helpers, auth server, sibling workspace layout)
**Files Reviewed:** 1 (with 7 supporting files read for context)
**Status:** issues_found

## Summary

The layout is structurally sound (session check, redirect on unauth, two-step slug -> membership resolve, brittle by-design with no GUC bind here). The comment block correctly documents why the org_id GUC is NOT bound at this layer — that decision is right and the cross-render leak it avoids is a real concern. Membership active flag is checked. `withAdminBypass` is used appropriately for the pre-binding lookup.

However, there are three correctness/security defects that need to be fixed before this ships:

1. **CR-01 — slug is unique per `(workspace_id, slug)`, not globally**: the query has no workspace filter and no `orderBy`. Two workspaces with the same slug make the routing non-deterministic.
2. **CR-02 — `redirect("/auth/login")` discards the intended URL**: a user landing on `/acme/transactions` after session expiry is sent to `/auth/login` with no `?next=` parameter, breaking the same return-to-intended pattern that `proxy.ts` carefully implements.
3. **CR-03 — Onboarding gate is missing entirely**: the layout never checks `workspace.onboarding_completed_at`. A user who has paid (or anyone who guesses an org slug they happen to be a member of) can land directly on `/acme/dashboard` mid-onboarding, bypassing `/onboarding/*`.

Plus several WARNINGs around error path (fail open on DB throw), `LIMIT 1` without `orderBy`, role/workspace fields populated but never returned to the renderer or used for authorization, hardcoded org-role union duplicated from `_enums.ts`, and a missing reserved-slug pre-check.

---

## Blockers

### CR-01: Slug lookup is non-deterministic — uniqueness is `(workspace_id, slug)`, not global

**File:** `apps/web/app/[orgSlug]/layout.tsx:101-110`
**Issue:**
The schema declares slug uniqueness scoped to workspace:
```sql
-- 0003_rls_force.sql:43
CREATE UNIQUE INDEX organization_workspace_slug_unique
  ON organization (workspace_id, slug);
```
The layout's resolver, however, queries:
```ts
await db
  .select({ id: organization.id, workspace_id: organization.workspace_id, legal_name: organization.legal_name })
  .from(organization)
  .where(eq(organization.slug, input.slug))
  .limit(1)
```
There is no workspace filter and no `orderBy`. If two workspaces both have an organization with slug `acme`, Postgres is free to return either row (in practice, plan/btree-walk-dependent). Consequences:

- **Routing instability:** a user who is a member of workspace B's `acme` may land on workspace A's `acme` row, fail the subsequent membership check, and be redirected to `/workspace?error=no-access` — even though their access is legitimate.
- **Cross-workspace ambiguity:** for a user who is a member of BOTH `acme`s (e.g. an accountant employed by two firms that each have an org named "Acme s.r.o."), which one they get is undefined.
- **URL-enumeration signal:** the error path leaks "this slug exists in some workspace I'm not a member of" vs. "this slug doesn't exist anywhere," because the existence-vs-membership branches return the same redirect but the timing differs.

Membership uniqueness is `(organization_id, user_id)` (see `organization_membership.ts:46-49`), so once you have the org row this is fine. The problem is choosing the org row.

**Fix:**
Resolve by membership in a single join keyed on user_id + slug, so the row that comes back is by definition one the user belongs to. This also collapses the two round-trips into one:
```ts
async function resolveMembership(input: { slug: string; userId: string }): Promise<ResolvedMembership | null> {
  return await withAdminBypass(async (db) => {
    const [row] = await db
      .select({
        organizationId: organization.id,
        workspaceId: organization.workspace_id,
        legalName: organization.legal_name,
        role: organization_membership.role,
      })
      .from(organization_membership)
      .innerJoin(organization, eq(organization.id, organization_membership.organization_id))
      .where(
        and(
          eq(organization.slug, input.slug),
          eq(organization_membership.user_id, input.userId),
          eq(organization_membership.active, true),
        ),
      )
      .limit(1)
    return row ?? null
  })
}
```
If you keep the two-step shape (e.g. to differentiate "no such org" vs "not a member" for analytics), then the first step MUST disambiguate: either accept an `activeWorkspaceId` cookie (analogous to `readActiveWorkspaceCookie` in `onboarding/_lib/resume.ts`) and filter on it, or iterate all matching rows and try membership for each. Single-join is simpler.

---

### CR-02: `redirect("/auth/login")` loses the intended URL — breaks the `?next=` round-trip

**File:** `apps/web/app/[orgSlug]/layout.tsx:35-37`
**Issue:**
The sibling edge proxy carefully preserves the original path on the unauth redirect:
```ts
// apps/web/proxy.ts:27-29
const intended = request.nextUrl.pathname + request.nextUrl.search
if (intended !== "/") {
  loginUrl.searchParams.set("next", intended)
}
```
But this layout, which is the durable Node-runtime gate for the same routes, does not. So if a user's session expires while they're on `/acme/transactions`, the edge proxy lets them through (cookie still present), the layout's `getSession` returns null because the row was revoked / expired in DB, and they are redirected to bare `/auth/login` — losing `/acme/transactions`. After login they land on `/workspace`, not the page they came from.

This also diverges from the workspace sibling at `apps/web/app/workspace/layout.tsx:22-24`, which has the same bug. Worth fixing both, but this finding is scoped to the file under review.

**Fix:**
```ts
import { headers } from "next/headers"
// ...
const session = await auth.api.getSession({ headers: await headers() })
if (!session) {
  const h = await headers()
  // Next does not expose request URL in RSC; derive from x-invoke-path / x-pathname
  // headers Next sets on RSC requests, or pass the pathname via Server Action.
  // Simplest: rebuild from orgSlug + segments collected via segment params.
  const intended = `/${encodeURIComponent(orgSlug)}` // child layouts/pages pass deeper paths
  redirect(`/auth/login?next=${encodeURIComponent(intended)}`)
}
```
Note: Next 16 RSC does not give you the full pathname trivially. The pragmatic options are (a) read the `x-pathname` / `next-url` header that Next sets internally, or (b) move the unauth redirect into a small middleware/route-handler that has access to the request URL, or (c) accept that the redirect from this layer goes only to `/${orgSlug}` (still better than the current behavior of dropping path entirely). Pick one and apply it identically to `apps/web/app/workspace/layout.tsx`.

---

### CR-03: No onboarding gate — completed-onboarding is never checked

**File:** `apps/web/app/[orgSlug]/layout.tsx:34-44`
**Issue:**
The layout validates session and org membership but never checks `workspace.onboarding_completed_at`. The whole onboarding wizard lives under `/onboarding/*` and depends on `resolveNextStep()` for the next-step redirect, but nothing in this layout calls it or guards against entering an organization route mid-onboarding.

Two concrete leak paths:
1. **Owner mid-wizard:** an owner who has completed step 4 (workspace + org created with a slug) but not step 5 (plan) is technically a member of the new organization. They can navigate directly to `/${orgSlug}/dashboard` — the layout will let them through. The dashboard is currently a stub (`page.tsx:11-21`), but the precedent matters: every child route under `[orgSlug]` will inherit the gap.
2. **Member of an existing org during their own member-onboarding:** the member wizard (`onboarding/member/*`) sets `app_user.profile_completed_at` and accepts an invite. If the invite materialization creates the membership row before profile completion, the user can skip the wizard by typing the org URL directly.

The chooser page at `apps/web/app/workspace/page.tsx` exposes `onboarding_completed_at` on `WorkspaceRow` but never uses it either — that's another reviewer's problem, but it shows the same gap surfaces twice.

**Fix:**
Add an explicit check in `resolveMembership` (or in the layout after membership resolves) that the user's profile is complete AND the parent workspace's onboarding is complete:
```ts
const [row] = await db
  .select({
    organizationId: organization.id,
    workspaceId: organization.workspace_id,
    legalName: organization.legal_name,
    role: organization_membership.role,
    workspaceOnboardingAt: workspace.onboarding_completed_at,
    userProfileAt: app_user.profile_completed_at,
  })
  .from(organization_membership)
  .innerJoin(organization, eq(organization.id, organization_membership.organization_id))
  .innerJoin(workspace, eq(workspace.id, organization.workspace_id))
  .innerJoin(app_user, eq(app_user.id, organization_membership.user_id))
  .where(...)
  .limit(1)
if (!row) return null
if (!row.workspaceOnboardingAt || !row.userProfileAt) {
  // Caller (the layout) should redirect to the appropriate resume step,
  // not to /workspace?error=no-access. Return a discriminated union or
  // throw a typed sentinel so the layout can pick the right destination.
  return { kind: "needs_onboarding", role: row.role }
}
return { kind: "ok", ... }
```
Then in the layout, on `needs_onboarding`, redirect to `await stepPath(await resolveNextStep(session.user.id))` (see `apps/web/app/onboarding/_lib/resume.ts:39`). This also avoids a second round-trip from the user — they don't see the "no access" toast for an org they actually own but haven't finished setting up.

If onboarding is deliberately scoped to "you can preview the dashboard mid-onboarding," document that decision in the file-level comment. Right now it is undocumented and the chooser page's `onboarding_completed_at` field reads like dead surface area.

---

## Warnings

### WR-01: DB exception fails open — `withAdminBypass` rejection bubbles up and Next renders an error boundary that may NOT redirect to login

**File:** `apps/web/app/[orgSlug]/layout.tsx:38-44`
**Issue:**
`resolveMembership` performs two queries inside a transaction. Any rejection (connection pool exhausted, network blip, RLS misconfig, BYPASSRLS grant missing — see `tenancy.ts:299-302`) will throw out of the `await` and the layout returns 500 to the user. There is no `try/catch` around the resolver, no fallback redirect. Whether that's fail-closed depends on the global error boundary's behavior — but the layout itself does not specify "on DB error, send the user to /auth/login or /workspace."

For a tenant-isolation boundary, "the database is unreachable" must be treated as "deny access." Returning a stack trace or a generic 500 is mostly fine, but if any nested route happens to render in parallel (and Next 16 can render siblings concurrently), a transient failure here could let a child server component start executing before the redirect is decided.

**Fix:**
```ts
let membership: ResolvedMembership | null
try {
  membership = await resolveMembership({ slug: orgSlug, userId: session.user.id })
} catch (err) {
  console.error("[orgSlug layout] membership resolve failed", err)
  redirect("/workspace?error=internal")
}
if (!membership) redirect("/workspace?error=no-access&slug=" + encodeURIComponent(orgSlug))
```
Important detail: `redirect()` in Next.js is implemented via a thrown `NEXT_REDIRECT` error. A naive `try/catch` AROUND the call swallows the redirect. The pattern above only wraps `resolveMembership`, not the `redirect()` call, which is correct.

---

### WR-02: Two-round-trip lookup where one join suffices

**File:** `apps/web/app/[orgSlug]/layout.tsx:100-123`
**Issue:**
The resolver makes two separate `SELECT`s inside one transaction: first the org by slug, then the membership by `(org_id, user_id, active)`. Drizzle has full join support and the `withAdminBypass` transaction is already open. Doubling the round-trips on every single org-scoped page render is wasted latency and additionally introduces the CR-01 non-determinism window between the two queries.

**Fix:** see the join-based fix in CR-01.

---

### WR-03: `workspaceId` and `role` resolved but never consumed

**File:** `apps/web/app/[orgSlug]/layout.tsx:89-94, 125-130`
**Issue:**
`ResolvedMembership` carries `organizationId`, `workspaceId`, `role`. The renderer reads only `legalName`. None of the others are passed to `AccountMenu`, no role-based nav filtering happens (the sidebar shows the Settings link to a `guest` who has no business seeing it), and the values are not put into a context provider for child server components.

This is either dead data on every render (the cost of selecting + materializing the columns is small but real and the type is misleading — it claims the data is used) or the implementation forgot to wire role-aware nav.

**Fix:**
- If role-aware nav is intended: filter the `NavItem`s by `membership.role` (e.g. `guest` -> dashboard + documents only; `agent` -> read-only views; `owner|admin` -> all including Settings). Add a small `canSee(role, section)` helper.
- If role isn't needed at this layer yet: drop `role` and `workspaceId` from `ResolvedMembership`, narrow the return type, and add a TODO referencing where role filtering will live.

Either is acceptable. Carrying unused fields in a public-looking interface that gets passed through `await` boundaries is the worst of both.

---

### WR-04: Org role union is duplicated as a string literal — drift waiting to happen

**File:** `apps/web/app/[orgSlug]/layout.tsx:93`
**Issue:**
```ts
role: "owner" | "admin" | "member" | "agent" | "guest"
```
This is a verbatim copy of `organizationRole` from `packages/db/src/schema/_enums.ts:28-34`. If the SQL enum gains a value (e.g. `viewer`), this string union will not. The check at line 113 (`select({ role: organization_membership.role })`) returns the Drizzle type, which the assignment at line 129 (`role: m.role`) widens through the explicit annotation.

**Fix:**
```ts
import { organizationRole } from "@workspace/db/schema/_enums"
// or expose a type alias from the schema barrel:
type OrgRole = typeof organizationRole.enumValues[number]
interface ResolvedMembership {
  organizationId: string
  workspaceId: string
  legalName: string
  role: OrgRole
}
```

---

### WR-05: No reserved-slug guard — wasted DB round-trip on `/admin`, `/api`, etc.

**File:** `apps/web/app/[orgSlug]/layout.tsx:33`
**Issue:**
The SQL defines `app_is_reserved_org_slug` and uses it as a CHECK constraint on insert (`0003_rls_force.sql:50-71`). But the dynamic `[orgSlug]` catchall still gets invoked when someone visits `/admin` or `/api` (assuming they don't match more specific routes), and the layout will run a full transaction + two queries just to come up empty. Same for slugs that violate the format regex (`^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`, length 2-63).

This is a small DoS amplifier: bots scanning for `/admin`, `/wp-admin`, `/.git` etc. each cost you one transaction + two index scans + a redirect. None of those slugs can ever match.

**Fix:** add a fast path before the resolver:
```ts
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const RESERVED = new Set(["admin","api","app","auth","dashboard","docs","internal","system","workspace"])
if (!SLUG_RE.test(orgSlug) || RESERVED.has(orgSlug) || orgSlug.includes("--")) {
  redirect("/workspace?error=invalid-slug")
}
```
Mirror the SQL exactly so behavior is consistent. Keep the SQL CHECK — defense in depth.

---

### WR-06: `error=no-access&slug=` query string echoes user input back as a flash signal

**File:** `apps/web/app/[orgSlug]/layout.tsx:43`
**Issue:**
```ts
redirect("/workspace?error=no-access&slug=" + encodeURIComponent(orgSlug))
```
The slug is URL-encoded, which neutralizes the obvious injection vectors. The remaining concern is that `/workspace` (`apps/web/app/workspace/page.tsx`) does not show evidence that it filters or escapes the `slug` query param before rendering — I did not see it used at all in the chooser page, so this is currently a dangling query string. If a future change starts rendering `searchParams.slug` into the DOM without escaping, the encoded slug round-trips back as user content and becomes a reflected-XSS sink.

This is not currently exploitable. It's a footgun for the next person.

**Fix:**
Either drop the `slug` query param (the error toast doesn't need to repeat the slug — the user typed it), or document at the chooser page that `searchParams.slug` is untrusted and must be rendered via JSX (not `dangerouslySetInnerHTML`) only.

---

## Info

### IN-01: String concat for query construction is bug-bait

**File:** `apps/web/app/[orgSlug]/layout.tsx:43`
**Fix:** use `URL` or `URLSearchParams`:
```ts
const url = new URL("/workspace", "http://_") // base is required, ignored on relative redirect
url.searchParams.set("error", "no-access")
url.searchParams.set("slug", orgSlug)
redirect(url.pathname + "?" + url.searchParams.toString())
```
Or just `redirect(\`/workspace?error=no-access&slug=${encodeURIComponent(orgSlug)}\`)` — same thing but template-literal makes intent clearer.

### IN-02: `await await params` style is fine but verbose; consider one destructure

**File:** `apps/web/app/[orgSlug]/layout.tsx:33`
**Issue:** stylistic. Next 16 `params: Promise<...>` is correct. Fine as written.

### IN-03: `redundant `await` on `return`

**File:** `apps/web/app/[orgSlug]/layout.tsx:100`
**Issue:**
```ts
return await withAdminBypass(async (db) => { ... })
```
The `await` is unnecessary — returning the promise directly is one less microtask hop and doesn't lose stack trace under `--enable-source-maps`. Project-wide stylistic call; mostly harmless. If the codebase elsewhere prefers `return await` for stack traces on async errors, keep it.
**Fix (optional):** `return withAdminBypass(async (db) => { ... })`

### IN-04: Comment block at file head is excellent — keep this pattern

**File:** `apps/web/app/[orgSlug]/layout.tsx:12-25`
**Issue:** none. The comment explicitly calls out why the GUC is NOT bound here (RSC renders are independent transactions, binding here would leak across siblings). That is exactly the kind of "why" doc that prevents a future reviewer from "fixing" it. Worth replicating to `withOrganization` callsites in actions/handlers.

---

## Notes for the integrator

- The three blockers (CR-01, CR-02, CR-03) are independent. CR-01 + CR-03 collapse nicely into one join-based resolver — fix them together. CR-02 is a separate edit at the top of the layout.
- The sibling `apps/web/app/workspace/layout.tsx` has the same `redirect("/auth/login")` losing-intended-url bug as CR-02 and is out of scope for this review but should be queued.
- The decision to NOT set `app.organization_id` GUC in the layout is correct and well-documented. Do not undo this. Every handler/action under `[orgSlug]` must continue to call `withOrganization(orgId, userId, ...)`.

---

_Reviewed: 2026-05-15_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
