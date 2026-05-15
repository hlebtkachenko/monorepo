# Senior Advisor Review — overnight hardening PR #89

Reviewed by: Opus 4.7 (senior dev mode, 1M context)
Date: 2026-05-15
Worktree: `/Users/hleb/Desktop/workspace/conductor/workspaces/monorepo/berlin`
Branch: `hlebtkachenko/compact-codebase` (15 commits ahead of `origin/main`)

The review reads each diff against the surrounding source, callers, tests, fixtures, and DB constraints. Verdicts are CLEAN / CONCERN / BROKEN. CI green is not treated as evidence.

---

## Verdict per commit

### 8b0c8be fix(db): fault-tolerant GUC restore and explicit user/workspace clears

Verdict: **CONCERN**

Evidence:
- Read `packages/db/src/tenancy.ts` end-to-end (371 lines).
- Verified `AdminBypassBound` has no external consumers (`Grep AdminBypassBound` returns only `packages/db/src/tenancy.ts` + the review docs).
- Confirmed Node engine `>=22` in `package.json`, so `AggregateError` is available (ES2021).
- Confirmed `withAdminBypass` wraps `fn` in `runner.transaction`, so a throw rolls back; the `AggregateError` raised in `finally` propagates out of the transaction and triggers rollback.

Concerns:
- `withAdminBypass` (line 329): `priorRole` is captured only when `composed === true`. Inside a non-composed call, the line below (`SET LOCAL ROLE app_admin`) runs without saving the prior role. That is correct because `SET LOCAL` is transaction-scoped, but the cache identifier is the LOGIN role (e.g. `app_user`), captured by `current_user` AFTER any outer-set role. If the outer caller had already done `SET LOCAL ROLE` on its own (no helper), the prior captured role is the OUTER role, not the LOGIN role. Subsequent `SET LOCAL ROLE ${prior}` would set back to that outer role, not the login role. Defence-in-depth — but worth a follow-up that asserts the application contract is always-through-helpers.
- New `AggregateError` path is untested. `packages/db/tests/*.ts` has no test that exercises a `set_config` failure inside `restorePriorGucs` or a role-restore failure inside `withAdminBypass`. The committed code is read but not validated under actual failure.
- `withOrganization` (line 170): when `userId === null` and `composed === false` (a TOP-LEVEL call), neither the `if (userId)` branch nor the `else if (composed)` branch fires. `app.user_id` remains its DB-role default ("" via the role ALTER). Acceptable because `SET LOCAL` is transaction-scoped and a fresh top-level transaction cannot see prior values — but the comment on line 173 only describes the nested case, leaving a documentation gap.

Fix recommendation: none required to ship. Add tests in a follow-up that drop a `tx.execute` reference to force a failing `set_config` call inside `restorePriorGucs` and assert `AggregateError` propagates.

---

### a260e11 feat(auth): lazy token secret, HS256 allowlist, env validation

Verdict: **CONCERN**

Evidence:
- Read `packages/auth/src/tokens/jwt.ts` and the new `packages/auth/src/env.ts`.
- Read `packages/auth/src/server.ts` — `readBetterAuthSecret()` is called at MODULE LOAD (line 91 inline). Every consumer of `@workspace/auth/server` will evaluate that secret check.
- Read `packages/auth/src/tokens/jwt.test.ts` — coverage now includes alg-confusion (HS512), too-short-secret on first use, and within-tolerance acceptance.
- Confirmed Zod 4.x via `packages/shared/package.json` + `apps/web/package.json`.
- Verified `errors.JWTExpired` is still thrown by `jose` `jwtVerify` with `algorithms: ['HS256']` for an HS256 token with `exp` in the past beyond the 30s tolerance.
- Verified no test or runtime path uses the dropped `TokenError("...", "DISABLED")` code (`Grep DISABLED` in `packages/auth/src` returns nothing).

