# Review 05: apps/web/app/onboarding/actions.ts

Reviewer stance: adversarial. Assume bugs exist. Onboarding is the funnel where
new accounts, organizations, workspaces, and team invites are minted; a single
bug here can let an attacker create someone else's account, hijack workspace
ownership, or fan out invites under another user's identity.

Related files read for context (issues are reported on `apps/web/app/onboarding/actions.ts`):
- `apps/web/app/onboarding/_lib/{resume,signup-cookie,state-cookie,active-workspace-cookie}.ts`
- `apps/web/app/onboarding/member/actions.ts`
- `apps/web/app/onboarding/member/_lib/invite-cookie.ts`
- `apps/web/app/auth/_lib/{materialize-invite,issue-invite}.ts`
- `packages/db/src/tenancy.ts`
- `packages/db/src/schema/{workspace,workspace_membership,organization,app_user}.ts`
- `packages/auth/src/server.ts`
- `packages/auth/src/invite-issuer.ts`
- `packages/auth/src/tokens/{signup,active-workspace}.ts`
- `packages/shared/src/auth/{onboarding,password}.ts`
- `packages/db/migrations/0002_auth.sql`, `0003_rls_force.sql`

---

## Critical (SECURITY / DATA)

- **[apps/web/app/onboarding/actions.ts:142-218] `submitPasswordAction` trusts
  the signup JWT as proof of email ownership.** The action reads `claims.email`
  from `readSignupClaims()` and pipes it straight into `auth.api.signUpEmail({
  body: { email: claims.email, ... } })`. The signup token (`packages/auth/src/
  tokens/signup.ts`) is a self-contained HS256 JWT minted by support/admin —
  there is NO double-opt-in verification at any step. Whoever holds the cookie
  (or whoever can fish the link out of an email inbox / log file / referrer
  header / browser history on a shared machine) creates a Better-Auth account
  bound to that email and proceeds straight to onboarding. The token TTL is **14
  days** (`DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 14` in `signup.ts`). The token
  carries `kind`, `email`, `workspace` — there is no token-id, no DB row, no
  single-use guard, no revocation list. Combined with the absence of a JWT
  revocation table this means: (a) anyone who steals the URL from the recipient
  can create the account before the recipient does, (b) the legitimate recipient
  can still re-create it (or be locked out by the "already-exists" branch at
  line 180), and (c) replay of the same token (within 14 days) keeps working
  even after first use because there is no consumption flag.
  Fix: persist signup tokens to a DB row (`auth_signup` analogous to
  `auth_invite`), hash and consume on first use, scope the JWT to a `jti`, and
  reject reuse. Also enforce single-use cookie clearing at the top of
  `submitPasswordAction` BEFORE the BA insert — today the cookie is cleared
  AFTER the insert + profile update, leaving a wide success-only race window.

- **[apps/web/app/onboarding/actions.ts:62-96] `submitProfileAction` and
  `submitExperienceAction` (lines 102-130) accept fully anonymous calls.** When
  `getActiveUserId()` returns null, the actions write to the `app-onboarding-
  state` cookie without checking for a valid signup-token (owner flow) or
  invite-token (member flow) cookie. The check is delegated to step 3, which
  reads `readSignupClaims() || readInviteClaims()`. Two consequences:
  1. **DoS / cookie planting.** An unauthenticated, unauthorized attacker can
     hit the action endpoints from any origin (Server Actions follow the
     `next-action` header CSRF protection only for same-origin POSTs; programmatic
     direct invocation of the action's POST endpoint with a forged `next-action`
     header still works from cURL) and stuff arbitrary `firstName`/`lastName`
     /`phone`/`locale`/`timezone` values into a HttpOnly cookie on the victim's
     browser — wait, the cookie is set on the attacker's session, not the
     victim's, so this is mostly self-DoS. The bigger issue is (2).
  2. **Pre-step-3 step skipping & state desync.** Anyone can write a profile +
     experience cookie WITHOUT a valid signup or invite token, then later visit
     `/onboarding/password` and be blocked at `readSignupClaims()` returning
     null — fine. But the action accepts and persists arbitrary JSON in a
     signed cookie that gets carried for 24h. If the cookie-token signing key
     leaks (or weakens), the attack surface is larger than necessary.
  Fix: refuse to write cookie state unless `readSignupClaims()` (owner) or
  `readInviteClaims()` (member) returns a valid record, OR a session exists.

