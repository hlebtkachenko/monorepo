# AFF-150 audit context — staging auth/onboarding/admin debug pack

> **Purpose:** durable cross-session context for the AFF-150 staging cleanup work.
> Written 2026-05-18 after the morning's two deploys (commits `58df063` + `4ec2778`)
> so a fresh Claude session can pick up without re-reading the entire repo. Includes
> dependency graphs, debug map, Linear state, staging access model, and the audit
> punch-list.
>
> **Tracked in Linear:** [AFF-150](https://linear.app/hapddev/issue/AFF-150). When that
> issue closes, delete this file (per `docs/plans/README.md` convention).
>
> **Source audit file (gitignored):** `.context/attachments/aff-150-session-audit.md`.

---

## 1. Live state snapshot (as of 2026-05-18)

| Field                          | Value                                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------------------- |
| Staging deploy commit          | `4ec2778` (`fix(db): withAdminBypass sets app.app_user_role_name GUC per transaction`, PR #142) |
| Previous staging deploy        | `58df063` (`chore: drop .planning/ from main + ignore it`, PR #140)                             |
| Last `_deploy-aws.yml` run     | `26012203657` SUCCESS, 16m22s, 2026-05-18T03:40:01Z                                             |
| AWS account                    | `637560253662`                                                                                  |
| Region                         | `eu-central-1`                                                                                  |
| Active branch when doc written | `hlebtkachenko/aff-150-auth-audit`                                                              |
| Target branch for PRs          | `main`                                                                                          |

### Public hosts

| Surface     | URL                                 | Container                                   | Port |
| ----------- | ----------------------------------- | ------------------------------------------- | ---- |
| Web         | `https://app-staging.afframe.com`   | `web`                                       | 3000 |
| Public API  | `https://api-staging.afframe.com`   | `api`                                       | 3001 |
| Admin       | `https://admin-staging.afframe.com` | `admin`                                     | 3100 |
| Status page | `https://status.afframe.com`        | OpenStatus self-hosted on OVH VPS (not AWS) | —    |

All three AWS surfaces share **one ECS Fargate task** with 7 containers
(web, api, admin, pgbouncer, cerbos, openfga, cloudflared). One task per env,
fronted by Cloudflare Tunnel — there is no public ALB or CloudFront in front.

---

## 2. Audit punch-list (AFF-150 session, 2026-05-18)

Status legend: **FIXED** = merged + deployed. **WORKAROUND** = applied to staging but not durable. **OPEN** = not addressed.

### 1. Redirect → `https://0.0.0.0:3000` — FIXED

- **Symptom:** signup link 307'd to `Location: https://0.0.0.0:3000/auth/signup`; browser refused (WebKitErrorDomain:103).
- **Cause:** `request.url` in Next route handlers returns the container listener address behind Cloudflare Tunnel, not the user-visible origin.
- **Fix:** `apps/web/lib/request-origin.ts` exports `publicOrigin(request)`. Prefers `x-forwarded-host` + `x-forwarded-proto`, falls back to `BETTER_AUTH_URL`, then `request.url`.
- **PR:** #131. Applied to `proxy.ts`, `/auth/signup/start`, `/auth/invite/start`, `/api/dev/preview`.
- **Reference:** `CLAUDE.md` already encodes this as a rule — "Route handler / middleware redirects MUST build base URLs via `publicOrigin(request)`".

### 2. `APP_BUCKET` missing on web + admin containers — OPEN

- **Symptom:** avatar upload at `/onboarding/profile` returns 500 with `"upload failed"`.
- **Root cause:** `infra/cdk/lib/app-stack.ts:383` wires `APP_BUCKET: props.appBucket.bucketName` to the **api** container only. The avatar upload route lives in `apps/web` and reads `process.env.APP_BUCKET` → undefined → throws.
- **Verified:** `aws ecs describe-task-definition AppstagingTaskDefFB1D51C4:10` — web env list does NOT include APP_BUCKET; api env list does.
- **Side effect:** admin also missing it. Admin doesn't upload avatars today but a user-management UI will need `presignAvatarRead`.
- **Three impact sites:** `apps/web/app/api/upload/avatar/route.ts` (upload), `apps/web/app/_lib/avatar-storage.ts` (read+upload), `apps/web/app/onboarding/profile/page.tsx` (server-side render via `presignAvatarRead`).
- **Fix path:** add the env entry to web (around line 281-310) and admin (around line 440+) container env blocks. Task role already has `grantReadWrite` on the bucket; no IAM change needed.
- **Defensive add:** `AWS_REGION` is NOT wired explicitly to web. The SDK falls back through the chain (instance metadata) so it works today, but wire it explicitly.

### 3. Cropper "Reset" button does not clear avatar — OPEN (UX gap)

- **Symptom:** user picks avatar → cropper opens → "Reset" only resets crop position + zoom, not the picked file. After cropped+saved, no UI to clear avatar back to default.
- **File:** `packages/ui/src/components/image-cropper/image-cropper.tsx:153-156`. `handleReset` only resets crop + zoom.
- **Parent form:** `apps/web/app/onboarding/profile/profile-form.tsx` has no clear-avatar UI. State (`sourceFile`, `avatarPreview`, `croppedBlob`) only clears on refresh.
- **Fix path:**
  - Cropper: add optional `onRemove` prop. If provided, the Reset button calls it instead of (or alongside) crop-reset.
  - Profile form: pass `onRemove` that clears `sourceFile`, `croppedBlob`, `avatarPreview`. Or add a separate "Remove" button on the avatar element directly.
  - Alternative: rename Reset → "Reset crop" (scope explicit), add a separate Remove flow.

### 4. Web/api/admin containers connect to RDS as `app_owner` — OPEN (production-blocker)

- **Symptom:** `withAdminBypass: current role lacks MEMBER on app_admin` thrown from `packages/db/src/tenancy.ts:322`.
- **Discovery:** probed `pg_auth_members` via bastion — only `app_user → app_admin` grant exists. The check `pg_has_role(current_user, 'app_admin', 'MEMBER')` returned FALSE because `current_user` was `app_owner` (RDS master), which has no MEMBER grant on `app_admin`.
- **Verified:** `databaseSecret` username = `app_owner`. CDK wires it to all runtime containers (app-stack.ts:388-393).
- **Architectural intent:** app should connect as `app_user` (RLS-bound role). `app_owner` has `rds_superuser` → bypasses RLS entirely. **Production-blocking security issue**: every tenant query in prod would silently skip RLS.
- **Workaround applied to staging RDS:** `GRANT app_admin TO app_owner;` via bastion. Lets `withAdminBypass` membership check pass. **NOT formalized in a migration** — survives RDS lifetime but not a rebuild.
- **Fix path:**
  - Create a separate `app_user` secret in `data-stack.ts` (alongside the existing master `databaseSecret`).
  - Provision the `app_user` password via Secrets Manager + post-deploy SQL (similar to OpenFGA bootstrap chain).
  - Wire web/api/admin containers in `app-stack.ts` to use the `app_user` secret instead of `databaseSecret`.
  - Leave migration runner on `app_owner`.
  - Revert the staging-only `GRANT app_admin TO app_owner` once containers connect as app_user.

### 5. `app.app_user_role_name` GUC not set on staging RDS — PARTIAL FIX

- **Symptom:** `app_prevent_last_owner_demotion` trigger raised `app.app_user_role_name GUC must be set on every connection` on workspace_membership writes.
- **Trigger source:** `packages/db/migrations/0005_workspace.sql:445-457`. The `init.d/03-set-guc.sql` it references does NOT exist — only `00-roles.sql` and `01-grants.sql` live in `infra/compose/postgres/init.d/`. Misleading comment.
- **Compose dev path:** `00-roles.sql:82-83` uses `ALTER ROLE ... SET app.app_user_role_name = '...'`. Works locally.
- **Staging RDS:** `ALTER ROLE SET` and `ALTER DATABASE SET` both rejected with `permission denied to set parameter "app.app_user_role_name"`. Custom-GUC ALTER requires true SUPERUSER; `rds_superuser` is not enough.
- **Fix applied (PR #142):** `withAdminBypass` sets `SET LOCAL app.app_user_role_name = 'app_user'` per transaction. Unblocked workspace creation.
- **Remaining gaps:**
  - `withWorkspace` and `withOrganization` helpers (tenancy.ts:225, tenancy.ts:150) do NOT set the GUC. Any tenant code path that writes to `workspace_membership` (role changes, deactivations) will still hit the trigger and fail.
  - Cleaner fix: pgbouncer `connect_query` that injects `SET app.app_user_role_name = '...'` on every backend connection. Removes the need for per-helper SETs.
  - Even cleaner: RDS parameter group with the GUC pre-declared so `ALTER ROLE/DATABASE SET` works. Requires parameter group modification.
- **Also fix:** the trigger error message points at a non-existent file (or drop the file reference).

### 6. `delete-user.ts` localhost guard hole — OPEN (real bug)

- **File:** `packages/auth/scripts/delete-user.ts:46`
- **Guard:** refuses unless `DATABASE_DIRECT_URL` matches `/localhost|127\.0\.0\.1/`.
- **Hole:** SSM port-forward via the bastion exposes staging/production RDS at `localhost:5432`. Guard reads the URL STRING, not the actual target. Script would happily cascade-delete production data if invoked through a port-forward.
- **Caught by advisor during plan review.** Did NOT use the script on staging this session.
- **Fix priority order:**
  - Refuse unless DB port matches dev compose nonstandard port (e.g. `:54322`) — strongest pure-string check.
  - Resolve DB_HOST via dig/nslookup, refuse if it resolves to a non-private/non-loopback address.
  - Require explicit `--i-know-this-is-not-local --typed-env-name=staging` confirmation flag combo.
  - Best: ALL of the above + log the resolved endpoint before deleting.

### 7. Bastion script only runs `db:migrate` — OPEN (tooling)

- **File:** `scripts/staging-bastion-migrate.sh`
- **Limitation:** only runs `pnpm --filter @workspace/db db:migrate` at line 208. No way to invoke ad-hoc SQL or other commands without editing the script.
- **This session:** edited in-place to inject `PROBE_SQL` hook for probes/grants, ran bastion, then reverted. Worked but error-prone.
- **Fix path (~8 lines):** make the command configurable.
  ```bash
  CMD="${CMD:-pnpm --filter @workspace/db db:migrate}"
  eval "$CMD"
  ```
- **Usage examples:**
  - Migrations (default): `./scripts/staging-bastion-migrate.sh staging`
  - Ad-hoc SQL: `CMD='psql "$DATABASE_DIRECT_URL" -f /tmp/x.sql' ./scripts/staging-bastion-migrate.sh staging`
  - Interactive shell: `CMD='bash -i' ./scripts/staging-bastion-migrate.sh staging`

### 8. Onboarding password step error key is misleading — OPEN (minor)

- **File:** `apps/web/app/onboarding/actions.ts:245`
- **Issue:** `submitPasswordAction` returns `errorKey: "saveProfileFailed"` when the post-signUp `UPDATE app_user` fails. But the user is on the password step, not the profile step. UI shows "Could not save your profile" — confusing.
- **Fix:** add a distinct errorKey like `persistOnboardingFailed` with copy that doesn't mention "profile".

### 9. `stack=app-only` deploy parameter naming — OPEN (cosmetic)

- `_deploy-aws.yml` accepts `stack ∈ {app-only, infra-only, all}`. `app-only` means "the App CDK stack" (which contains all 7 containers). User read it as "only the web app" — natural misreading.
- **Fix:** rename to `app-stack` / `infra-stack` / `all-stacks` and accept legacy values as aliases for one release.

### 10. Hardcoded `cache.afframe.com` in deploy workflow — FIXED

- Was at `.github/workflows/_deploy-cloudflare.yml:85-88`. Hardcoded `url="https://cache.afframe.com"` in bash.
- Now reads `vars.TURBO_API`. Fails loud if unset. PR #136.

### 11. Drizzle migrations table location — INFO (not a bug)

- Migration history lives at `public._app_migrations`, not `drizzle.__drizzle_migrations`. Noted for future probes.

### 12. Init.d numbering gap — OPEN (minor)

- `packages/db/migrations/0005_workspace.sql:455` references `init.d/03-set-guc.sql` which does not exist. Only `00-roles.sql` and `01-grants.sql` are in `infra/compose/postgres/init.d/`. The role-default GUC is actually set by `00-roles.sql:82-83`.
- **Fix:** either consolidate the SET into a renamed file matching the trigger comment, OR update the trigger message to point at the real file.

### Staging-only deltas not in any migration

These were applied via bastion this session and only live on staging RDS:

1. `GRANT app_admin TO app_owner` — workaround for item #4. Will survive RDS instance lifetime but not a rebuild.

If staging is rebuilt or production is provisioned, both must be re-applied OR the root causes (#4 + #5) fixed at the architecture layer first.

---

## 3. AFF-150 outstanding work (the original ticket)

[AFF-150](https://linear.app/hapddev/issue/AFF-150) — **Post-deploy: seed Development Afframe + Support Afframe workspaces on staging**
Status: Backlog. Priority: High (P2). Estimate: 1pt. Parent: [AFF-39](https://linear.app/hapddev/issue/AFF-39). Branch: `sso/aff-150-post-deploy-seed-development-afframe-support-afframe`.

### Outcome wanted

Two `workspace` rows on staging RDS with the fixed UUIDs the admin gate already
expects, plus owner `workspace_membership` rows for `developer@hapdglobal.com`.
Signing into `admin-staging.afframe.com` then passes the `userIsAllowlisted` gate
and renders the staff surface.

### Canonical UUIDs (from Linear, ALREADY in `vars.ADMIN_WORKSPACE_ALLOWLIST`)

| Workspace           | UUID                                   |
| ------------------- | -------------------------------------- |
| Development Afframe | `7224ba28-1ceb-435c-9a5a-15eca835e48a` |
| Support Afframe     | `dedd0279-6dff-4c1c-b36f-c48f25ac4f76` |

> **Correction vs. session audit:** the audit called these "placeholders". They are NOT.
> They are the canonical fixed UUIDs that the `ADMIN_WORKSPACE_ALLOWLIST` GitHub Actions
> variable already carries. The audit's "Step 4: REPLACE … with the real UUIDs" is moot.
> The remaining work is the seed itself.

### Step-by-step

1. **Sign up `developer@hapdglobal.com`** via fresh signup token at
   `https://app-staging.afframe.com/auth/signup/start?token=...` → complete owner
   onboarding through `/onboarding/done`. PR #142 unblocked the workspace creation
   step. This creates one workspace; its UUID will NOT match the fixed UUIDs above
   (workspaces use `gen_random_uuid()` or equivalent on insert).
2. **Bastion-seed two more workspace rows** with the fixed UUIDs:

   ```sql
   INSERT INTO workspace (id, display_name, contact_email, created_by_user_id)
   VALUES
     ('7224ba28-1ceb-435c-9a5a-15eca835e48a', 'Development Afframe',
      'developer@hapdglobal.com', '<developer-user-id>'),
     ('dedd0279-6dff-4c1c-b36f-c48f25ac4f76', 'Support Afframe',
      'developer@hapdglobal.com', '<developer-user-id>')
   ON CONFLICT (id) DO NOTHING;

   INSERT INTO workspace_membership (workspace_id, user_id, role, active)
   VALUES
     ('7224ba28-1ceb-435c-9a5a-15eca835e48a', '<developer-user-id>', 'owner', true),
     ('dedd0279-6dff-4c1c-b36f-c48f25ac4f76', '<developer-user-id>', 'owner', true)
   ON CONFLICT DO NOTHING;
   ```

   The `app_prevent_last_owner_demotion` trigger requires `app.app_user_role_name`
   GUC set — wrap in `SET LOCAL app.app_user_role_name = 'app_user';` before the inserts.

3. **Sanity-check** login at `https://admin-staging.afframe.com` succeeds (gate passes).
4. **Close [AFF-150](https://linear.app/hapddev/issue/AFF-150).**

### Alternative path

If signing up twice on the same email is needed for the audit's
"Support Afframe" branch as well, Better Auth will reject the second signUp.
Either seed both rows via bastion (preferred, above) OR add a second
workspace through a `/workspace/new` UI if it exists.

---

## 4. Dependency graph — auth / onboarding / admin

### 4.1 Identity / cookie sources (origin of every flow)

```
┌─────────────────────────┐  ┌─────────────────────────┐  ┌────────────────────────┐
│ /auth/signup/start      │  │ /auth/invite/start      │  │ /auth/login (step 1)   │
│ ?token=<signup JWT>     │  │ ?token=<raw 32B>        │  │ email submit           │
│                         │  │                         │  │                        │
│ verifySignupToken()     │  │ readInviteByRawToken()  │  │ identifyEmailAction    │
│ →cookie app-signup-token│  │ →cookie app-invite-token│  │ →cookie app-login-email│
│  (path=/, HS256, 24h)   │  │  (path=/, raw, 24h)     │  │  (path=/auth/login,10m)│
└────────────┬────────────┘  └────────────┬────────────┘  └────────────┬───────────┘
             │                            │                            │
             ▼                            ▼                            ▼
       /auth/signup                /auth/invite               /auth/login/password
       (welcome card)              (welcome card)             (BA signIn.email)
             │                            │                            │
             ▼                            ▼                            │
                  /onboarding/* wizard                                 │
                  (detectOnboardingRole from cookies)                  │
                                                                       ▼
                                                            router.push(next) or
                                                            /auth/login/mfa
```

Three cookies, three paths. **`app-signup-token`** = owner. **`app-invite-token`** = member. **`app-login-email`** = login step 2 carrier. Onboarding wizard reads signup OR invite cookie to pick role (invite wins on conflict).

### 4.2 apps/web/app/auth — file tree

```
auth/
├ layout.tsx                  passthrough wrapper
├ (default)/
│  ├ layout.tsx               AuthShell + aside + AuthHeaderLinkProvider
│  ├ signup/
│  │  ├ start/route.ts        GET token, verifySignupToken, set cookie, redirect /auth/signup
│  │  ├ page.tsx              welcome card; mismatch screen w/ signOutForSignupAction
│  │  └ actions.ts            signOutForSignupAction
│  ├ invite/
│  │  ├ start/route.ts        GET token, DB lookup, set cookie, redirect /auth/invite
│  │  ├ page.tsx              welcome card (member)
│  │  ├ actions.ts            invite welcome actions
│  │  └ invite-welcome-actions.tsx
│  ├ login/
│  │  ├ page.tsx              email form
│  │  ├ login-email-form.tsx  RHF→identifyEmailAction→push /auth/login/password
│  │  ├ actions.ts            identifyEmailAction / readLoginEmail / clearLoginEmailAction / sendMagicLinkAction
│  │  ├ password/
│  │  │  ├ page.tsx           readLoginEmail or redirect step 1
│  │  │  └ login-password-form.tsx  authClient.signIn.email → optional MFA
│  │  └ mfa/
│  │     ├ page.tsx
│  │     └ login-mfa-form.tsx authClient.twoFactor.verifyTotp / verifyBackupCode
│  ├ forgot-password/         RHF + actions.ts (BA forgetPassword)
│  └ reset-password/          RHF + actions.ts (BA resetPassword)
├ _components/account-menu.tsx
├ _lib/
│  ├ issue-invite.ts          re-export from @workspace/auth/invite-issuer
│  ├ materialize-invite.ts    accept invite → workspace_membership + organization_membership
│  ├ account-actions.ts
│  └ email-error.ts           isEmailAlreadyRegistered probe
└ mfa/setup/                  authenticated TOTP enrollment
```

### 4.3 apps/web/app/onboarding — file tree

```
onboarding/
├ layout.tsx                  detectOnboardingRole, AuthShell, WizardProgress
├ actions.ts                  ★ all step actions (8 server actions)
│   submitProfileAction       → app_user via withAdminBypass
│   submitExperienceAction    → app_user
│   submitPasswordAction      ★ BA signUpEmail OR existing session; materializeInvite on member
│   submitWorkspaceAction     → workspace + workspace_membership + organization + organization_membership
│   submitPlanAction          → workspace.plan via withWorkspace
│   submitTeamAction          → issueInvite N times, workspace.step_3_completed_at
│   completeOnboardingAction  → workspace.onboarding_completed_at + clearSignupCookie
│   abandonOnboardingAction   → clearAll, redirect /auth/login
├ _lib/
│  ├ role.ts                  detectOnboardingRole (invite > signup)
│  ├ role-types.ts            OnboardingRole = owner|member
│  ├ steps.ts                 OWNER_STEPS (7), MEMBER_STEPS (4), projectStepForRole
│  ├ resume.ts                resolveNextStep, assertOnStep, findOwnerWorkspaceId
│  ├ signup-cookie.ts         JWT cookie read/clear
│  ├ invite-cookie.ts         raw token cookie + DB lookup
│  ├ state-cookie.ts          per-step state (profile, experience) before BA user exists
│  ├ active-workspace-cookie.ts
│  └ avatar-carry.ts          stash avatar pre-signup, re-upload post-signup
├ profile/                    page.tsx + profile-form.tsx (avatar upload here ← issue #2)
├ experience/                 page.tsx + experience-form.tsx
├ password/                   page.tsx + password-form.tsx
├ workspace/                  page.tsx + workspace-form.tsx (owner only)
├ plan/                       page.tsx + plan-form.tsx (owner only)
├ team/                       page.tsx + team-form.tsx (owner only)
├ done/                       page.tsx + done-card.tsx (role-aware)
└ _components/
   ├ onboarding-role-context.tsx
   ├ wizard-progress.tsx / wizard-progress-client.tsx
```

Step order:

| #   | Step       | Owner                                  | Member                               |
| --- | ---------- | -------------------------------------- | ------------------------------------ |
| 1   | profile    | ✓                                      | ✓                                    |
| 2   | experience | ✓                                      | ✓                                    |
| 3   | password   | ✓ create BA user                       | ✓ create BA user + materializeInvite |
| 4   | workspace  | ✓ create workspace + org + memberships | skip                                 |
| 5   | plan       | ✓                                      | —                                    |
| 6   | team       | ✓ issueInvite                          | —                                    |
| 7   | done       | ✓ finalize                             | ✓ idempotent clear                   |

### 4.4 apps/admin/app/auth — file tree

```
admin/app/
├ auth/
│  ├ layout.tsx               AuthShell + admin red wordmark + admin-specific aside quote
│  ├ login/
│  │  ├ page.tsx              email form
│  │  ├ login-email-form.tsx  RHF→identifyEmailAction (same shared cookie path)
│  │  ├ actions.ts            same identifyEmailAction / readLoginEmail / sendMagicLink
│  │  ├ check-allowlist-action.ts  ★ pre-login gate: checkAdminAllowlistAction → userIsAllowlisted
│  │  ├ password/
│  │  │  ├ page.tsx
│  │  │  └ login-password-form.tsx  authClient.signIn.email NO callbackURL,
│  │  │                             then checkAdminAllowlistAction → signOut+error if denied
│  │  └ mfa/
│  │     └ login-mfa-form.tsx authClient.twoFactor.* then same gate
│  ├ forgot-password/  ↔ same shape as web
│  └ reset-password/   ↔ same shape as web
└ (gated)/                    ★ POST-login fail-safe gate
   ├ layout.tsx               BA session OR redirect /auth/login; allowlist OR render "Not authorized"
   ├ check-allowlist.ts       userIsAllowlisted(userId) via withAdminBypass on workspace_membership
   ├ allowlist.ts             parseAdminWorkspaceAllowlist (CSV env), isWorkspaceAllowed
   ├ page.tsx                 admin home
   ├ dev/ showcase/ typography/
   └ sign-out-button.tsx
```

No signup. No invite. Admin staff are added by env-var allowlist + redeploy.

### 4.5 Web ↔ admin connection points

| Touch point                               | Shared?                 | Notes                                                           |
| ----------------------------------------- | ----------------------- | --------------------------------------------------------------- |
| Better Auth session cookie                | host-scoped, NOT shared | web=app-staging.afframe.com, admin=admin-staging.afframe.com    |
| `BETTER_AUTH_SECRET` / `APP_TOKEN_SECRET` | shared                  | same Secrets Manager values → tokens verify on either app       |
| `auth_session` / `app_user` DB rows       | shared                  | one BA user can log into both (if admin-allowlisted)            |
| `workspace_membership` allowlist          | enforced ONLY on admin  | env `ADMIN_WORKSPACE_ALLOWLIST` (CSV of `workspace.id`)         |
| Cookie paths                              | siloed by host          | `app-signup-token`, `app-invite-token` exist only on web origin |
| Email links                               | per-origin              | `BETTER_AUTH_URL` differs (web=publicOrigin, admin=adminOrigin) |
| Email templates / Resend                  | shared                  | `EMAIL_FROM` same domain, `EMAIL_TRANSPORT=resend` on both      |

Admin login funnel:

```
admin auth/login → identifyEmailAction (same cookie path /auth/login)
   → password → authClient.signIn.email
   → if 2FA → /auth/login/mfa → verifyTotp
   → checkAdminAllowlistAction (userIsAllowlisted via withAdminBypass)
   → if denied: authClient.signOut + generic "invalid credentials" (no enumeration)
   → if allowed: router.push(next) → (gated)/layout.tsx revalidates same gate
```

### 4.6 DB tenancy contract (`packages/db/src/tenancy.ts`)

| Helper                                | Sets GUC                                                           | Sets role                                 | Used by                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `withOrganization(orgId, userId, fn)` | `app.organization_id` + `app.user_id` + derived `app.workspace_id` | login role (`app_owner` today — audit #4) | org-scoped actions                                                                                   |
| `withWorkspace(wsId, userId, fn)`     | `app.workspace_id` + `app.user_id`, clears `app.organization_id`   | login role                                | submitPlanAction, submitTeamAction, completeOnboardingAction                                         |
| `withAdminBypass(fn)`                 | `app.app_user_role_name='app_user'` (PR #142 per-tx fix)           | `SET LOCAL ROLE app_admin`                | onboarding actions, materializeInvite, resolveMembership, userIsAllowlisted, presignAvatarRead chain |

> ★ Audit #5: `withWorkspace` and `withOrganization` do NOT set `app.app_user_role_name`.
> Any write that fires the `app_prevent_last_owner_demotion` trigger from those helpers
> still fails on staging RDS.

### 4.7 Avatar upload chain (audit #2 root cause)

```
profile-form.tsx
   ├─ logged in?  POST /api/upload/avatar   (web container) ──┐
   │                                                          ├→ uploadAvatar() reads APP_BUCKET
   └─ logged out? avatar-carry.ts (sessionStorage stash) ─┐   │
                                                          │   │
password-form.tsx (post-signUpEmail)                      │   │
   └─ uploadCarriedAvatar() → POST /api/upload/avatar ────┘   │
                                                              │
profile/page.tsx render → presignAvatarRead(key) ─────────────┤
                                                              │
                                                              ▼
                                              process.env.APP_BUCKET
                                              currently UNDEFINED on web + admin containers
                                              (wired only on api container, app-stack.ts:383)
```

Three sites depend on `APP_BUCKET` on the **web** task: upload route, profile page render, password step carry. All return 500 today on staging.

### 4.8 AWS deploy env wiring (`infra/cdk/lib/app-stack.ts`)

| Container                    | port            | `APP_BUCKET`? | DB user                        | Other                                           |
| ---------------------------- | --------------- | ------------- | ------------------------------ | ----------------------------------------------- |
| web                          | 3000            | ❌ (audit #2) | `app_owner` (master, audit #4) | `BETTER_AUTH_URL=publicOrigin`                  |
| api                          | 3001            | ✓ line 383    | `app_owner`                    | `OPENFGA_*` SSM                                 |
| admin                        | 3100            | ❌            | `app_owner`                    | `ADMIN_WORKSPACE_ALLOWLIST` (env at synth time) |
| pgbouncer                    | 6432 (loopback) | n/a           | `app_owner`                    | edoburu, transaction `pool_mode`                |
| cerbos, openfga, cloudflared | …               | n/a           | n/a                            | sidecars                                        |

> ★ `ADMIN_WORKSPACE_ALLOWLIST` baked at CDK synth time → changing the allowlist needs redeploy.

---

## 5. Where to debug what

| Symptom                                                                          | Start at                                                                      | Likely fix file                                                                                        |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Signup link 307 → bad host                                                       | `apps/web/lib/request-origin.ts`                                              | route handlers using `publicOrigin()`                                                                  |
| Avatar 500 "upload failed"                                                       | `apps/web/app/_lib/avatar-storage.ts:43`                                      | `infra/cdk/lib/app-stack.ts:281-310` (add `APP_BUCKET` to web)                                         |
| Cropper reset doesn't clear                                                      | `packages/ui/src/components/image-cropper/image-cropper.tsx:153`              | add `onRemove` prop + thread through profile-form                                                      |
| `withAdminBypass: lacks MEMBER on app_admin`                                     | `packages/db/src/tenancy.ts:322`                                              | root: app-stack.ts uses `databaseSecret` (app_owner). Staging band-aid: `GRANT app_admin TO app_owner` |
| `app.app_user_role_name GUC must be set` from `withWorkspace`/`withOrganization` | `packages/db/src/tenancy.ts:225,150`                                          | add `SET LOCAL app.app_user_role_name='app_user'` mirror of line 346                                   |
| Onboarding password step error "Could not save profile"                          | `apps/web/app/onboarding/actions.ts:245`                                      | distinct errorKey `persistOnboardingFailed`                                                            |
| Admin login allowlist denies                                                     | `apps/admin/app/(gated)/check-allowlist.ts` + env `ADMIN_WORKSPACE_ALLOWLIST` | redeploy after editing repo variable                                                                   |
| Login redirect loop / wrong host link                                            | `BETTER_AUTH_URL` env on container OR `publicOrigin()` helper                 | app-stack.ts env block                                                                                 |
| Member invite fails to land in org                                               | `apps/web/app/auth/_lib/materialize-invite.ts`                                | also check `auth_invite.workspace_id` cross-check                                                      |

---

## 6. Staging access model — what's reachable and how

### 6.1 What's live

| Surface        | URL                                 | Backed by                                                |
| -------------- | ----------------------------------- | -------------------------------------------------------- |
| Web            | `https://app-staging.afframe.com`   | ECS Fargate task → web container :3000 (via cloudflared) |
| API            | `https://api-staging.afframe.com`   | same task → api container :3001                          |
| Admin          | `https://admin-staging.afframe.com` | same task → admin container :3100                        |
| DB             | RDS Postgres 18, private subnet     | reachable only via bastion + SSM port-forward            |
| Object storage | S3 `APP_BUCKET`                     | private, presigned URLs                                  |

### 6.2 Agent access channels (IAM user `claude-cli`, account `637560253662`)

| Channel                                                   | Capability                                                                                                                      |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **HTTPS public hosts**                                    | `curl` any of the three URLs — verify deploys, test flows, capture errors                                                       |
| **AWS CLI**                                               | `aws ecs describe-task-definition`, `aws logs tail`, `aws s3 ls`, `aws secretsmanager get-secret-value` (subject to IAM policy) |
| **Bastion script** (`scripts/staging-bastion-migrate.sh`) | Ephemeral EC2 + SSM port-forward → run migrations OR ad-hoc SQL (after audit #7 fix to inject `CMD`)                            |
| **`gh` CLI**                                              | Dispatch workflows (`gh workflow run _deploy-aws.yml`), set repo vars (`gh variable set`)                                       |
| **CloudWatch Logs**                                       | Stream web / api / admin / pgbouncer logs live                                                                                  |
| **Linear MCP**                                            | Read + edit AFF issues, manage Cleanup project, file new issues                                                                 |

### 6.3 Change vectors

| Change                                                                    | Path                                                                                                | Persistent?                                                                                         |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| DB row / data (seed workspaces, probe RLS, GRANT)                         | Bastion SQL → direct INSERT/UPDATE                                                                  | On staging RDS instance lifetime only. **Not** in a fresh rebuild — must be folded into a migration |
| DB schema (new table, new column)                                         | Drizzle migration in `packages/db/migrations/` → PR → merge → bastion runs migrate                  | Yes                                                                                                 |
| Secrets value (rotate DB password, BA secret)                             | `aws secretsmanager update-secret` → restart task                                                   | Yes; container re-fetches on start                                                                  |
| App code (web/api/admin)                                                  | PR → merge to `main` → `_deploy-aws.yml` builds new image + ECS new task def                        | Yes                                                                                                 |
| Container env / IAM / SG / S3 wiring (e.g. `APP_BUCKET` on web, audit #2) | Edit `infra/cdk/lib/app-stack.ts` → PR → merge → `_deploy-aws.yml` with `stack=infra-only` or `all` | Yes                                                                                                 |
| GitHub Actions variable (e.g. `ADMIN_WORKSPACE_ALLOWLIST`)                | `gh variable set` → redeploy (CDK reads at synth time)                                              | Yes after redeploy                                                                                  |
| Cloudflare tunnel hostnames                                               | `infra/cloudflare/` repo files → separate `_deploy-cloudflare.yml`                                  | Yes                                                                                                 |

### 6.4 Cycle time

- DB-only fix: seconds to minutes (bastion spin-up ~30s)
- App code: ~16-22 min (today's deploys took 16m22s and 22m34s)
- Infra (CDK): same workflow window
- Repo var + redeploy: ~17 min for the redeploy after `gh variable set`

### 6.5 Agent default rules in this repo

1. **No auto-deploy after merge** — never trigger `_deploy-aws.yml` without explicit user ask.
2. **DB writes via bastion are temporary** — always followed by a migration PR so a rebuild doesn't drop the change.
3. **Never `--no-verify`, never `--force-push` to main.**
4. **Never display or log secrets** (`.env`, `*.key`, `*.enc`, `client_secret*.json`).
5. **Conventional commits** — `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
6. **English-only in files / code / comments** (exception: official proper names).

---

## 7. Linear context

### 7.1 AFF-150 (parent: AFF-39)

See section 3.

### 7.2 Cleanup project — open backlog (priority order)

| Issue          | Title                                                                                                       | P   |
| -------------- | ----------------------------------------------------------------------------------------------------------- | --- |
| AFF-150        | Seed Development + Support Afframe workspaces (this)                                                        | P2  |
| _(in project)_ | First staging deploy of api + admin foundation — verify end-to-end                                          | P2  |
| _(in project)_ | Group E — Outstanding work from planning-doc verification audit                                             | P2  |
| _(in project)_ | Verify Cloudflare tunnel routing: `/api/*` on app host goes to NestJS api                                   | P3  |
| _(in project)_ | E16, E16a, E16b — security hardening close-outs (harden-runner block, required_signatures, secret scanning) | P3  |

> All other 50 Cleanup issues are Done or Canceled as of 2026-05-18.

### 7.3 Memory entries that govern session behavior

| Memory                        | File                                                             | Effect                                                                                                           |
| ----------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| No auto-deploy after merge    | `~/.claude/projects/.../memory/feedback_no_auto_deploy.md`       | Never trigger AWS deploy post-merge without explicit user ask                                                    |
| Act on full research          | `~/.claude/projects/.../memory/feedback_act_on_full_research.md` | After research, restate full findings and explicitly defer the ones you're not doing; don't silently cherry-pick |
| Conductor worktree git safety | `~/.claude/projects/.../memory/conductor-worktree-git-safety.md` | Never background mutating git commands in parallel worktrees                                                     |
| Branch recovery cleanup       | `~/.claude/projects/.../memory/branch-recovery-cleanup.md`       | Linear Cleanup project AFF-5..AFF-22 + durable planning docs location                                            |
| Project positioning           | `~/.claude/projects/.../memory/project-positioning.md`           | Agent-native, not AI-native, Czech accounting platform                                                           |

---

## 8. Reference files

| Topic                             | File                                                                    |
| --------------------------------- | ----------------------------------------------------------------------- |
| Session audit (full text)         | `.context/attachments/aff-150-session-audit.md` (gitignored)            |
| Public host inventory             | `docs/DOMAINS-AND-EMAIL.md`                                             |
| AWS deploy runbook                | `docs/runbooks/AWS-DEPLOY.md`                                           |
| Cost runaway runbook              | `docs/runbooks/COST-INCIDENT-RESPONSE.md`                               |
| Status page runbook               | `docs/runbooks/STATUS-PAGE.md`                                          |
| Bastion script                    | `scripts/staging-bastion-migrate.sh`                                    |
| `publicOrigin()` helper           | `apps/web/lib/request-origin.ts`                                        |
| Tenancy helpers                   | `packages/db/src/tenancy.ts`                                            |
| App-stack CDK                     | `infra/cdk/lib/app-stack.ts`                                            |
| Data-stack CDK                    | `infra/cdk/lib/data-stack.ts`                                           |
| Admin allowlist                   | `apps/admin/app/(gated)/check-allowlist.ts` + `allowlist.ts`            |
| ADR on redirects                  | `docs/adr/0008-*.md` (Amendment 2026-05-17 — redirect base URLs)        |
| ADR on tenancy GUCs               | ADR-0010                                                                |
| ADR on pgbouncer transaction pool | ADR-0012                                                                |
| Rollback target if needed         | admin sha `sha-7693f1fb` (last image before this session's two deploys) |

---

## 9. Suggested session split

| Session                                       | Scope                                                                                                                                                             | Output                                         |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **A. Unblock AFF-150**                        | Sign up `developer@hapdglobal.com`, bastion-seed two workspace rows + memberships, verify admin login, close AFF-150                                              | Linear: AFF-150 Done. No code change.          |
| **B. Fix audit #2 (APP_BUCKET on web/admin)** | Edit `infra/cdk/lib/app-stack.ts` web + admin env blocks, PR, merge, infra redeploy, verify avatar upload                                                         | PR + green deploy                              |
| **C. Fix audit #4 (app_user role split)**     | New `app_user` secret in `data-stack.ts`, wire web/api/admin to use it, revert staging `GRANT app_admin TO app_owner`, formalize migration                        | PR + green deploy. Production-blocker cleared. |
| **D. Fix audit #5 remainder**                 | Mirror `SET LOCAL app.app_user_role_name = 'app_user'` into `withWorkspace` + `withOrganization`. Decide between this and the pgbouncer `connect_query` approach. | PR                                             |
| **E. Fix audits #3, #6, #7, #8, #9, #12**     | UX cropper reset, delete-user.ts guard hole, bastion CMD generalization, error key rename, deploy param rename, init.d numbering                                  | Multi-PR batch                                 |
| **F. Cleanup project close-outs**             | E16, E16a, E16b security hardening                                                                                                                                | PRs                                            |

Each session can be opened cold by reading this file + the linked references.

---

_Last updated: 2026-05-18 after Linear OAuth complete. Branch `hlebtkachenko/aff-150-auth-audit`._