Concerns:
- **Dev onboarding regression**: the dev fallback used to be Better Auth's hard-coded default secret. The new code throws even in dev when `BETTER_AUTH_SECRET` is missing, and the repo has NO `.env.example` file (`Glob **/.env.example` empty). A fresh checkout running `pnpm dev` will throw at module load. Document or ship `.env.example`.
- **Secret-cache key**: `cachedSecretSource !== raw` uses string compare. If two distinct env values are byte-equal, the cache hits. That is the desired behaviour. But: cache identity is plaintext stored at module scope. A heap dump of a Node process would expose the secret. Pre-existing for any code that reads `process.env.APP_TOKEN_SECRET`, but a `Buffer.fill(0)`-on-rotation hardening is achievable.
- **Test `vi.resetModules()` interaction**: line 100-112 of the test rotates env to `"too-short"` after `beforeAll` set it to the 47-char TEST_SECRET. The cache invalidation key (`cachedSecretSource !== raw`) does trigger a recompute on this rotation, so the test is genuine. But note that other tests in the file rely on `vi.resetModules()` plus the `beforeAll` block — order-dependent. If a future contributor moves the `process.env.APP_TOKEN_SECRET = TEST_SECRET` line, multiple tests start failing in opaque ways.

Fix recommendation: ship a `.env.example` (apps/web/.env.example) that documents `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `APP_TOKEN_SECRET`, and `DATABASE_URL` with 32-byte sample values labelled `change-me`.

---

### feac6fc fix(auth): normalize invite email at write/revoke, fix dev CLI types

Verdict: **CONCERN**

Evidence:
- Read `packages/auth/src/invite-issuer.ts` — `issueInvite` normalizes `input.email.trim().toLowerCase()` to `normalizedEmail` and uses it for the INSERT, the email send, and the `revokePendingInvites` call (line 60).
- Read `packages/shared/src/auth/onboarding.ts` `InviteRowSchema` — switched from `.email().max(320).or(z.literal(""))` to `.max(320).transform(trim+lower).pipe(.email().or(literal("")))`.
- Verified DB trigger `app_auth_invite_email_normalize` at `packages/db/migrations/0002_auth.sql:230-243` already lowercases. New code adds belt-and-suspenders.
- Verified `InviteClaims` is no longer exported and `InviteRecord` is (`packages/auth/src/tokens/index.ts:16`).

Concerns:
- **Whitespace-only behavioural change**: previously `"   "` failed the schema (not a valid email, not literal `""`). After the transform, `"   "`.trim() → `""` is accepted by `z.literal("")`. The form input "fields with only spaces" now silently means "empty invite slot". Likely benign but undocumented; a user clicking Send with " " in two rows now skips them instead of erroring.
- **Form output-type vs input-type**: `useForm<InviteListInput>` infers from `z.infer<typeof InviteListSchema>`, which is the OUTPUT type of the schema. Output `email` is `string` (post-transform), so the form value the user sees in the input box is NOT what gets sent — the typed-form `value` of `"Foo@Bar.com"` is treated as `"foo@bar.com"` after submit. Likely fine because the action also normalizes, but a `react-hook-form` mode `onChange` validation would surface the lowercased value back to the input, surprising the user. The form is `mode: "onSubmit"`, so this does not bite today.
- **`InviteRowSchema.max(320)` runs BEFORE the trim**: a user pasting `" " * 319 + "a@b.c"` (320 chars total) passes `.max(320)`, trims to ~5 chars, then passes `.email()`. Acceptable but worth noting that the cap is on raw length, not normalized length.

Fix recommendation: none required.

---

### a4be000 fix(invite): enforce session-email match in member flow + dedup helper

Verdict: **CLEAN**

Evidence:
- Read `apps/web/app/onboarding/member/actions.ts` end-to-end. The new check at line 74-80 fires before `signUpEmail` AND before `materializeInvite`. Comparison is `trim().toLowerCase()` on both sides.
- Read `apps/web/app/auth/_lib/email-error.ts` — single helper, exported, used by both owner + member action files.
- Confirmed the only other place that pattern-matched the BA "already registered" error message has been removed (`Grep "already.*exist|already.*registered"` returns only the new shared helper).
- Confirmed `apps/web/app/auth/(default)/invite/actions.ts` line 70 also does an email-match (older code, lowercase-only, no trim). The two paths differ slightly: `acceptInviteAction` does `.toLowerCase()` only, `submitMemberPasswordAction` does `.trim().toLowerCase()`. Better Auth strips whitespace from email at signup, so the absence of `.trim()` in `acceptInviteAction` is not exploitable in practice.

Concerns: none blocking.

---

### 17aec12 fix(invite): derive role/email/org from auth_invite, drop caller inputs

Verdict: **CONCERN**

Evidence:
- Read `apps/web/app/auth/_lib/materialize-invite.ts` end-to-end. The UPDATE happens at line 69-89, then the email-check at 119-132, then org lookup at 134-148.
- Confirmed `materializeInvite` wraps under `withAdminBypass` → `runner.transaction(...)`. Any throw rolls back the UPDATE. So a mismatched email correctly does NOT leave the invite marked accepted.
- Searched for all callers: `Grep materializeInvite` returns exactly the two updated callsites (`apps/web/app/auth/(default)/invite/actions.ts:78` and `apps/web/app/onboarding/member/actions.ts:130`). No missed callsite.
- Confirmed `app_user` is exported via `packages/db/src/schema/index.ts:2` → `./app_user`.
- Confirmed cast `inviteRow.role as "owner" | "admin" | ...` is sound because the invite-issuer validates the same enum before INSERT.

Concerns:
- **No tests for materialize-invite**: `Glob` finds no `*.test.ts` covering this file. The new defence-in-depth email check, the new workspace cross-check (org.workspace_id !== inviteRow.workspace_id), and the new RETURNING field-set are unvalidated.
- **`org.workspace_id !== inviteRow.workspace_id` throws `"organization-not-found"`**: the error code is misleading (the org WAS found; its workspace just doesn't match). Cosmetic but the operator log will mislead a triage.
- **`acceptInviteAction` in `apps/web/app/auth/(default)/invite/actions.ts:70`** compares `session.user.email.toLowerCase()` vs `record.email.toLowerCase()` without `.trim()` (the member-flow uses `.trim().toLowerCase()`). The DB-trigger lowercases but does not strip whitespace. If the BA `app_user.email` somehow has trailing whitespace, the check mismatches but `materializeInvite` itself will catch the same mismatch (using `.trim().toLowerCase()`). Defence-in-depth holds; the surface-level check is just inconsistent.

Fix recommendation: add a vitest+testcontainer integration test that exercises (a) success path, (b) tampered `userId` whose `app_user.email !== auth_invite.email`, (c) tampered DB state with `org.workspace_id != invite.workspace_id`. The current PR ships uncovered.

---

### 20b8e2a fix(invite): return opaque error to client; log discriminator server-side

Verdict: **CLEAN**

Evidence:
- Read the 8-line diff. Replaces `error: (err as Error).message ?? "Could not accept invitation."` with the fixed string. `console.error` retains the discriminator for ops.
- The `InviteResult.error` shape is still `string | undefined`. UI displays `result.error` as-is and the only consumer that branches on the message is the welcome card, which only renders it. No structured client-side handling depends on the previous codes.

Concerns: none.

---

### 07687be fix(onboarding): per-workspace slug, min-length slugify, gate step 3

Verdict: **CONCERN**

Evidence:
- Read `apps/web/app/onboarding/actions.ts` — `pickUniqueSlug` now takes `workspaceId` and filters `eq(organization.workspace_id, workspaceId)`. DB has UNIQUE `(workspace_id, slug)` per `packages/db/migrations/0003_rls_force.sql:43-44`.
- Read `slugify` — pads `< 2` chars to `"workspace"`. DB CHECK `length(slug) BETWEEN 2 AND 63` — match.
- Read `submitTeamAction` failures path — `failures` is returned in the error case at line 492.

Concerns:
- **Failures not surfaced in UI** (CONCERN): `apps/web/app/onboarding/(owner)/team/team-form.tsx:64-67` reads `result.errorKey` only on `!ok` and ignores `result.failures`. The user sees a generic toast and loses the per-email reason. Either surface failures in the error path or drop them from the response.
- **`pickUniqueSlug` race**: even with the workspace filter, two concurrent submits in the same workspace for the same name can both observe `!row` and INSERT the same slug. The UNIQUE index catches it (second insert errors). The current catch in `submitWorkspaceAction` returns `errorKey: "createWorkspaceFailed"`. Acceptable but worth noting that the per-attempt loop here is best-effort, not strict isolation.

Fix recommendation: surface `failures` in the team-form UI, or stop returning them in the error response (silent contract drift).

---

### 878ae1d fix(auth): sanitize next param against open redirect + query leak

Verdict: **CLEAN**

Evidence:
- Read `apps/web/lib/safe-next.ts` end-to-end (36 lines).
- Walked the rejection cases:
  - `null`/`undefined`/`""` → fallback ✓
  - `"https://evil.com"` → no leading `/` → fallback ✓
  - `"//evil.com"` → `startsWith("//")` → fallback ✓
  - `"/\\evil.com"` → `startsWith("/\\")` → fallback ✓
  - `"/javascript:alert(1)"` → scheme regex match → fallback ✓
  - `"/workspace/profile"` → passes ✓
- Read `apps/web/proxy.ts`: only `request.nextUrl.pathname` is passed through `safeNext`. Query string is dropped before round-tripping into `?next=`. Reset/signup tokens cannot leak.
- Three login-form clients (`login-email-form.tsx`, `login-password-form.tsx`, `login-mfa-form.tsx`) all wrap `search.get("next")` in `safeNext`.

Concerns:
- The relative-path acceptance allows `%-encoded sequences`, e.g. `%2F..%2F`. After `router.push`, Next normalizes the path. This stays same-origin (no open redirect) but could navigate to an unintended internal route. Acceptable; same-origin path traversal is not an open redirect.

---

### 8cb0e87 fix(orgSlug): join-based membership lookup + reserved-slug guard

Verdict: **BROKEN**

Evidence:
- Read `apps/web/app/[orgSlug]/layout.tsx` end-to-end (174 lines).
- New constant `SLUG_RE = /^[a-z][a-z0-9-]{1,62}[a-z0-9]$/`. Minimum match length: `[a-z]` (1) + `[a-z0-9-]{1,62}` (≥1) + `[a-z0-9]` (1) = **3 chars minimum**, and the first char MUST be a lowercase letter.
- DB CHECK in `packages/db/migrations/0003_rls_force.sql:36-39`:
  - `slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'` — first char `[a-z0-9]` (allows digits).
  - `length(slug) BETWEEN 2 AND 63` — minimum 2.