- **[apps/web/app/onboarding/actions.ts:232-327] `submitWorkspaceAction` has
  no rate-limit and no idempotency key.** A double-click, a network-retry, or a
  malicious script can issue N parallel/serial calls and create N workspaces
  (each with its own organization, owner membership, default org membership).
  Each workspace then becomes the active one via `setActiveWorkspaceCookie`
  (only the last winner). Cleanup of the orphan workspaces requires manual
  intervention. The header comment for step 3 talks about idempotency, but
  step 4 has none.
  Fix: derive an idempotency key from `userId + step + state-cookie-hash` (or
  block creation when the user already owns a workspace whose
  `step_1_completed_at IS NOT NULL`), and short-circuit the second call.

- **[apps/web/app/onboarding/actions.ts:403-476] `submitTeamAction` allows ANY
  authenticated user with a valid session to issue email invites against
  someone else's workspace IF they own ANY workspace.** The flow is:
  1. Get `userId` from session.
  2. Get `workspaceId` from `findOwnerWorkspaceId(userId)` — this returns the
     active-workspace cookie value (verified to be a workspace the user owns)
     OR the first owner workspace ordered by `created_at`.
  3. Query the FIRST organization in that workspace by `created_at`.
  4. Issue invites to that org with `issuedByUserId = userId`.
  The authorization here is "user owns SOME workspace" — fine for onboarding,
  but two concerns:
  (a) The org lookup is `ORDER BY created_at LIMIT 1`. If a user has multiple
      orgs in their workspace (legitimate via future "add org" UI), the wrong
      org receives the invites. There is NO defense against the active-org
      cookie being stale.
  (b) `revokePendingInvites` (line 439) is called BEFORE `issueInvite`. If the
      user owns the workspace but is not authorized to manage invites for that
      org (future RBAC, e.g. workspace-owner but org-member), they still revoke
      every pending invite that someone else issued. Today both roles are
      "owner" by construction, but the action does not assert that, so a future
      role split silently breaks isolation.
  Fix: scope the org lookup to the active-org cookie when present, and add an
  explicit assertion that `userId` has role IN ('owner','admin') on the org
  being mutated. Use `withOrganization(orgId, userId, ...)` so the RLS policy
  is the second line of defense.

