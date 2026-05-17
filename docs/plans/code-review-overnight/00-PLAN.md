# 00 — Consolidated Code-Review Hardening Plan

Branch: `hlebtkachenko/compact-codebase` → NEW PR (not the current one). Cannot merge.

This plan consolidates findings from `01-tenancy.md` through `10-killswitch.md`,
verifies every BLOCKER / CRITICAL against the actual source, and groups the
remaining work into MUST_FIX_NOW / FIX_THIS_PR / DEFER_TO_FOLLOWUP with an
execution order that minimizes commits and test-rewrite churn.

The two structural axes:

1. **Severity** — reviewer-supplied + my verification verdict.
2. **Co-location** — fixes touching the same file or sharing a contract go in
   one commit even when they originate from different review files.

---

## Section A — Findings index (verbatim from review files, grouped by file)

Each line is `severity` + `file:line` + 1-line description. For BLOCKER /
CRITICAL findings I add my verification verdict: `CONFIRMED` / `FALSE POSITIVE`
/ `NEEDS DEEPER LOOK`.

### 01-tenancy.md — `packages/db/src/tenancy.ts`

- CRIT [tenancy.ts:179-183, 235-239] `restorePriorGucs` finally not fault-tolerant — partial restore leaks GUC across outer scope. **CONFIRMED** (single sequential awaits, no per-call try/catch, no outerTx abort on failure).
- CRIT [tenancy.ts:315-323] `withAdminBypass` finally has same defect for `SET LOCAL ROLE` restore — elevated `app_admin` BYPASSRLS leaks. **CONFIRMED** (line 319-322 single sequential await, no abort on failure).
- CRIT [tenancy.ts:136-185] `withOrganization` does not explicitly clear `app.user_id` when `userId=null` — outer scope's user_id leaks into body. **CONFIRMED** (line 156: `if (userId)` only; no `else` clear).
- CRIT [tenancy.ts:172-176] `app.workspace_id` only set when org row's `workspace_id` non-null — outer workspace_id GUC silently inherits. **CONFIRMED** (line 172: `if (workspaceId)`; no else-clear).
- CRIT [tenancy.ts:281-325] `withAdminBypass` over-permissive escape hatch — 21+ callsites, no reason-string, no logging. **CONFIRMED** but **PROCESS / GOVERNANCE** (no source bug; mitigation is policy, not code surgery).
- HIGH [tenancy.ts:104-111] `restorePriorGucs` is a blanket reset.
- HIGH [tenancy.ts:87-93,163-165,291-294,308-312] Repeated `as unknown as Array<...>` casts; no runtime validator.
- HIGH [tenancy.ts:319-322] `sql.raw(priorRole)` after assert — comment-load-bearing pattern.
- HIGH [tenancy.ts:142-144,209-211,285-287] No runtime check that `outerTx` is live.
- HIGH [tenancy.ts:88-90,163-165] `<{value: ...}>` generic on `tx.execute<T>` is doc-only — Drizzle does not enforce.
- HIGH [tenancy.ts:281-325] No timeout / AbortSignal on `withAdminBypass`.
- HIGH [client.ts:51-64] sqlClient Proxy lifecycle in tests.
- MED [tenancy.ts:51-55] `Symbol` vs `Symbol.for` asymmetry.
- MED [tenancy.ts:144-184…] Three helpers' structural duplication.
- MED [tenancy.ts:78-81] `AdminBypassBound` exported as bare brand.
- MED [tenancy.ts:307-313] `priorRole` triple-nested expression.
- MED [tenancy.ts:248-254] `assertSafeRoleName` throw inside `finally` clobbers original error.
- INFO [tenancy.ts:9-11,53-55,156,283-285], [rls.ts:50-56], [client.ts:160-163] — comments + minor style.

### 02-auth-core.md — `packages/auth/src/server.ts` + `tokens/jwt.ts`

- CRIT [server.ts:46] `BETTER_AUTH_SECRET` not validated; BA falls back to default. **CONFIRMED** (line 46 passes raw env, no length check, no throw).
- CRIT [server.ts:47-48] `baseURL` / `trustedOrigins` not validated + no `.trim()` on split. **CONFIRMED** (line 48: bare `.split(",")`).
- CRIT [server.ts:121-136] No `requireEmailVerification`, no `rateLimit`. **CONFIRMED** (only `autoSignIn:true`, `minPasswordLength:12`, no rate-limit block).
- CRIT [jwt.ts:14-25] Secret computed at module load — order-dependent, requires `vi.resetModules()` in tests. **CONFIRMED** (IIFE at line 14, `vi.resetModules` referenced in test file).
- CRIT [jwt.ts:19] Length check on string `.length` not byte length. **CONFIRMED** (line 19 checks `raw.length`).
- CRIT [jwt.ts:42-53,65-100] `jwtVerify` algorithm allowlist not enforced. **CONFIRMED** (line 70-73: no `algorithms` option).
- HIGH [jwt.ts:65-100] No `clockTolerance`.
- HIGH [jwt.ts:80] `payload as unknown as TClaims` — no zod validation.
- HIGH [jwt.ts:46] Unnecessary `claims as Record<string,unknown>` cast.
- HIGH [jwt.ts:51] Manual `Math.floor(Date.now()/1000) + ttlSeconds`.
- HIGH [jwt.ts:95-99] Trailing catch leaks jose error message.
- HIGH [server.ts:151-178] `nextCookies()` plugin-last ordering is comment, not invariant.
- HIGH [server.ts:131-132] `minPasswordLength: 12` only — no zxcvbn / pwned check.
- MED [jwt.ts:55-63] Dead `"DISABLED"` enum.
- MED [jwt.ts:36] Magic `ISSUER = "app"`.
- MED [jwt.ts:49] Audience == kind = redundant.
- MED [server.ts:62-73] `additionalFields` defaults duplicate DB defaults.
- MED [server.ts:46-48] Three inline env reads.
- MED [jwt.test.ts] `vi.resetModules` proliferation.
- INFO [jwt.test.ts:1-78] Coverage gaps (wrong-secret HS256, wrong issuer, wrong audience, alg:none, clock skew, kind mismatch).
- INFO [server.ts:13-33,181], [invite.ts:36-38], [jwt.ts:81] — design comments / catch style.

### 03-invite-flow.md — `invite-issuer.ts` + callers

- BLOCKER [onboarding/member/actions.ts:66-90,113-125] Member-flow skips email-match when session exists → cross-tenant invite acceptance. **CONFIRMED** (lines 66-90 reuse `session.user.id` with no email comparison; `submitMemberPasswordAction` then materializes invite for any logged-in user).
- BLOCKER [invite-issuer.ts:203-209] `revokePendingInvites` case-sensitive on email — DB trigger lowercases but caller may not, leaves concurrent valid tokens. **CONFIRMED** (line 206 uses `eq(auth_invite.email, input.email)` raw).
- BLOCKER [scripts/issue-invite-token.ts:26,31,38,54] `InviteClaims` import broken — type no longer exported. **CONFIRMED** (line 26 imports `InviteClaims`; `tokens/invite.ts` exports only `InviteRecord`).
- WARN [invite-issuer.ts:30-45,53-133] `issueInvite` + `revokePendingInvites` not atomic.
- WARN [invite-issuer.ts:62-65] Raw token in URL + no Referrer-Policy.
- WARN [invite-issuer.ts:150-188] `readInviteByRawToken` leaks org+email+role for revoked/accepted/expired statuses.
- WARN [invite-issuer.ts:62-63,154][materialize-invite.ts:62,187-189] SHA-256 not HMAC — offline brute-force if DB dump leaks.
- WARN [onboarding/actions.ts:431] `BETTER_AUTH_URL` falls back to `localhost:3000` in production.
- WARN [invite-issuer.ts:78,109,153] Internal error strings leaked to client.
- WARN [auth/(default)/invite/start/route.ts:18-58] No rate-limit on token-lookup endpoint.
- INFO [invite-issuer.ts:9,30,32,33,47,174,246-258], [tokens/invite.ts:29-30,40-53], [materialize-invite.ts:113-126], [onboarding/member/_lib/invite-cookie.ts:34-38], [onboarding/actions.ts:431] — mix-of-concerns / `<=` vs `<` / role union dup / dead defensive check / unused export / stale comments / newtype.