- `slugify` (`apps/web/app/onboarding/actions.ts:325-336`) pads `< 2` to `"workspace"` but allows the literal `"ab"` (2 chars) or any digit-starting result like `"42x"`.

This means a perfectly legal, DB-accepted slug like `"hi"` or `"42x"` will be rejected by the layout — the user gets `/workspace?error=invalid-slug` despite owning the org. Concrete repro:
1. Onboarding step 4: workspace name `"Hi"`.
2. `slugify("Hi")` → `"hi"` (length 2, not padded because `< 2` is false).
3. INSERT into `organization` with `slug = "hi"` — DB accepts.
4. Owner finishes onboarding, lands on `/hi`.
5. Layout `SLUG_RE.test("hi")` → false → redirect to `/workspace?error=invalid-slug`.

Repro 2:
1. Workspace name `"1Acme"` → slugify → `"1acme"` (starts with digit).
2. DB accepts.
3. Layout regex requires first char `[a-z]` → rejects.

Fix recommendation: change `SLUG_RE` to match the DB CHECK exactly:
```ts
const SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/
```
This permits length 1 (which the DB length CHECK then rejects, but the slug column does not exist for length 1 anyway because slugify pads or the user-passed slug is the URL segment and a 1-char URL is already invalid for many other reasons), and digit-starting slugs. Length minimum is fine since orgs cannot persist with length < 2.