- **[apps/web/app/onboarding/actions.ts:302-304] Raw `db.execute(sql\`UPDATE
  organization SET organization_id = id WHERE id = ${org.id}::uuid\`)` runs
  outside any branded helper.** It IS inside `withAdminBypass`'s callback, so
  the role gating is fine, but the SQL is template-literal-interpolated with
  `org.id`. The value comes from a Drizzle `RETURNING` clause so it's a UUID
  the DB just minted, NOT user input — not exploitable today. However, the
  pattern is on the wrong side of the "validate at boundaries only / never
  build SQL with literals" rule, and a future refactor that pipes in
  user-provided IDs would silently introduce injection. Drizzle's `sql.identifier
  /sql.param` machinery exists for this; use the `update(...).set(...)` API
  instead.
  Fix:
  ```ts
  await db
    .update(organization)
    .set({ organization_id: sql`id` })
    .where(eq(organization.id, org.id))
  ```
  Also: the comment at line 287-290 explains that `organization_id` is `NOT
  NULL` and a fresh `uuidv7()` is inserted, then UPDATEd. This entire dance is
  load-bearing for the `app_organization_self_id` trigger invariant. If the
  trigger ever ALREADY sets `organization_id = id` on INSERT (some versions of
  the schema do), the explicit UPDATE is a no-op and the fresh UUID gets
  thrown away. Verify trigger semantics — if the trigger does the work, drop
  this whole block; if it doesn't, the workspace step is currently spending an
  extra round-trip on every signup.

- **[apps/web/app/onboarding/actions.ts:220-225, member/actions.ts:141-146]
  `isEmailAlreadyRegistered` matches BA errors with a regex over `err.message`.**
  Better Auth's internal error string format is not part of its public API.
  Any minor BA version bump that rewords the message (e.g. "user already
  exists" → "An account with that email already exists") silently flips the
  outcome from `emailAlreadyRegistered` → `createAccountFailed`, exposing a
  generic "createAccountFailed" UI for the most common recoverable failure.
  Worse: the regex `already.*exist|already.*registered|user.*exist|duplicate`
  also matches "user might exist in a future build" or "duplicate header" —
  false-positive surface. The same helper is duplicated verbatim between owner
  and member action files, so fixes need to land twice.
  Fix: use BA's typed error (`APIError`/`BetterAuthError` with `.statusCode`
  / `.code` if exposed), or wrap `signUpEmail` in a probe that first SELECTs
  `app_user WHERE email = ?` and returns a typed result. At minimum, dedupe
  the helper into `apps/web/app/auth/_lib/`.

## High (BUG / CORRECTNESS)

- **[apps/web/app/onboarding/actions.ts:340-354] `pickUniqueSlug` queries
  global slug uniqueness, but the actual unique index is per-workspace.**
  `0003_rls_force.sql:43-44` defines `CREATE UNIQUE INDEX
  organization_workspace_slug_unique ON organization (workspace_id, slug);` —
  so two workspaces can each have an org with slug `acme`. `pickUniqueSlug`
  selects from `organization WHERE slug = candidate` with no `workspace_id`
  filter, so it appends `-2/-3/-…` even when the slug would be globally unique
  WITHIN the workspace being created. Result: users get cosmetically ugly
  slugs (`acme-23`) when the slug `acme` would have been legal. Worse, the
  loop is bounded to 50 — once 50 workspaces have a top-level `acme` org,
  every new workspace named "Acme" throws `Could not pick a unique organization
  slug` and the workspace step hard-fails for that brand name.
  Fix: filter by `workspace_id` in the `WHERE` clause, or remove the per-row
  loop and let the INSERT race the unique index, catching the
  `unique_violation` and retrying with `${base}-${i+1}`.

- **[apps/web/app/onboarding/actions.ts:330-338] `slugify` can produce a
  one-character slug that violates the DB CHECK constraint.** The slug
  format CHECK at `0003_rls_force.sql:36-39` requires `length(slug) BETWEEN 2
  AND 63` AND `slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'`. Input "A" or "1"
  yields a single character that passes the regex but FAILS the length lower
  bound (2). Input "-" yields `"workspace"` via the fallback — fine. Input
  "...." yields `""` via the strip-leading-trailing-dashes, then falls back
  to `"workspace"` — fine. But input "A1" passes both length and regex.
  Input "A" → "a" → fails CHECK → workspace step throws
  `createWorkspaceFailed`. The user sees a generic error and cannot recover
  without changing the display name.
  Fix: enforce minimum-length 2 in `slugify` by padding short slugs (e.g.
  `slug.length < 2 ? "workspace" : slug`) and pre-check the slug regex before
  attempting the INSERT.

- **[apps/web/app/onboarding/actions.ts:288-298] `organization` INSERT does
  not set `created_by_user_id` or any audit field** even though the
  workspace insert at line 262 does. If the schema or future RLS policy
  expects ownership tracking on `organization`, this row will be orphaned
  from the user that created it. Verify the schema explicitly.