### 04-edge-proxy.md — `apps/web/proxy.ts`

- BLOCKER CR-01 [proxy.ts:26-30] + login forms: open redirect via unsanitized `next`. **CONFIRMED** (proxy line 27 echoes `pathname + search`; login forms feed `next` into `router.push` and `callbackURL`).
- BLOCKER CR-02 [proxy.ts:27] Full query string echoed into `?next=` — leaks tokens / PII / sensitive deeplinks. **CONFIRMED** (line 27 `pathname + search`).
- WARN WR-01 [proxy.ts:13-18] Docstring overstates security guarantee.
- WARN WR-02 [proxy.ts:9-10] Docstring references nonexistent `(app)` route group.
- WARN WR-03 [proxy.ts:50-51] Blanket `/onboarding/*` exclusion; `member/done/page.tsx` unguarded.
- WARN WR-04 [proxy.ts:26] Hardcoded `/auth/login` — no i18n route prefix awareness.
- WARN WR-05 [proxy.ts:24] `getSessionCookie` config not pinned.
- INFO IN-01,02,03 — matcher regex / return type / dead `intended !== "/"` guard.

### 05-onboarding-actions.md — `apps/web/app/onboarding/actions.ts`

- CRIT [actions.ts:142-218] `submitPasswordAction` trusts signup JWT — no DB row, no single-use, no `jti` revocation, 14-day TTL. **CONFIRMED** (no `auth_signup` table; cookie cleared post-success only; signup token in cookie is opaque JWT).
- CRIT [actions.ts:62-96,102-130] Step 1-2 actions accept anonymous calls and write cookie state. **CONFIRMED** (lines 70-93: if `userId` null, writes cookie state with no signup/invite claim check).
- CRIT [actions.ts:232-327] `submitWorkspaceAction` no idempotency key. **CONFIRMED** (no dedup; double-click creates N workspaces).
- CRIT [actions.ts:403-476] `submitTeamAction` org lookup `ORDER BY created_at LIMIT 1` — no active-org cookie; no role-on-org assertion. **CONFIRMED** (lines 420-428).
- CRIT [actions.ts:302-304] Raw `db.execute(sql\`UPDATE…\`)` outside Drizzle builder. **CONFIRMED**. Value source = freshly-inserted UUID via RETURNING; not exploitable today.
- CRIT [actions.ts:220-225, member/actions.ts:141-146] `isEmailAlreadyRegistered` regex match over BA's error string. **CONFIRMED** (line 222 regex; BA error format is private API).
- HIGH [actions.ts:340-354] `pickUniqueSlug` queries global, not per-workspace. **CONFIRMED** (line 349 missing `workspace_id` filter).
- HIGH [actions.ts:330-338] `slugify` can produce 1-char slug that fails the DB CHECK constraint. **CONFIRMED**.
- HIGH [actions.ts:288-298] Organization INSERT no `created_by_user_id`. **CONFIRMED** (line 288-298 missing field; need to verify schema requires it — likely optional).
- HIGH [actions.ts:436-459] Per-invite loop marks `step_3_completed_at` even when every invite failed. **CONFIRMED** (lines 461-470 unconditional).
- HIGH [actions.ts:431] `BETTER_AUTH_URL` default localhost in prod. **CONFIRMED**.
- HIGH [actions.ts:165,220-225] TOCTOU on idempotency guard.
- HIGH [actions.ts:154-158] Step-skip fallback returns `sessionExpired` errorKey misleadingly.
- HIGH [actions.ts:165, member/actions.ts:66] Session-vs-claims email mismatch not asserted. **CONFIRMED**, overlaps with 03 BLOCKER for member path. For owner path: signup-claim email is the same source as the BA insert, so primary identity-confusion is in member flow.
- HIGH [actions.ts:188-190] Defensive `if (!userId)` after try/catch unreachable.
- HIGH [actions.ts:77-79,173,201] `display_name` built twice; whitespace OK.
- HIGH [actions.ts:165,411] `getActiveUserId` called 7+ times — perf only.
- MED [actions.ts:91-93,122-126,288-298,478-485,340-354,430,1-525,220-225, member/actions.ts:141-146,80-84,266-299,431-432,40-43,413-414,521-525] — silent catches, dynamic i18n import, file size, `phone || null` vs `??`, throw inside withAdminBypass, etc.
- LOW [actions.ts:165,401,201-205,436-459,54,341,478-485,34-38] — `let userId` narrowing, error.message leak in failures, `state.profile!.firstName` repeats, sequential loop comment, magic 50, dynamic import.

### 06-materialize-invite.md — `apps/web/app/auth/_lib/materialize-invite.ts`

- CRIT CR-01 [materialize-invite.ts:42] `email` parameter declared but never enforced inside body. **CONFIRMED** (declared line 42; no use in body).
- CRIT CR-02 [materialize-invite.ts:36,179] `role` parameter trusted — RETURNING omits `role` from UPDATE. **CONFIRMED** (lines 81-85 RETURNING omits role; line 179 writes caller `input.role` directly).
- CRIT CR-03 [materialize-invite.ts:34,118] `organizationId` parameter is the lookup key, defence-in-depth at line 121 is the only check. **CONFIRMED** (line 118 selects by `input.organizationId`).
- CRIT CR-04 [materialize-invite.ts:52-57 + actions.ts:91] Token-enumeration leak via distinct error codes returned to client. **CONFIRMED** (line 91 of `acceptInviteAction` returns `err.message`; InviteAcceptError.message IS the code).
- WARN WR-01 [materialize-invite.ts:158-160] Stale comment about partial unique index.
- WARN WR-02 [materialize-invite.ts:128-156] Race on concurrent invite accepts.
- WARN WR-03 [materialize-invite.ts:147,176] `org.workspace_id` not cross-checked against `inviteRow.workspace_id`.
- WARN WR-04 [materialize-invite.ts:152-154] Generic `Error` instead of `InviteAcceptError`.
- WARN WR-05 [materialize-invite.ts:69-72] `accepted_by_user_id` not verified against `app_user`.
- WARN WR-06 [materialize-invite.ts:64] `withAdminBypass` scope wider than necessary.
- INFO IN-01,02,03,04 — `inviteRawToken` naming, local `sha256` dup, non-null assertion, file length.

### 07-orgslug-layout.md — `apps/web/app/[orgSlug]/layout.tsx`

- BLOCKER CR-01 [layout.tsx:101-110] Slug lookup non-deterministic — uniqueness is `(workspace_id, slug)`. **CONFIRMED** (line 108 missing workspace filter).
- BLOCKER CR-02 [layout.tsx:35-37] `redirect("/auth/login")` discards intended URL; no `?next=` round-trip. **CONFIRMED** (line 36 bare redirect).
- BLOCKER CR-03 [layout.tsx:34-44] No `workspace.onboarding_completed_at` gate. **CONFIRMED** (no check anywhere in layout).
- WARN WR-01,02,03,04,05,06 — fail-open DB exception / two round-trips / `workspaceId`+`role` unused / role union dup / no reserved-slug guard / `error=no-access&slug=` echo.
- INFO IN-01,02,03,04 — string concat / `await params` / redundant `await` / file-head comment.

### 08-mfa-setup.md — `mfa-setup-form.tsx`

- CRIT CR-01 [mfa-setup-form.tsx:43-57] Backup codes silently discarded — permanent lockout potential. **CONFIRMED** (line 49 type assertion `{ totpURI?: string }` drops `backupCodes`).
- CRIT CR-02 [mfa-setup-form.tsx:132-144] No QR code rendered — only base32 + URI. **CONFIRMED** (verified file head — only `<code>` blocks).
- CRIT CR-03 [mfa-setup-form.tsx:136-142] Plaintext URI + secret in DOM, not auto-cleared on success. **CONFIRMED** (line 80: `router.push` before `setEnroll(null)`).
- CRIT CR-04 [mfa-setup-form.tsx:55-56,183-190] `extractSecret` duplicates secret into state. **CONFIRMED** (line 55, separate `secret` field on EnrollState).
- WARN WR-01,02,03,04,05,06,07 — hand-rolled type / `submitting` not reset / `??` vs `.message` / `aria-describedby` / `code.length !== 6` weak / error-handling inconsistency / hardcoded redirect.
- INFO IN-01,02,03,04 — 190-line component / `code` reset / brand mentions / Unicode ellipsis.