Additional concerns (non-blocking):
- `RESERVED_SLUGS` set duplicates the DB-side reserved-slug function (`app_is_reserved_org_slug`). Mismatch risk if the two lists drift. Worth a runbook note.
- Wrapping `resolveMembership` in try/catch and redirecting to `/workspace?error=internal` is the right shape — but `redirect` itself throws a `NEXT_REDIRECT` symbol that should NOT be caught. The Next.js docs are explicit: do not catch `redirect()` calls. Here `resolveMembership` runs INSIDE the try block, so its own throw is from `withAdminBypass`, not from `redirect`. Safe — the redirect after the catch fires outside the try. Confirmed by re-reading the layout.

---

### 62fb1f1 fix(audit): toolName allowlist, pageSize cap, role gate, wildcard walks objects

Verdict: **CONCERN**

Evidence:
- Read `packages/db/src/audit/query.ts`, `redact.ts`, `redaction-registry.ts`, `get-detail.ts`.
- Verified `getAuditDetail` has no external callers (`Grep getAuditDetail` returns only the file itself + `query.ts` doc comment). The role-gate is purely defence-in-depth.
- Verified `_resetForTests` env check: `process.env.NODE_ENV === "test"` is set automatically by Vitest, and `VITEST = "true"` is set as the string. Both are true under `pnpm test`. The flip is sound.
- Read `redact.ts` line 44: `if (node === null || node === undefined) return` — protects the `typeof object === "object"` branch from `null`.
- The wildcard now walks `Array.isArray(node)` first (early return), then `Object.values` on objects. No double-walk.