- **[apps/web/app/onboarding/actions.ts:436-459] Per-invite loop swallows
  partial failures and reports them as `failures[]` in the response — but
  ALSO continues to the workspace `step_3_completed_at` UPDATE.** Even when
  every single invite fails, step 3 is marked complete (the action returns
  `{ ok: true, invitesSent: 0, failures: [...] }`). The user is funneled to
  step 4 (Done) believing the invites went out. The schema field
  `step_3_completed_at` should track "the user finished step 3," not "the
  user clicked Submit on step 3" — but conflating them means re-running the
  step is treated as a no-op when the resume helper computes the next step.
  Fix: branch on `sent > 0 || invites.length === 0` before marking
  `step_3_completed_at`. If every invite failed, surface a top-level error so
  the user retries.

- **[apps/web/app/onboarding/actions.ts:431] `BETTER_AUTH_URL` default
  `"http://localhost:3000"` ships to production if the env var is unset.**
  Invite emails will then point to `http://localhost:3000/auth/invite/start?
  token=...` — broken for recipients, plaintext HTTP token leak if any user
  follows the link from a non-loopback context. The fallback exists for dev
  but should fail loudly in production.
  Fix: throw at module load if `process.env.NODE_ENV === "production"` and
  `BETTER_AUTH_URL` is unset. Alternatively, validate via `zod` on server
  boot.

- **[apps/web/app/onboarding/actions.ts:165, 220-225] Race condition in the
  idempotency guard for step 3.** Two concurrent `submitPasswordAction`
  calls (double-click landing on two workers, or browser retry under load)
  both call `getActiveUserId()` and both get `null`; both then call
  `auth.api.signUpEmail`; one succeeds, the other races into the catch and
  is matched by `isEmailAlreadyRegistered` → returns
  `emailAlreadyRegistered`. The "winning" call commits the profile UPDATE +
  clears the cookie; the "losing" call returns an error to the user. The
  user clicks again, lands on the existing session, proceeds. This is
  recoverable but ugly. The header comment claims idempotency, but the
  guard is a TOCTOU window.
  Fix: serialize per-email in a process-local mutex (best-effort) or accept
  that the second call will return a recoverable error and translate
  `emailAlreadyRegistered` to a redirect to login.

- **[apps/web/app/onboarding/actions.ts:154-158] Step-skipping fallback uses
  the SAME error key as session-expired.** If the user's onboarding cookie
  is missing `profile` or `experience` (e.g. they manually crafted a
  request, or the cookie expired mid-flow), the action returns `{ ok:
  false, errorKey: "sessionExpired" }`. The UI presumably shows "your
  session has expired, please log in again" — but the session is fine, only
  the wizard state is stale. Misleading to the user.
  Fix: distinct error key (e.g. `"onboardingStateMissing"`) and route the
  user back to step 1, not the login page.

## High (BUG / CORRECTNESS, continued)

- **[apps/web/app/onboarding/actions.ts:165, member/actions.ts:66] The
  idempotency check `getActiveUserId() != null` does NOT verify that the
  session's email matches `claims.email`.** If a user is already logged in
  as `a@x.com` and somehow lands on `/onboarding/password` with a signup
  token for `b@x.com` (left-over cookie from a different signup attempt
  using the same browser), the action SKIPS `signUpEmail` and runs the
  profile UPDATE on `a@x.com`'s `app_user` row — applying `b@x.com`'s
  profile data to the wrong account. Identity confusion.
  Fix: when both a session AND signup claims are present, assert
  `session.user.email === claims.email` before reusing the session.
  Otherwise force a sign-out + re-attempt.

- **[apps/web/app/onboarding/actions.ts:188-190] Defensive `if (!userId)`
  block after the try/catch is unreachable**: if `signUpEmail` succeeded,
  `userId` is set; if it threw, the catch already returned. The only path
  that leaves `userId` null after the try is the catch returning — but the
  catch returns unconditionally on every code path, so this branch never
  runs. Either dead code (delete it) or the catch is missing a code path —
  audit and remove the unreachable branch (TypeScript should be flagging
  this via `noUnusedLabels` / control-flow analysis but is not because the
  `let userId` widens to nullable).