### 09-audit-redaction.md — `packages/db/src/audit/{redaction-registry,query}.ts`

- CRIT CR-01 [get-detail.ts:32-78] No actor-level authorization; `rationale` not redacted; returns raw `input_json`+`output_json`. **CONFIRMED** (get-detail signature accepts only org+id, no role; line 47 selects `rationale` directly).
- CRIT CR-02 [query.ts:37-39] `ilike` with `%${filters.toolName}%` accepts SQL LIKE metacharacters from user input. **CONFIRMED** (line 38 raw template-literal interpolation; user-supplied `%` is a wildcard match).
- CRIT CR-03 [redact.ts:49-62] `applyRedactions` silently no-ops on non-array wildcard hit. **CONFIRMED** (line 61: "Wildcards on non-arrays are ignored.") — partly mitigated by `applyBaselineKeyRedactions` walker covering universal-PII keys at any depth, but custom per-tool object-keyed paths leak.
- CRIT CR-04 [redaction-registry.ts:24-41 + write-log.ts:78-79] No registry-completeness gate. **CONFIRMED** but **partially mitigated** by baseline key-walker covering 20+ universal-PII keys; the gap is for non-baseline tool-specific fields (e.g. `counterparty_iban`, `birth_date`).
- WARN WR-01,02,03,04,05,06 — `_resetForTests` env compare / Set-equality diff / trailing-wildcard silent / confidence float roundtrip / unbounded pageSize / `new Date(...)` silent NaN.
- INFO IN-01,02,03,04 — `getAllRedactions` defensive copy / 2 roundtrips for count / get-detail xref / dead ternary in write-log.

### 10-killswitch.md — `infra/cdk/lib/lambda/killswitch/index.mjs`

- CRIT CR-01 [killswitch/index.mjs:80-112] SNS trigger source not verified — no `EventSource` / `TopicArn` check. **CONFIRMED** (line 82-83 iterates `event.Records ?? []` with no source guard).
- CRIT CR-02 [killswitch/index.mjs:85-96] Non-JSON catch == budget breach; empty / null / future-format messages stop production. **CONFIRMED** (line 87-95 catch block calls `stopEcsService("budget-breach")`).
- CRIT CR-03 [killswitch/index.mjs:43-67] No locking / `reservedConcurrentExecutions: 1` for concurrent invocations. **CONFIRMED** (no concurrency-1 in CDK security-stack; mitigated partly by ECS idempotency but flap-then-rescale window remains).
- WARN WR-01..08 — `stopEcsService` thrown error halts batch / no DLQ / `NewStateValue` permissive / substring `isKnownAlarm` collision / `services?.[0]` ignores failures / `desiredCount === 0` strict / no Lambda Errors alarm / env-at-cold-start.
- INFO IN-01..05 — missing test coverage / out-of-date comments / over-provisioned timeout & memory / unstructured logs / no PII leak.

---

## Section B — Verified verdict summary

After reading every source file referenced by each BLOCKER / CRITICAL:

| Review | Critical claimed | CONFIRMED | NEEDS DEEPER LOOK | FALSE POSITIVE |
|--------|------------------|-----------|-------------------|----------------|
| 01     | 5                | 5         | 0                 | 0              |
| 02     | 6                | 6         | 0                 | 0              |
| 03     | 3 (BLOCKER)      | 3         | 0                 | 0              |
| 04     | 2                | 2         | 0                 | 0              |
| 05     | 6                | 6         | 0                 | 0              |
| 06     | 4                | 4         | 0                 | 0              |
| 07     | 3                | 3         | 0                 | 0              |
| 08     | 4                | 4         | 0                 | 0              |
| 09     | 4                | 4 (2 partially mitigated by baseline walker) | 0 | 0 |
| 10     | 3                | 3         | 0                 | 0              |
| **Total** | **40**        | **40**    | **0**             | **0**          |

Reviewers were calibrated correctly. No false positives among the BLOCKER /
CRITICAL claims. Two of the audit-redaction critiques (CR-03, CR-04 in 09) are
partially mitigated by `applyBaselineKeyRedactions` which walks by key name at
any depth — the universal-PII baseline (password, token, secret, email, phone,
iban, etc.) is enforced regardless of registration. The remaining exposure is
for tool-specific fields not in the baseline list, and `rationale` (free text),
which IS a real gap.

---

## Section C — Categorization

Severity bar:
- **MUST_FIX_NOW** = ship-blocking: cross-tenant leak, auth bypass, secret
  exposure, irreversible cost runaway, PII regulation violation, or a
  ship-stopping type-check failure.
- **FIX_THIS_PR** = high-quality / defense-in-depth that is cheap to land now.
- **DEFER_TO_FOLLOWUP** = style, naming, premature abstraction, future-proofing,
  large refactors that bleed beyond an overnight pass.

### MUST_FIX_NOW (security + correctness)