Concerns:
- **Search semantics broken**: `ilike '%${toolName}%'` was a SUBSTRING search; the new `eq` is an EXACT match. The diff message acknowledges this but the existing call site documentation in `packages/db/README.md` and `docs/adr/0011-audit-log.md` describes the filter as a search box. No frontend caller exists yet (`Grep listAuditTimeline` in `apps/web` returns nothing) so the regression is latent — when a UI is built it must not assume "type partial → match."
- **Wildcard semantics broadened**: previously wildcards only iterated arrays. Now they iterate object values too, so an existing rule like `meta.*.password` will redact additional fields in a record-style payload. Direction is over-redaction (safe), but rule audits should be re-run.
- **`MAX_PAGE_SIZE = 200`**: hard cap silently truncates page sizes. The `totalRows` count is computed separately and unbounded, so a 500-row request returns `data.length=200, total=512` and the UI must reconcile. Future UI work.
- **`parseISODateOrThrow` throws Error**: no `try/catch` at the route handler. The string `?dateFrom=garbage` becomes a 500. Should be a 400 — but since no route handler exists yet, this is latent.

Fix recommendation: none required to ship; capture follow-ups in the audit UI design.

---

### 0fd4f00 feat(killswitch): trigger source verification + alarm allowlist + concurrency 1

Verdict: **CONCERN**

Evidence:
- Read `infra/cdk/lib/lambda/killswitch/index.mjs` end-to-end.
- Read `infra/cdk/lib/security-stack.ts` lines 80-110 — `killSwitchAlarmNames` (5 entries) injected as `KILL_SWITCH_ALARM_NAMES` env.
- Read `infra/cdk/tests/killswitch-handler.test.ts` (140 lines added) — covers EventSource mismatch, TopicArn mismatch, substring-attacker-name rejection, non-JSON without budget anchor, missing desiredCount, ECS-throws-error.
- Confirmed `reservedConcurrentExecutions: 1` at `security-stack.ts:100`.