- **[apps/web/app/onboarding/actions.ts:77-79, 173, 201]
  `\`${firstName} ${lastName}\`.trim()` does not collapse internal
  whitespace.** Inputs `firstName=" John"`, `lastName="Doe"` → `" John Doe"`
  → `trim()` → `"John Doe"` — fine. But `firstName="John"`, `lastName=" "`
  → `"John  "` → `trim()` → `"John"` — fine. The actual bug:
  `firstName=""`-allowed-via-bypass is not possible because Zod min(1) +
  trim() reject empty. OK, so this is not a correctness bug, but the
  `display_name` is built twice in `submitPasswordAction` (line 173 for the
  BA signUp body, and line 201 for the post-signup UPDATE) — duplication.
  Extract into a single `const fullName = ...` at the top.

- **[apps/web/app/onboarding/actions.ts:165, 411] `getActiveUserId()` is
  called separately in EVERY step.** Each call wraps `auth.api.getSession({
  headers: await headers() })` — a DB query (because `cookieCache: {
  enabled: false }` in `packages/auth/src/server.ts:96`). At 7 onboarding
  steps × N retries, this is a measurable overhead, but more important: the
  comment in `server.ts:88-95` says cookie cache is disabled BECAUSE Server
  Components can't write cookies. Server Actions CAN. The double-query is
  performance-only, but worth noting.

## Medium (QUALITY / MAINTAINABILITY)

- **[apps/web/app/onboarding/actions.ts:91-93, 122-126]
  `try { await withAdminBypass(...) } catch { return … }` swallows the
  underlying error and returns a generic key.** No logging on the failure
  path (compare line 183 which does log). Step 1 (profile) and step 2
  (experience) failures are invisible in server logs. Operationally, that
  means a Drizzle / pgBouncer failure during onboarding shows up as a UI
  error key but no diagnostic trace.
  Fix: `console.error("[onboarding/profile] DB write failed", err)` in
  every catch. Apply to lines 88, 122, 211, 314, 384, 471, 509. The pattern
  is repeated 7+ times — consolidate into a `runStep(name, fn)` helper.

- **[apps/web/app/onboarding/actions.ts:54-56] `firstErrorKey` returns
  `zodIssues[0]?.message ?? "invalid"` — but Zod schemas in
  `packages/shared/src/auth/onboarding.ts` use `{ error: "name.required" }`
  format.** In Zod 4+, the `error` key populates `issue.message`, so this
  works today. But the field is fragile: if any schema author writes
  `{ message: "..." }` (old API) or passes a function-form error, the
  helper returns "invalid" silently.
  Fix: prefer `issue.path` + `issue.code` and map to error keys
  deterministically, or assert at module load that every issue has a string
  `message`.

- **[apps/web/app/onboarding/actions.ts:478-485] `loadBrandName` uses a
  dynamic `import()` "to avoid pulling next-intl/server into the action's
  initial module graph when the action runs from a non-i18n context (e.g.
  a test or a script that imports this module directly)."** The action IS
  always part of the i18n context in production (Next.js app/ routes always
  have request-scoped i18n via the layout). The "test / script" comment is
  a smell — tests should mock the dependency, not the production module
  graph. Dynamic imports inside server actions also defeat tree-shaking and
  module-level caching. Replace with a static import; if tests fail, add a
  mock at the test boundary.