| # | File | Finding | Rationale |
|---|------|---------|-----------|
| M1 | `apps/web/app/onboarding/member/actions.ts:66-90` | Add `session.user.email == claims.email` check before reusing session and skipping signUpEmail | Cross-tenant invite acceptance via existing-session bypass (03 BLOCKER + 05 HIGH overlap). |
| M2 | `apps/web/proxy.ts:26-30` + 3 login forms | Sanitize `next` to a same-origin relative path; drop query string | Open redirect post-login (04 CR-01) + sensitive query-string leakage (04 CR-02). |
| M3 | `packages/db/src/tenancy.ts:95-111, 281-325, 156, 172-176` | Restore-fault-tolerance + clear `app.user_id`/`app.workspace_id` when null + abort outer tx on restore failure | Cross-tenant GUC / role leak (01 CRIT 1-4). |
| M4 | `packages/auth/src/tokens/jwt.ts:14-25, 19, 65-100` | Lazy `requireSecret()`, byte-length check, pin `algorithms: ["HS256"]` on verify | Algorithm-confusion class + secret bootstrap fragility (02 CRIT 4-6). |
| M5 | `packages/auth/src/server.ts:46-48` | Fail-closed validation of `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, trim `trustedOrigins` split | BA fallback to known secret in misconfigured prod (02 CRIT 1-2). |
| M6 | `packages/auth/src/invite-issuer.ts:100, 206` + `packages/shared/src/auth/onboarding.ts:67-74` | Normalize email at write+read: `.trim().toLowerCase()` in `issueInvite` and `revokePendingInvites` | Concurrent valid invite tokens via case-mismatch on revoke (03 BLOCKER 2). |
| M7 | `packages/auth/scripts/issue-invite-token.ts:26,31,38,54` | Replace broken `InviteClaims` import with `InviteRecord`; update header comment | Type-check break in dev CLI — `pnpm typecheck` is currently passing only because scripts aren't in the tsc roots; verify and fix. (03 BLOCKER 3.) |
| M8 | `apps/web/app/auth/_lib/materialize-invite.ts:34-43, 81-85, 121-126, 174-180` | Drop `email` + `role` + `organizationId` from input; derive all three from the auth_invite RETURNING; assert email-match against `app_user` row | Caller-controlled role / org escalation surface (06 CR-01, CR-02, CR-03). |
| M9 | `apps/web/app/auth/(default)/invite/actions.ts:88-93` + `apps/web/app/onboarding/member/actions.ts:122-125` | Replace `(err as Error).message` with opaque `acceptInviteFailed`; log discriminator server-side | Token-enumeration leak via distinct error codes (06 CR-04). |
| M10 | `apps/web/app/[orgSlug]/layout.tsx:96-132` | Collapse two queries into single join keyed on `(slug, user_id, active)` so the row is by definition one the user belongs to | Non-deterministic slug routing across workspaces (07 CR-01). |
| M11 | `apps/web/app/auth/mfa/setup/mfa-setup-form.tsx:43-57, 80-84` | Capture `backupCodes` from `twoFactor.enable`; render backup-codes acknowledgement step; clear sensitive state before `router.push` | Permanent MFA lockout + secret-in-DOM (08 CR-01, CR-03). |
| M12 | `packages/db/src/audit/query.ts:37-39, 50, 67, 41, 44` | Validate `toolName` against `^[a-z][a-z0-9_.]*$` + length cap; cap `pageSize`; validate date inputs | Filter bypass via LIKE metachars + DoS via unbounded pageSize (09 CR-02, WR-05, WR-06). |
| M13 | `infra/cdk/lib/lambda/killswitch/index.mjs:80-112` + `infra/cdk/lib/security-stack.ts` | Verify `EventSource === "aws:sns"` and `TopicArn === EXPECTED_TOPIC_ARN`; positive Budget anchor match (not catch-all); pass exact alarm names via env | Spurious production stops from non-Budgets payloads + unverified trigger (10 CR-01, CR-02). |
| M14 | `infra/cdk/lib/security-stack.ts` (KillSwitchFn) | Set `reservedConcurrentExecutions: 1` | Concurrent-invocation race (10 CR-03). |

### FIX_THIS_PR (high quality, cheap, defense-in-depth)

| # | File | Finding | Rationale |
|---|------|---------|-----------|
| F1 | `apps/web/app/onboarding/actions.ts:340-354` | `pickUniqueSlug` add `workspace_id` filter to WHERE | Cosmetically ugly slugs; 50-iteration hard fail (05 HIGH 1). |
| F2 | `apps/web/app/onboarding/actions.ts:330-338` | Enforce min slug length 2 in `slugify` | DB CHECK constraint failure on short input (05 HIGH 2). |
| F3 | `apps/web/app/onboarding/actions.ts:436-459` | Only set `step_3_completed_at` when `sent > 0 || invites.length === 0` | Step marked complete on total failure (05 HIGH 4). |
| F4 | `apps/web/app/onboarding/actions.ts:431` + `packages/auth/src/server.ts:46-48` + `packages/auth/scripts/issue-invite-token.ts:57` | Require `BETTER_AUTH_URL` at module load in production (centralise via shared env schema) | Localhost-in-prod invite emails (03 WARN 5; rolled together with M5). |
| F5 | `packages/auth/src/tokens/jwt.ts:65-100, 80, 51, 95-99` | Add `clockTolerance: 30`, parse payload via zod, use `.setExpirationTime(`${ttlSeconds}s`)`, collapse trailing catch to flat `INVALID` | Token verify hardening (02 HIGH cluster). |
| F6 | `apps/web/app/auth/_lib/materialize-invite.ts:62, 187-189` | Import `hashInviteToken` from `@workspace/auth/tokens` instead of local `sha256` | Cryptographic helper duplication (06 IN-02). Tiny risk: hashes diverge if one is upgraded. |
| F7 | `apps/web/app/auth/_lib/materialize-invite.ts:147, 176` | Assert `org.workspace_id === inviteRow.workspace_id` after org lookup | Workspace-misroute defence-in-depth (06 WR-03). |
| F8 | `apps/web/app/[orgSlug]/layout.tsx:33` | Reserved-slug guard + slug-regex pre-check before query | DoS amplifier on bot scans (07 WR-05). |
| F9 | `apps/web/app/[orgSlug]/layout.tsx:38-44` | Wrap `resolveMembership` in try/catch → redirect to `/workspace?error=internal` on DB throw | Fail-closed on transient DB errors (07 WR-01). |
| F10 | `apps/web/proxy.ts:13-18, 9-10` | Fix docstring claims (`getSessionCookie` is presence-only, not signed-validated; drop `(app)` route-group reference) | Future-maintainer trap (04 WR-01, WR-02). Bundles with M2 commit. |
| F11 | `apps/web/proxy.ts:24` | Pin `cookieName` + `cookiePrefix` from a shared constant matching `@workspace/auth/server` | Silent log-out on prefix drift (04 WR-05). |
| F12 | `packages/db/src/audit/redaction-registry.ts:63-68` | `_resetForTests` invert env check — require `NODE_ENV === "test"` or `VITEST` | Drift-prone string compare (09 WR-01). |
| F13 | `packages/db/src/audit/redact.ts:49-62` | Extend wildcard branch to walk object values too (not only Array.isArray) + reject trailing `*` at registration | Object-keyed PII leakage (09 CR-03 fix). |
| F14 | `packages/db/src/audit/get-detail.ts` + caller | Add `callerRole` arg, gate on owner/admin, write audit event on detail read; redact `rationale` via `applyBaselineKeyRedactions` | Audit-detail PII surface (09 CR-01 — full fix is L; minimum here is the role gate + rationale redaction, which is M). |
| F15 | `infra/cdk/lib/lambda/killswitch/index.mjs:104` | Replace substring `isKnownAlarm` with allowlist from env (`KILL_SWITCH_ALARM_NAMES`) | Name-collision risk (10 WR-04; rolled with M13). |
| F16 | `infra/cdk/lib/lambda/killswitch/index.mjs:43-67, 80-112` | Wrap per-record action in try/catch; check `svc.status === "ACTIVE"` + `typeof svc.desiredCount === "number"`; surface `failures` field from DescribeServices | Observability + fail-safe handling (10 WR-01, WR-05, WR-06). |
| F17 | `infra/cdk/lib/security-stack.ts` | Add DLQ on the Lambda subscription + CloudWatch alarm on the Lambda's own `Errors` metric | Alarm-on-the-alarm-handler (10 WR-02, WR-07). |
| F18 | `apps/web/app/auth/mfa/setup/mfa-setup-form.tsx:67-70` | Tighten OTP guard to `^\d{6}$` regex | Wastes BA rate-limit budget; better error UX (08 WR-05). |
| F19 | `apps/web/app/auth/mfa/setup/mfa-setup-form.tsx:73-84` | Use `try/finally` consistently in `onSubmitVerify` | Stuck-disabled button on slow nav (08 WR-02). |
| F20 | `apps/web/app/auth/(default)/login/login-email-form.tsx, login-password-form.tsx, login-mfa-form.tsx` | Apply `safeNext()` helper inline to client-side `router.push(next)` and `callbackURL` | Belt-and-braces for M2; the proxy fix is matcher-excluded for `/auth/login` so the consumer-side guard is load-bearing. |
| F21 | `packages/db/src/tenancy.ts:78-81, 23 (index export)` | Drop `AdminBypassBound` from public surface | Footgun + asymmetry (01 MED 3). |
| F22 | `apps/web/app/onboarding/member/actions.ts:141-146` + `apps/web/app/onboarding/actions.ts:220-225` | Dedupe `isEmailAlreadyRegistered` into `apps/web/app/auth/_lib/` and document BA-version drift risk | Duplicate helper between owner/member; bundles with M1 commit naturally. |

### DEFER_TO_FOLLOWUP (with rationale)

Everything below is either too large for an overnight pass, low-risk, or
structural. Items the reviewers raised that I am NOT actioning now:

| # | File / Theme | Reason for deferral |
|---|--------------|---------------------|
| D1 | Signup-token persistence + single-use enforcement (05 CRIT 1) | Requires new `auth_signup` table + migration + revocation flow. L+. Real fix; not overnight-shaped. Mitigation today: signup tokens are 14-day TTL minted by admin — narrow attacker model. |
| D2 | `submitWorkspaceAction` idempotency (05 CRIT 3) | Requires either DB partial unique index on `(created_by_user_id, step_1_completed_at IS NOT NULL)` OR a Redis-backed lock. L. Bundle with D1's auth_signup migration. |
| D3 | `submitTeamAction` org lookup uses active-org cookie + RBAC role check (05 CRIT 4) | Today there is only ever one org per workspace (workspace step seeds it). Defensible in the short run. L when multi-org UI lands. |
| D4 | `applyRedactions` registry-completeness gate (09 CR-04, full version) | Needs a tool-catalog enumeration + boot-time assert hooked from the same entrypoint that wires the catalog. The codebase doesn't have a "tool catalog" entrypoint yet. M+, but blocked on a design decision. Baseline key walker covers the universal-PII case TODAY. |
| D5 | Atomic `revokePendingInvites + issueInvite` (03 WARN 1) | Architectural — pull both into a `replacePendingInvite()` helper inside one `withAdminBypass`. M. Worthwhile but not ship-blocking; race window is sub-second. |
| D6 | `readInviteByRawToken` discriminated return for non-pending statuses (03 WARN 3) | Changes the public surface of `invite-issuer`; both callers depend on the current return shape. M+. Bundle with D5. |
| D7 | HMAC-with-separate-key on `hashInviteToken` (03 WARN 4) | New env var + key rotation policy + migration to re-hash. L. Defer. |
| D8 | Rate-limit middleware on `/auth/invite/start` and Better Auth `rateLimit` (02 CRIT 3 partial, 03 WARN 7) | Better Auth has `rateLimit` config — adding it is XS, but verifying it does not break tests is M. Move to follow-up to keep this PR focused. Manual mitigation: trust ALB / Cloudflare today. |
| D9 | `requireEmailVerification: true` (02 CRIT 3 partial) | UX decision — every signup currently auto-signs-in. Flipping `requireEmailVerification` breaks onboarding step 3. Needs an ADR. |
| D10 | zxcvbn / pwned-passwords integration (02 HIGH) | New dep + perf budget. Defer with ADR. |
| D11 | Refactor `actions.ts` into per-step files (05 MED 6) | Large refactor (525 lines → 8 files). Test rewrite. Big diff. Defer. |
| D12 | Materialize-invite split: auth_invite UPDATE under `withAdminBypass`, membership writes under `withOrganization` (06 WR-06) | Architecturally desirable but trades atomicity for tenancy purity — needs a design decision before changing. Defer. |
| D13 | Three-helper consolidation in tenancy.ts (`withGucScope` abstraction) (01 MED) | Reviewer explicitly recommends skipping; CLAUDE.md says "three similar lines > one helper used once." |
| D14 | Onboarding-completion gate in `[orgSlug]/layout.tsx` (07 CR-03) | Full version: extend `resolveMembership` to JOIN `workspace.onboarding_completed_at` + `app_user.profile_completed_at`, return a discriminated union, call `resolveNextStep()` on `needs_onboarding`. L. Minimum-viable today: dashboard route is a stub — actual data-exposure surface is zero. Real fix in the next PR alongside dashboard pages. |
| D15 | Sibling `apps/web/app/workspace/layout.tsx` same `redirect("/auth/login")` losing-URL bug | Out of scope per review 07's own note; cherry-pick into the same commit as M2 if effort allows. Otherwise follow-up. |
| D16 | MFA setup: render QR code (08 CR-02) | New dep (`qrcode` server-side or `qrcode.react` client-side). M, but it widens the PR surface (`pnpm-lock.yaml` change + bundle-size review). Defer behind a separate UX-focused PR. |
| D17 | MFA setup: `extractSecret` removal + state cleanup (08 CR-04) | Bundles with D16; isolating the secret to a single `useMemo` over `totpURI` only makes sense after the QR fix lands. Defer. |
| D18 | `applyBaselineKeyRedactions` over `rationale` field at write time (09 CR-01 partial) | F14 lands the gate at READ time. Writing the censor at write time is desirable too but means changes in `updateToolCallLogOutput`. M. Defer to a redaction-hardening follow-up alongside D4. |
| D19 | DescribeServices `failures[]` surfacing + more killswitch test cases (10 IN-01, WR-05) | Tests are advisory; bundle with F16 commit if zero conflict, otherwise follow-up. |
| D20 | Drop dynamic i18n import in onboarding `loadBrandName` (05 MED) | Cosmetic; runtime impact ~0. Defer. |
| D21 | Tenancy: timeout/AbortSignal on `withAdminBypass`, typed `executeRow` helper, role-via-`sql.identifier`, `Symbol.for` asymmetry (01 HIGH/MED) | Hardening; not ship-blocking. The restore-finally fix in M3 is the load-bearing part. Defer. |

---

## Section D — Execution order (commit plan)

Commits group fixes that touch the same file or share a contract. Order is:
(a) blast radius (security blockers first), (b) shared-file co-location,
(c) dependency chain — token verify must land before signup-cookie callers can
rely on stricter behaviour; tenancy fixes must land before any caller can be
trusted to use the helpers.

Each commit is a self-contained `pnpm typecheck && pnpm test` green target.

### Commit 1 — `fix(db): fault-tolerant GUC restore + explicit user_id/workspace_id clears in tenancy`

Items: **M3** (tenancy 4 critical findings) + F21 (drop `AdminBypassBound` from public surface — same file).

Sketch:
- `packages/db/src/tenancy.ts:95-111` — wrap each of the three `tx.execute(sql\`SELECT set_config…\`)` calls in its own try/catch inside `restorePriorGucs`; accumulate failures into an array; after all three return, if any failed, force `tx.execute(sql\`ROLLBACK\`)` and throw an `AggregateError` with the original `fn` error as the leading cause.
- Mirror the same pattern at lines 315-323 for the `SET LOCAL ROLE` restore in `withAdminBypass`.
- Add `else { await tx.execute(sql\`SELECT set_config('app.user_id', '', true)\`) }` at line 156-158 (when `userId == null` in `withOrganization`).
- Add the equivalent fallback clear at line 172-176 for `workspace_id` when the row's `workspace_id` is null/empty: `await tx.execute(sql\`SELECT set_config('app.workspace_id', '', true)\`)`.
- Drop `AdminBypassBound` from `packages/db/src/index.ts` re-export list. Verify no consumer breaks (grep returned only the declaration site per the review note).

Test: `packages/db/tests/onboarding-flow.test.ts` is the existing tenancy integration test; add a case where the inner `fn` succeeds but `restorePriorGucs` throws (mock the third execute to reject) — assert the outer tx is rolled back and the next outer statement does not see the inner GUC. Add a case for `withOrganization(orgId, null, ...)` with an outer `app.user_id` set, asserting it is cleared inside the body.

Size: **M-L** (testcontainer turnaround dominates; logic change is ~30 lines).

### Commit 2 — `feat(auth): lazy secret, byte-length check, HS256 allowlist + env validation`

Items: **M4** (jwt.ts critical) + **M5** (server.ts critical) + F4 (BETTER_AUTH_URL prod-required, centralized) + F5 (jwt verify hardening).

Sketch:
- `packages/auth/src/tokens/jwt.ts` — replace module-load IIFE at line 14-25 with `let cached: Uint8Array | null = null` and a lazy `requireSecret()` that resolves env at call-time. Inside, check `new TextEncoder().encode(raw).length >= 32` (bytes, not chars). Add `algorithms: ["HS256"]` + `clockTolerance: 30` to `jwtVerify` options. Drop `as unknown as TClaims` — accept a `parse: (raw: unknown) => TClaims` argument and have callers (`tokens/signup.ts`, `tokens/invite.ts`, `tokens/login-email.ts`) pass a zod parser. Collapse the trailing `catch` to a flat `new TokenError("Invalid token", "INVALID")`. Replace manual epoch math at line 51 with `.setExpirationTime(\`${ttlSeconds}s\`)`.
- `packages/auth/src/server.ts:46-48` — extract `const SECRET`, `const BASE_URL`, `const TRUSTED_ORIGINS` constants at top of file; throw if `SECRET` missing or under 32 bytes; require `BASE_URL` when `NODE_ENV === "production"` (allow dev fallback to localhost); `.split(",").map(s => s.trim()).filter(Boolean)` for trusted origins.
- Centralize: add `getBaseUrl()` in `packages/auth/src/env.ts` (new file or reuse existing) and import from both `apps/web/app/onboarding/actions.ts:431` and `packages/auth/scripts/issue-invite-token.ts:57`.

Test: extend `packages/auth/src/tokens/jwt.test.ts` to drop `vi.resetModules` between tests; add cases for wrong-issuer, wrong-audience, `alg:none` rejection, byte-length boundary. Drop the resetModules calls everywhere they appear in the existing test file.

Size: **L**. The zod payload parser change touches every caller of `verifyToken`; expect 4-6 files.

### Commit 3 — `fix(auth): broken InviteClaims import + email normalization on invite write/revoke`

Items: **M6** (email normalize in `issueInvite` + `revokePendingInvites`) + **M7** (dev CLI broken `InviteClaims` import).

Sketch:
- `packages/auth/scripts/issue-invite-token.ts:21-27` — replace `import type { InviteClaims }` with `import type { InviteRecord } from "../src/tokens/invite"`; replace all `InviteClaims["role"]` with `InviteRecord["role"]`. Update the header docstring (lines 2-7) to remove the "sign the JWT" prose — opaque tokens now.
- `packages/auth/src/invite-issuer.ts:100` — `email: input.email.trim().toLowerCase(),`.
- `packages/auth/src/invite-issuer.ts:198-213` — at top of `revokePendingInvites`, `const email = input.email.trim().toLowerCase()` then use `email` in the WHERE.
- `packages/shared/src/auth/onboarding.ts:67-74` — `InviteRowSchema` add `.toLowerCase()` on the email field for the second-line defence.

Test: `packages/auth/src/invite-issuer.test.ts` (or create) — assert that issuing with `"Foo@Bar.com"` writes `"foo@bar.com"` and that `revokePendingInvites({ email: "Foo@Bar.com" })` flips the lower-cased row.

Size: **S**.

### Commit 4 — `fix(auth): email-match invariant in member invite flow + dedup helper`

Items: **M1** (member-flow email-match BLOCKER) + **F22** (dedup `isEmailAlreadyRegistered`).

Sketch:
- `apps/web/app/onboarding/member/actions.ts:66-90` — after `auth.api.getSession(...)`, if `session?.user?.email?.toLowerCase() !== claims.email.toLowerCase()` return `{ ok: false, errorKey: "inviteEmailMismatch" }`.
- Move `isEmailAlreadyRegistered` from both `apps/web/app/onboarding/member/actions.ts:141-146` and `apps/web/app/onboarding/actions.ts:220-225` into `apps/web/app/auth/_lib/email-error.ts`; both files import it. Document the BA-version-drift risk in a comment.
- Add `inviteEmailMismatch` to the `auth.errors` i18n keys and to the union in `errorKey` (loose for now — no enum type yet).

Test: add a case to whatever member-flow integration test exists (or create one) that: logs in as A, opens an invite for B in cookie, calls `submitMemberPasswordAction`, asserts `errorKey === "inviteEmailMismatch"` and that NO `organization_membership` row was created.

Size: **M**.

### Commit 5 — `fix(invite): caller-controlled role/org/email → derive from auth_invite row`

Items: **M8** (materialize-invite trusts caller for role/org/email) + **F6** (reuse `hashInviteToken`) + **F7** (workspace_id cross-check).

Sketch:
- `apps/web/app/auth/_lib/materialize-invite.ts:32-43` — drop `organizationId`, `role`, `email` from `MaterializeInviteInput`. Keep `userId` + `inviteRawToken` only.
- Lines 81-85 — RETURNING add `role: auth_invite.role, email: auth_invite.email`.
- After RETURNING, look up `app_user.email` for `input.userId`, assert match against `inviteRow.email` case-insensitively. Throw `InviteAcceptError("invite-not-found")` on mismatch.
- Line 118 — use `inviteRow.organization_id` (not `input.organizationId`) in the org lookup. Drop the line 121-126 check (structurally impossible after this change).
- Lines 147, 176 — assert `org.workspace_id === inviteRow.workspace_id` before either insert.
- Line 174-180 — write `role: inviteRow.role` (cast through `as InviteRecord["role"]`).
- Replace local `sha256` at line 62 + 187-189 with `import { hashInviteToken } from "@workspace/auth/tokens"`; delete the local helper.
- Update callers `apps/web/app/auth/(default)/invite/actions.ts:77-84` and `apps/web/app/onboarding/member/actions.ts:115-121` to pass only `{ userId, inviteRawToken }`.

Test: extend the existing invite test (or add one) — pass a wrong `organizationId` should produce same error as a valid one (since the field is gone, this is now a non-call-shape).

Size: **L** (touches 3 files, contract change for two callers, type changes propagate to tests).

### Commit 6 — `fix(invite): opaque error to client; preserve discriminator in logs`

Items: **M9** (token-enumeration leak via error message).

Sketch:
- `apps/web/app/auth/(default)/invite/actions.ts:87-93` — replace `(err as Error).message` with the fixed string `"Could not accept invitation."`. Log the original error including the InviteAcceptError code via `console.error("[auth/invite] acceptInviteAction failed", err)`.
- `apps/web/app/onboarding/member/actions.ts:122-125` — already returns generic `errorKey: "acceptInviteFailed"`. Verify and add a `console.error` if missing.

Test: assert that a revoked/accepted/expired/not-found token all return the same opaque error string to the client.

Size: **XS**.

### Commit 7 — `fix(onboarding): per-workspace slug + min-length + complete-on-success-only`

Items: **F1** (per-workspace slug) + **F2** (slugify min length) + **F3** (step_3_completed_at gate).

Sketch:
- `apps/web/app/onboarding/actions.ts:340-354` — `pickUniqueSlug(db, workspaceId, base)`: add `workspace_id` arg, AND it into the WHERE. Caller at line 284 passes `ws.id`.
- `slugify` (line 330-338) — if result length < 2, return `"workspace"`. Add `MAX_SLUG_ATTEMPTS = 50` constant for clarity.
- `submitTeamAction` (line 461-470) — wrap the `step_3_completed_at` update with `if (sent > 0 || parsed.data.invites.length === 0)`; otherwise return `{ ok: false, errorKey: "saveTeamFailed", failures }` so the user retries.

Test: extend onboarding-flow test with (a) two workspaces same display name → both get slug `acme`; (b) display name `"A"` → slug `"workspace"`; (c) all invites fail → step_3 stays null.

Size: **M**.

### Commit 8 — `fix(proxy+forms): sanitize next, drop query string, pin cookie config`

Items: **M2** (open redirect + query-string leak) + **F10** (proxy docstring fixes) + **F11** (cookie config pinned) + **F20** (consumer-side safeNext in 3 login forms).

Sketch:
- Create `apps/web/lib/safe-next.ts` exporting `safeNext(raw: string | null, fallback?: string): string`. Logic: must start with `/`, not `//`, not `/\`, not `/^\/[A-Za-z][A-Za-z0-9+.-]*:/`.
- `apps/web/proxy.ts:23-34` — replace `intended = request.nextUrl.pathname + request.nextUrl.search` with `intended = request.nextUrl.pathname`; pass through `safeNext`. Fix the `(app)` docstring reference (lines 9-10) and the "Better Auth signs the session cookie" overclaim (lines 13-18).
- `apps/web/proxy.ts:24` — import `SESSION_COOKIE_NAME` + `SESSION_COOKIE_PREFIX` (or equivalent) from a new shared constant in `@workspace/auth/shared` (add the export if it doesn't exist; falls back to BA defaults).
- `login-email-form.tsx:54`, `login-password-form.tsx:36, 64, 72, 76`, `login-mfa-form.tsx:35, 66` — wrap every `search.get("next")` read in `safeNext(...)`. Apply to both `router.push(next)` and `callbackURL: next`.

Test: unit test `safe-next.ts` with a fixture of malicious inputs (`//evil.com`, `https://evil.com`, `/\\evil.com`, `/javascript:`, `/legit-path?foo=bar`). Assert that `safeNext` collapses to fallback for the first four and preserves the fifth.

Size: **M**.

### Commit 9 — `fix(orgSlug-layout): join-based resolver, reserved-slug guard, fail-closed`

Items: **M10** (join + per-workspace slug) + **F8** (reserved-slug pre-check) + **F9** (fail-closed on DB throw).

Sketch:
- `apps/web/app/[orgSlug]/layout.tsx:33` — add `SLUG_RE` + `RESERVED` constants; if either guard fails, redirect to `/workspace?error=invalid-slug` immediately.
- `apps/web/app/[orgSlug]/layout.tsx:38-44` — wrap `resolveMembership` in try/catch → log + `redirect("/workspace?error=internal")` on DB error. (Do NOT wrap the redirect call itself — see review note about `NEXT_REDIRECT`.)
- `apps/web/app/[orgSlug]/layout.tsx:96-132` — collapse two queries into one inner-join on `organization_membership` ↔ `organization` keyed on `(slug, user_id, active)`. Return `null` if no row.

Test: extend `[orgSlug]/layout.test.ts` if exists, else add a server-component test that: (a) two workspaces have org slug `acme`, user belongs to ws B → user lands on ws B's org; (b) user passes `/admin` → 302 to `/workspace?error=invalid-slug` with zero DB calls; (c) DB rejects → 302 to `/workspace?error=internal`.

Size: **M**.

### Commit 10 — `fix(audit): toolName whitelist + pageSize cap + date validation + wildcard walks objects + role-gated detail`

Items: **M12** (query.ts filter/page/date validation) + **F12** (`_resetForTests` env compare) + **F13** (wildcard objects + reject trailing `*`) + **F14** (role gate on `getAuditDetail` + redact `rationale`).

Sketch:
- `packages/db/src/audit/query.ts:37-39` — validate `filters.toolName` against `/^[a-z][a-z0-9_.]*$/i` AND `length <= 64`; throw on miss. Replace `ilike` with `eq(tool_call_log.tool_name, filters.toolName)` (no prefix wildcard needed for a finite registry of values).
- Lines 50, 67 — `const MAX_PAGE_SIZE = 200; const effectivePageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, pageSize))`.
- Lines 41, 44 — `parseISODateOrThrow(field, value)`.
- `packages/db/src/audit/redact.ts:49-62` — in the `head === "*"` branch, after the `Array.isArray` walk, fall through `else if (typeof node === "object" && node !== null)` and walk `Object.values(node)`. Add a registration-time check in `registerToolRedactions` that rejects paths ending in `.*` or being just `*`.
- `packages/db/src/audit/redaction-registry.ts:63-68` — invert env check: throw unless `NODE_ENV === "test"` or `process.env["VITEST"]` is set.
- `packages/db/src/audit/get-detail.ts:32-78` — accept `callerRole: "owner" | "admin"` in input; throw otherwise. Wrap returned `rationale` via `applyBaselineKeyRedactions({ rationale: r.rationale }, ...)?.rationale ?? null` so universal-PII keys nested in rationale text would be redacted (if structured) — note: rationale is text, so this is a no-op unless the field stores JSON, which it does not today; the load-bearing change is the role gate.

Test: extend `packages/db/tests/redaction.test.ts` with: (a) `toolName: "%"` rejected by validation; (b) wildcard against `{lines: {0: {iban: "..."}, 1: {iban: "..."}}}` redacts both IBANs; (c) `pageSize: 10_000_000` capped at 200; (d) `getAuditDetail` with `callerRole: "member"` throws; (e) registration of `["foo.*"]` throws.

Size: **L** (touches 4 files in the audit package + a caller for `getAuditDetail`).

### Commit 11 — `feat(killswitch): trigger source verification + positive Budget match + reservedConcurrency + alarm allowlist`

Items: **M13** (event source + positive Budget match) + **M14** (`reservedConcurrentExecutions: 1`) + **F15** (alarm allowlist via env) + **F16** (per-record try/catch + status checks).

Sketch:
- `infra/cdk/lib/lambda/killswitch/index.mjs:80-112` — inside the `for` loop: skip if `record.EventSource !== "aws:sns"`; skip if `EXPECTED_TOPIC_ARN` is set and `record.Sns?.TopicArn !== EXPECTED_TOPIC_ARN`. Replace `catch {}` with positive Budget anchor check via `isBudgetNotification(raw)` (contains `"AWS Budget Notification"` or `"AWSBudgets"`). Require `newState === "ALARM"` exactly. Wrap each per-record action in try/catch and push an `{ action: "error", reason }` result on throw.
- Replace `isKnownAlarm` substring matching with `new Set(process.env.KILL_SWITCH_ALARM_NAMES.split(","))` allowlist.
- Tighten ECS guards: `if (typeof svc.desiredCount !== "number")` → skip; `if (svc.status !== "ACTIVE")` → skip; log `failures` field from DescribeServices.
- `infra/cdk/lib/security-stack.ts` — set `reservedConcurrentExecutions: 1` on `KillSwitchFn`. Inject `EXPECTED_TOPIC_ARN: this.killSwitchTopic.topicArn` + `KILL_SWITCH_ALARM_NAMES: [..."].join(",")` into the Lambda env.

Test: extend `infra/cdk/tests/killswitch-handler.test.ts` with: (a) empty `Sns.Message` → skip, not stop; (b) `EventSource: "aws:s3"` → skip; (c) `TopicArn` mismatch → skip; (d) ECS throws → `result.action === "error"`; (e) `desiredCount: undefined` → skip; (f) alarm name not in allowlist → skip even if it contains a known substring.

Size: **L** (handler logic + CDK env + 6 new test cases).

### Commit 12 — `chore(killswitch): DLQ + Lambda Errors alarm`

Items: **F17** (DLQ + alarm-on-the-alarm-handler).

Sketch:
- `infra/cdk/lib/security-stack.ts` — add `Queue` (`KillSwitchDlq`, 14-day retention, enforceSSL). Wire it into the `LambdaSubscription`.
- `infra/cdk/lib/observability-stack.ts` (or security-stack) — `Alarm` on `AWS/Lambda Errors` for `KillSwitchFn` with action on `BillingTopic`.

Test: `cdk synth` snapshot test that the synthesized template includes the DLQ + alarm resources.

Size: **M**.

### Commit 13 — `fix(mfa-setup): surface backup codes + tighten OTP + clear state on success`

Items: **M11** (backup codes + state cleanup) + **F18** (OTP regex) + **F19** (`finally` consistency).

Sketch:
- `apps/web/app/auth/mfa/setup/mfa-setup-form.tsx:24-27` — extend `EnrollState` to include `backupCodes: string[]`.
- Lines 43-57 — narrow `result.data` via a typed assertion that includes `backupCodes: string[]`; if missing or empty, set error and abort. Set `setEnroll({ totpURI, secret: extractSecret(totpURI), backupCodes: data.backupCodes })`.
- Add a new intermediate stage `"backup"` between `"password"` and `"verify"` (so `Stage` becomes `"password" | "backup" | "verify"`). The backup stage renders the codes with copy-and-acknowledge buttons; only after the user confirms can they advance to `"verify"`.
- Lines 73-84 — refactor `onSubmitVerify` to use `try { ... } catch { ... } finally { setSubmitting(false) }`. Before `router.push`, call `setEnroll(null)` + `setCode("")` + `setPassword("")` to scrub sensitive state.
- Line 67-70 — replace `code.length !== 6` with `!/^\d{6}$/.test(code)`.

Test: add a Storybook story or React Testing Library test that asserts the backup-codes stage renders when `enroll.backupCodes.length > 0` and the Confirm button on the verify stage is disabled until the backup-codes ack is checked.

Size: **L** (new stage + state lifecycle + tests; this is the single biggest UI change in the PR).

---

## Section E — Tradeoffs

For every fix above where there is a defensible second approach, here is the
comparison. I am picking one and shipping; the runner-up lives here so a future
revisit doesn't relitigate.

### E.1 — Tenancy restore-fault tolerance (M3)

| Option | Behaviour on restore failure | Pros | Cons | Decision |
|--------|------------------------------|------|------|----------|
| **A. Force outer ROLLBACK + AggregateError (chosen)** | Abort the whole outer tx; rethrow with original cause | Fails closed at the connection level; no stale GUC can be reused; matches "trust nothing" stance | One more await in the unhappy path; AggregateError requires Node 18+ (already met) | **CHOSEN** |
| B. Try every restore individually, return aggregated error but commit happy path | Leaves outer tx in a "GUC restored where possible" state | Less invasive | A partial restore is exactly the bug we're fixing; this option does not solve it | Rejected |
| C. Recreate the connection (release + reacquire) | Pool-level reset | Bulletproof | Drizzle doesn't expose connection-handle replacement mid-transaction; doable only at the pool layer | Rejected (out of scope) |

### E.2 — `next` sanitization location (M2 / F20)

| Option | Where sanitization happens | Pros | Cons | Decision |
|--------|----------------------------|------|------|----------|
| **A. Both edge proxy AND login forms (chosen)** | Proxy strips on emit; forms call `safeNext` on consume | Belt-and-braces; login route is matcher-excluded so consumer side is load-bearing | Two places to keep in sync | **CHOSEN** — the proxy fix is necessary but insufficient |
| B. Proxy only | One place | Login form attackers bypass proxy entirely (matcher excludes `/auth/*`) | Rejected |
| C. Login forms only | Surface where it's used | Misses the case where another consumer reads `?next=` | Rejected |

### E.3 — Materialize-invite contract change (M8)

| Option | Inputs accepted | Pros | Cons | Decision |
|--------|-----------------|------|------|----------|
| **A. Derive role/email/org from RETURNING; accept only `{userId, rawToken}` (chosen)** | Minimal | Caller cannot inject role; structurally impossible to materialize against wrong org | 2 callers must change; signature break | **CHOSEN** |
| B. Keep current shape, add asserts | Same | Smaller diff | Caller bugs still possible — failure mode is "throw on miss", which is the current state in CR-03; doesn't actually fix the root cause | Rejected |
| C. Single-use enforcement via Redis | Adds replay protection | Belt-and-braces against double-redeem | New infra dep; bundled with D5 follow-up | Deferred |

### E.4 — Email normalization (M6) — where to lowercase

| Option | Lowercase happens in | Pros | Cons | Decision |
|--------|----------------------|------|------|----------|
| **A. Both Zod schema AND issueInvite/revoke (chosen)** | Two layers | Defense-in-depth; covers programmatic callers that skip the schema | Two places | **CHOSEN** |
| B. Zod schema only | One source of truth at validation | Doesn't help admin scripts that bypass the schema | Rejected |
| C. DB trigger only | One source of truth at storage | Trigger already lowercases on INSERT — but caller passes mixed case in WHERE on UPDATE, so trigger doesn't help the revoke path | Rejected |

### E.5 — Audit `toolName` filter (M12 / CR-02)

| Option | How filter handles user input | Pros | Cons | Decision |
|--------|-------------------------------|------|------|----------|
| **A. Validate as `[a-z][a-z0-9_.]*` then use `eq()` (chosen)** | Reject + exact match | Smallest blast radius; matches the finite tool registry; trigram index unnecessary | Drops prefix-search feature (not currently in the product) | **CHOSEN** |
| B. Validate as same regex then keep `ilike`/`%X%` | Reject + substring | Preserves prefix search | Trigram index is still consumable in DoS scenarios, just less so | Rejected (no consumer needs substring) |
| C. Escape LIKE metachars (`%` → `\%`, `_` → `\_`) | Allow any toolName but escape | Most permissive | Adds an escape function + tests; complexity for zero product value | Rejected |

### E.6 — Killswitch alarm allowlist (M13 / F15)

| Option | How known alarms are matched | Pros | Cons | Decision |
|--------|------------------------------|------|------|----------|
| **A. Exact match against env-injected Set (chosen)** | `Set.has(alarmName)` populated from `KILL_SWITCH_ALARM_NAMES` env var | Makes the invariant load-bearing in CDK; failures fail-closed | Two places to update when adding an alarm: handler env + addAlarmAction in CDK | **CHOSEN** |
| B. Pass alarm name through SNS message attributes | Subscribe with `RawMessageDelivery: true`; read attributes | Decouples handler from CDK | Requires `Raw` mode + a CDK change; doesn't help with non-Budgets path | Rejected |
| C. Keep substring matching | What's there today | Zero change | Future contributor can collide naming and trigger production stop | Rejected |

### E.7 — MFA backup codes UX (M11 / CR-01)

| Option | When/how user sees backup codes | Pros | Cons | Decision |
|--------|---------------------------------|------|------|----------|
| **A. New `"backup"` stage between password and verify, with ack checkbox (chosen)** | Codes are stored in `EnrollState` and rendered on a dedicated stage; user must check "I've saved these" to proceed | Industry-standard pattern; matches GitHub / GitLab / 1Password flows | One more stage + state; the JSX grows | **CHOSEN** |
| B. Show codes on the same screen as TOTP verify | Same `verify` stage with codes at the top | Smaller diff | User reads OTP from app, misses the codes scrolled above, hits Confirm without saving | Rejected |
| C. Email backup codes after verify | Server emails them post-`verifyTotp` | Belt-and-braces if user closes the tab | Email is the second factor in many threat models — bad pattern | Rejected |

### E.8 — Audit detail authorization (F14 / CR-01)

| Option | Who can read `getAuditDetail` | Pros | Cons | Decision |
|--------|-------------------------------|------|------|----------|
| **A. Require `callerRole: "owner" | "admin"` (chosen, minimum)** | Caller passes role; function throws otherwise | Cheap, defense-in-depth at the DB layer | Requires caller (tRPC procedure / server action) to compute role first — currently not wired | **CHOSEN** for this PR |
| B. Same as A + write an `audit_event` row recording the access | Full audit-of-audit trail | DORA-aligned | Needs a new table or schema decision; defer | Deferred (D18) |
| C. Filter by `actor_kind = 'user' AND user_id = caller_user_id` | A member sees only their own | Strictest | Breaks the operational use case (admin investigates teammate's actions) | Rejected — wrong product fit |

---

## Section F — Final summary

- **Total findings across 10 reviews** — 181 (40 BLOCKER/CRITICAL, ~63 WARNING/HIGH, ~78 MEDIUM/INFO).
- **CONFIRMED BLOCKER/CRITICAL** — 40 / 40. Zero false positives; two of the audit findings are partially mitigated by `applyBaselineKeyRedactions` but the residual gap is real.
- **MUST_FIX_NOW** — 14 items (M1-M14). Cross-tenant leaks, auth bypass, open redirect, cost-runaway hole, MFA lockout.
- **FIX_THIS_PR** — 22 items (F1-F22). Defense-in-depth, type/style hardening, observability.
- **DEFER_TO_FOLLOWUP** — 21 items (D1-D21). Larger refactors, design-decision dependencies, rate-limiting policy, signup-token persistence, multi-org RBAC, MFA QR code, structural reorganizations.
- **Expected commit count** — **13 commits**. Each is targeted at a single shared file or contract. The largest two are Commit 2 (auth core: jwt + server.ts + env centralization, "L") and Commit 13 (MFA backup-codes stage, "L"). The rest are S-M.

### Test / typecheck / build risk

- `pnpm typecheck` — Commits 2, 5, 8, 10 change exported type surfaces. Each is structurally simple (drop fields, add fields, narrow unions). Risk: a downstream caller of `materializeInvite` or `verifyToken` outside the verified callsites is missed. Mitigation: I grepped `materializeInvite` callers (2 callsites confirmed) and `verifyToken` callers (signup, invite, login-email) — all covered.
- `pnpm test` — Commit 1 (tenancy) requires testcontainer turnaround. Commit 11 (killswitch) adds 6 test cases. Commit 13 (MFA) needs new component tests. Otherwise existing tests should pass unchanged; behavior changes are additive guardrails. Risk-rated **medium**: the tenancy restore-failure tests are new behavior, but the happy path is unchanged.
- `pnpm build` — No bundle changes from runtime imports; no new deps (QR-code library deferred to D16). Risk-rated **low**.

Overall I expect ~13 commits, all individually green. If any single commit goes
red on `pnpm test`, the most likely culprits are Commit 1 (tenancy testcontainer
flakes), Commit 2 (zod parser propagation to test fixtures), or Commit 5
(materialize-invite contract change rippling into invite tests).