Concerns:
- **`EXPECTED_TOPIC_ARN` is OPT-IN**: line 71 `if (EXPECTED_TOPIC_ARN && record.Sns?.TopicArn !== EXPECTED_TOPIC_ARN)`. If the CDK env stops injecting it (refactor accident), the TopicArn check silently no-ops. The EventSource check is still strict (line 65), but the TopicArn defence-in-depth has a fail-open shape. Better: throw at handler startup if `EXPECTED_TOPIC_ARN` is missing.
- **Per-record try/catch swallows ECS errors**: `stopEcsService` throws → caught → `results.push({action:"error", reason})` → handler returns success. **This means the Lambda's `Errors` metric does NOT increment on a caught ECS exception, so the `KillSwitchErrorsAlarm` added in 3c8bdc2 will NOT fire.** Silent failure mode. See cross-cutting concerns below.
- **`isBudgetNotification` substring check**: matches `"AWS Budget Notification"` or `"AWSBudgets"`. AWS Budgets is the only principal allowed to publish non-JSON to this topic (resource policy at security-stack.ts:182-195), so an attacker route requires compromising the AWS Budgets service principal first. Acceptable; positive anchor is strictly safer than the previous "any non-JSON".
- **`isKnownAlarm` allowlist hardcoded in CDK**: the comment says "keep them in sync (TODO when adding alarms)." Adding an alarm in `observability-stack.ts` without updating `killSwitchAlarmNames` silently disables it. Worth a follow-up ESLint rule or a single source of truth.

Fix recommendation: change `if (EXPECTED_TOPIC_ARN && ...)` to require the env var:
```js
if (!EXPECTED_TOPIC_ARN) throw new Error("EXPECTED_TOPIC_ARN is required")
```
At top of `handler`. And rethrow caught ECS errors at the END of the batch so `Errors` metric ticks (after recording per-record outcomes for observability).

---

### 3c8bdc2 chore(killswitch): DLQ on SNS subscription + Lambda Errors alarm

Verdict: **BROKEN**

Evidence:
- Read `infra/cdk/lib/security-stack.ts:132-169`. The `KillSwitchErrorsAlarm` calls `addAlarmAction(new SnsAction(this.killSwitchTopic))`.
- Inspected SNS subscribers on `killSwitchTopic`: line 138-142 — ONLY `LambdaSubscription(this.killSwitchFn, ...)` is attached. There is NO `EmailSubscription` on `killSwitchTopic`.
- `Grep EmailSubscription` shows email subscriptions only on `billingTopic` (`observability-stack.ts:100`, `billing-alarms-stack.ts:33`) and on the `KillSwitchTopic` resource policy as a publish-allow target — but `addSubscription(EmailSubscription)` is never called for `killSwitchTopic`.
- The KillSwitchErrorsAlarm sends to the kill-switch topic, which routes to:
  1. The Lambda itself (`KillSwitchFn`). The Lambda parses the SNS message, extracts `parsed.AlarmName = "monorepo-${envName}-cost-killswitch-errors"`, checks `isKnownAlarm()` against `ALLOWED_ALARM_NAMES = {fargate-cpu-critical, fargate-memory-critical, fargate-network-out-high, s3-put-rate-high, cwlogs-ingest-high}`. The errors-alarm name is NOT on that list → `{ action: "skip", reason: "unknown-alarm" }`.
- **Operator email path: missing**. The alarm fires, the Lambda receives and skips, no notification reaches the operator.

The commit message claims "operator email gets pinged." That is false.

Concrete repro:
1. Deploy the stack.
2. Force the Lambda to throw uncaught (e.g. revoke the ECS UpdateService IAM grant).
3. Trigger a budget notification.
4. Lambda increments `AWS/Lambda Errors` metric.
5. `KillSwitchErrorsAlarm` transitions to ALARM, publishes to `killSwitchTopic`.
6. Lambda receives the SNS envelope, processes `AlarmName: monorepo-prod-cost-killswitch-errors`, `isKnownAlarm()` returns false, logs `unknown-alarm`, returns success.
7. Operator inbox: empty.

Fix recommendation:
- Pass `billingTopic` into `SecurityStack` (from the props pipeline; `ObservabilityStack` and `SecurityStack` are siblings under `bin/app.ts`) and route the errors alarm there:
  ```ts
  killSwitchErrorsAlarm.addAlarmAction(new SnsAction(props.billingTopic))
  ```