- **[apps/web/app/onboarding/actions.ts:340-354] The 50-iteration loop is
  not bounded by retry / backoff; it sequentially issues 50 single-row
  SELECTs in the worst case.** Should be a single `SELECT slug FROM
  organization WHERE workspace_id = ? AND slug LIKE 'base%' LIMIT 50` and
  picked in memory, OR an INSERT-with-ON-CONFLICT loop. The current
  approach also has a TOCTOU: two concurrent signups picking the same
  candidate both pass the loop and race the INSERT. Today they race the
  unique index and one fails, but the failure path (line 316) returns
  `createWorkspaceFailed` instead of retrying.

- **[apps/web/app/onboarding/actions.ts:430] `process.env.BETTER_AUTH_URL ??
  "http://localhost:3000"`** appears here AND in `packages/auth/src/
  server.ts:47` (where there is no fallback). Same env var, different
  defaults. Centralize: read once at boot via `zod` env schema.

- **[apps/web/app/onboarding/actions.ts:1-525] File length 525 lines / 8
  exported actions.** The file mixes step-1-2 (cookie writes), step-3
  (auth.signUp), step-4 (workspace+org+memberships, slug helper), step-5
  (plan), step-6 (invite fan-out, i18n loader), step-7 (complete), and
  abandon. Each step is independent. Split per-step into
  `actions/profile.ts`, `actions/experience.ts`, etc., with shared helpers
  in `actions/_shared.ts`. The internal helpers (`getActiveUserId`,
  `firstErrorKey`, `isEmailAlreadyRegistered`, `slugify`,
  `pickUniqueSlug`, `loadBrandName`) belong in `_lib/`.

- **[apps/web/app/onboarding/actions.ts:220-225 + member/actions.ts:141-
  146] `isEmailAlreadyRegistered` is duplicated verbatim** between owner
  and member action files. DRY violation; fixes must land twice.

- **[apps/web/app/onboarding/actions.ts:80-84 and 199-205] `phone || null`
  pattern relies on falsy-coercion** — empty string maps to null, fine. But
  Zod allows `phone` to be `undefined | "" | "+E.164"`. `phone || null`
  also maps `undefined` to `null`, which is intended. Use `?? null` for
  semantic clarity (explicitly nullable, not falsy).

- **[apps/web/app/onboarding/actions.ts:266, 277, 299] `throw new
  Error("workspace insert returned no row")` (and twin throws) inside the
  `withAdminBypass` callback are caught by the outer try/catch at line 314
  and return a generic `createWorkspaceFailed` error key.** The throw
  messages are informative for logs but invisible to the user. Fine — but
  the throws are also caught by the i18n-loader's catch elsewhere; verify
  no logger downstream emits the inserted user's email/name.

- **[apps/web/app/onboarding/actions.ts:431-432] `baseUrl` + `brandName`
  are loaded inside the action, then re-loaded per request.** Both can be
  hoisted to module scope (`baseUrl` is just an env read; `brandName` is
  i18n-scoped and must stay per-request).

- **[apps/web/app/onboarding/actions.ts:40-43] `ActionResult` and
  `TeamActionResult` are exported types** — server actions cross the
  client/server boundary, so types are part of the public contract. Fine,
  but add a JSDoc on `errorKey` enumerating all returnable values
  (`"sessionExpired" | "noActiveWorkspace" | "createAccountFailed" |
  "emailAlreadyRegistered" | "saveProfileFailed" | "saveExperienceFailed"
  | "savePlanFailed" | "saveTeamFailed" | "createWorkspaceFailed" |
  "invalid" | ZodErrorKey`) so callers can exhaustive-match.

- **[apps/web/app/onboarding/actions.ts:413-414]
  `if (!userId) return { ok: false, errorKey: "sessionExpired" }
  const workspaceId = await findOwnerWorkspaceId(userId)` repeats the
  guard 4 times** (lines 240-243, 368-371, 411-414, 491-495). Extract
  `requireOwnerWorkspace()` helper that returns `{ userId, workspaceId }`
  or a typed error.