- Alternative: subscribe `props.alertEmail` directly to `killSwitchTopic`. But that would also email the operator on every legitimate kill-switch fire, mixing signal. The clean fix is to route observability alarms through `billingTopic`.

Severity: medium. The cost killswitch still works; the alarm-on-the-alarm-handler observability is the part that is broken. Worth fixing before relying on this as the primary alarm-on-failure path.

---

### 27e7779 fix(mfa-setup): surface backup codes, tighten OTP, scrub state on success

Verdict: **CONCERN**

Evidence:
- Read `apps/web/app/auth/mfa/setup/mfa-setup-form.tsx` end-to-end (~280 lines).
- Verified the new stage flow: `password → backup → verify`. The `backup` stage requires `backupAck` (checkbox) before `Continue`.
- Read OTP regex `/^\d{6}$/`. Applied in both `onSubmitVerify` and the `disabled` prop.
- Scrub order in `onSubmitVerify`: `setEnroll(null); setCode(""); setPassword(""); router.push(...)`. Correct order — state cleared before navigation triggers re-render.
- Verified `setSubmitting(false)` moved into `try/finally`.

Concerns:
- **Backup codes are display-once and tab-fragile**: if the user closes the browser between the `backup` stage and the `verify` stage, the codes are GONE in the browser, but `authClient.twoFactor.enable` already persisted them server-side. The user can no longer view them. Existing BA semantics, but the new flow makes it more visible because there's now an extra stage. Worth a runbook entry: "if you lose your codes mid-enrollment, disable + re-enroll."
- **`navigator.clipboard.writeText` may throw**: on a non-secure context (no HTTPS, no localhost) the Promise rejects with `NotAllowedError`. The code uses `void navigator.clipboard.writeText(...)` so the rejection is dropped silently. User clicks "Copy codes," nothing happens, no error feedback. Add a `.catch(setError(...))` or a toast.
- **`backupAck` not reset between enrollments**: if the user errors out at verify, goes back (no UI back button but state preserved on a hot reload), `backupAck === true` persists. The user can advance without re-acknowledging on the next attempt. Minor.
- **No CSRF on `authClient.twoFactor.enable`**: relies on Better Auth's session-cookie + same-origin enforcement. Pre-existing.

Fix recommendation: surface clipboard errors so the user knows when the copy failed.

---

### 094747d fix(auth): allow next build to skip BETTER_AUTH_SECRET requirement

Verdict: **CLEAN**

Evidence:
- Read `packages/auth/src/server.ts:35-79`.
- Confirmed Next.js 16 (`apps/web/package.json`) sets `process.env.NEXT_PHASE = 'phase-production-build'` during `next build`. The `IS_BUILD` constant is evaluated at module load, matches that phase, and short-circuits `readBetterAuthSecret` / `readBetterAuthBaseUrl`.
- Confirmed the placeholder is 63 bytes (`"build-time-placeholder-" + "x".repeat(40)`), satisfying the 32-byte minimum if BA double-checks at runtime. No other code path can see this placeholder because production module evaluation reads the real env (the boot order is: container start → process.env hydrated → `next start` → re-evaluate modules with real secret).
- `IS_BUILD` is module-scoped (const). No way for a runtime request to flip it.
- Searched for other env consumers that might trip during build: `Grep BETTER_AUTH_SECRET` and `@workspace/auth/server` — all consumers go through the same server module, so the build-phase placeholder covers them.

Concerns: none. The fix is narrow, well-commented, and the failure mode if the placeholder ever leaks (e.g. someone forgets to set `BETTER_AUTH_SECRET` in production) is uniform HMAC-rejection, not a silent fail-open.

---

## Cross-cutting concerns

1. **Test coverage debt** (CONCERN cross-cutting):
   - `materializeInvite` (commit 17aec12): 0 tests, new defence-in-depth checks unvalidated.
   - `restorePriorGucs` / `withAdminBypass` AggregateError paths (8b0c8be): 0 tests for the failure case.
   - `safeNext` (878ae1d): 0 tests for the helper, only indirect via form smoke.
   - `SLUG_RE` in `[orgSlug]/layout.tsx` (8cb0e87): 0 tests; the BROKEN regex (2-char + digit-leading slugs rejected) would have been caught by a single parameterized test.

2. **Killswitch observability loop**: commit 0fd4f00 swallows ECS errors per-record (does not propagate, so the Lambda Errors metric doesn't tick) AND commit 3c8bdc2 routes the Errors alarm into a topic with no email subscriber. The two combined create a silent failure surface in the cost runaway protection. See 0fd4f00 + 3c8bdc2 verdicts.

3. **Slug invariant drift**: `slugify` (TS), DB `organization_slug_format` CHECK (regex + length), `SLUG_RE` in layout, and `app_is_reserved_org_slug` (DB function) + `RESERVED_SLUGS` (TS) — four loosely-coupled validators with different definitions. The PR introduced TWO of them; ideally there should be one source of truth (a single shared module that exports the regex used by both layers).

4. **Dev onboarding friction**: `BETTER_AUTH_SECRET`, `APP_TOKEN_SECRET` are now hard-required at module load even in dev. No `.env.example` in the tree. Fresh checkouts fail at `pnpm dev`. Ship an env template.

5. **Module-load side effects**: `packages/auth/src/server.ts` reads env at import time. That makes the module non-tree-shakable for tooling that imports it for type-only purposes. The lazy `readBetterAuthSecret` is invoked eagerly via `betterAuth({ secret: readBetterAuthSecret() })`. Future refactor: defer the env read until first session request.

---

## Final summary

- CLEAN: 4 — `a4be000`, `20b8e2a`, `878ae1d`, `094747d`
- CONCERN: 8 — `8b0c8be`, `a260e11`, `feac6fc`, `17aec12`, `07687be`, `62fb1f1`, `0fd4f00`, `27e7779`
- BROKEN: 2 — `8cb0e87`, `3c8bdc2`

Overall recommendation: **FIX-FIRST**.

Two BROKEN findings prevent shipping as-is:

1. **`8cb0e87` SLUG_RE rejects DB-legal slugs** — users with 2-char workspace names (e.g. `"Hi"` → slug `"hi"`) or digit-leading slugs are locked out of their own organization. Fix path: change `SLUG_RE` to mirror the DB CHECK regex `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`.

2. **`3c8bdc2` KillSwitchErrorsAlarm has no operator surface** — fires SnsAction on a topic with no email subscriber; the only subscriber (the Lambda itself) skips on unknown-alarm. Fix path: route the alarm to `billingTopic` or subscribe `alertEmail` to `killSwitchTopic`.

Priority order:

1. **HIGH** `8cb0e87`: relax `SLUG_RE` in `apps/web/app/[orgSlug]/layout.tsx` to match the DB CHECK. Add a unit test covering `"hi"`, `"42x"`, `"workspace"`, `"-bad"`, `"bad-"`, `"good-slug"` and assert which pass/fail.
2. **HIGH** `3c8bdc2`: route `killSwitchErrorsAlarm.addAlarmAction` to `billingTopic` (pass via SecurityStack props) so the operator email actually pages on Lambda failure.
3. **MEDIUM** `0fd4f00`: require `EXPECTED_TOPIC_ARN` at handler startup; rethrow caught ECS errors after recording per-record outcomes so the Errors metric increments.
4. **MEDIUM** `27e7779`: surface `navigator.clipboard.writeText` rejection so users learn when "Copy codes" silently fails.
5. **LOW** ship `.env.example` documenting `BETTER_AUTH_SECRET`, `APP_TOKEN_SECRET`, `BETTER_AUTH_URL`, `DATABASE_URL`.
6. **LOW** add tests for `materializeInvite` defence-in-depth checks; for `restorePriorGucs` AggregateError; for `safeNext` (parameterized).