- **[apps/web/app/onboarding/actions.ts:521-525]
  `abandonOnboardingAction` clears cookies and redirects but does NOT
  revoke the signup token (no DB row to revoke today — see the Critical
  item above) and does NOT clear the active-workspace cookie if one was
  set. If a user partially completed step 4 then "Use a different email,"
  the active-workspace cookie still points to the orphan workspace.
  Fix: also call `clearActiveWorkspaceCookie()`.

## Low / Style

- **[apps/web/app/onboarding/actions.ts:165] `let userId: string | null =
  await getActiveUserId()` then `userId = signUp.user.id` then defensive
  null check.** The `let` widens the type to `string | null` for the rest
  of the function, requiring `!` non-null assertions or repeated null
  guards. Refactor to a helper that returns `string` after both branches.

- **[apps/web/app/onboarding/actions.ts:401] `failures?: Array<{ email:
  string; reason: string }>`** — including `err.message` from
  `issueInvite` failures in `reason` may leak internal SQL / SMTP errors
  to the client (line 456: `err instanceof Error ? err.message :
  "unknown"`). For example, an SMTP "550 No such user" reveals
  recipient-side details, and a Drizzle FK error reveals schema names.
  Fix: map to a closed set of reason codes (`"already_member"`,
  `"already_invited"`, `"send_failed"`, `"unknown"`), do not pass through
  `err.message`.

- **[apps/web/app/onboarding/actions.ts:201, 202, 203, 204, 205]
  `state.profile!.firstName` non-null assertion repeated** when the
  `state.profile` truthy check is 50 lines up. The flow analysis cannot
  carry the refinement that far. Bind `const profile = state.profile` and
  `const experience = state.experience` after the null check on lines 155-
  157 and use the locals.

- **[apps/web/app/onboarding/actions.ts:436-459] `for ... of` loop with
  per-iteration `await`** is sequential by design (rate-limit SMTP). Add a
  comment that this is intentional — otherwise a future "optimization" to
  `Promise.all` will trip per-recipient rate limits and email-provider
  bans.

- **[apps/web/app/onboarding/actions.ts:54] `firstErrorKey`** name implies
  it returns a key but it returns a string that MAY or MAY NOT be an i18n
  key (depending on the Zod message — see Medium item). Rename to
  `firstZodErrorMessage` and have the caller decide whether to translate
  it.

- **[apps/web/app/onboarding/actions.ts:341] `for (let i = 0; i < 50; i++)`**
  magic number 50. Extract to `const MAX_SLUG_ATTEMPTS = 50`.

- **[apps/web/app/onboarding/actions.ts:478-485] Dynamic import of
  `@workspace/i18n/server` inside a server action is awkward** (see
  Medium above) — the comment claims it avoids pulling next-intl into the
  module graph, but Next 16's RSC chunking already handles this via
  per-route bundles. Remove the dynamic import.

- **[apps/web/app/onboarding/actions.ts:34-38] Multiple `_lib` imports
  resolved relative.** The barrel pattern is fine, but cross-file
  imports use 3-level relative paths (e.g. line 30: `"../auth/_lib/issue-
  invite"`). Add a path alias if this becomes more common.

---

## Summary of severity

- **Critical**: 6 items (signup-token replay/no revocation, anonymous
  cookie write, no idempotency on workspace creation, team-action
  authorization gap, raw SQL outside branded helpers, BA error string
  match)
- **High** (correctness): 9 items (per-workspace slug, slugify length
  bound, missing audit fields, step-3 complete-on-zero-sent, BETTER_AUTH_URL
  default, idempotency race, error key conflation, identity confusion in
  idempotency check, dead-code defensive branch)
- **Medium**: 12 items (silent catches, dynamic i18n import, file size,
  duplication, env-var scattering)
- **Low/Style**: 8 items (non-null assertions, magic numbers, leaky error
  reasons)

The single highest-impact fix is **token revocation + single-use
consumption on the signup JWT**. The single biggest refactor win is
**splitting the 525-line action file per step**.
