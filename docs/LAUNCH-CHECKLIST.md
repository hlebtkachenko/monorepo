# v1 Launch Checklist

Owner: **Hleb**. Created 2026-06-10 from the pre-v1 hardening audit.
Every item below is a deliberate go-live gate or a stated decision that
must be confirmed before (or at) v1. Tick the box when done; items that
are decisions record the decision inline.

Legal and product blockers first, then infra/ops, then deferred tracks.

## Blockers

- [ ] **1. GDPR: publish Privacy Policy + Terms of Service — LEGAL BLOCKER.**
      Processing personal data with no privacy policy violates GDPR
      Art. 13. Must include: the cookie inventory (all cookies are
      strictly-necessary/preference today — Better Auth session,
      `__Host-afkey-*` flow tokens, `NEXT_LOCALE` — so no consent banner
      is required, but disclosure is), a manual data-subject process
      (export / erasure per Art. 15/17/20), and SLA wording. Wire the
      published URLs into `BRAND_PRIVACY_URL` / `BRAND_TERMS_URL`
      (`packages/ui/src/brand-assets/constants.ts`) — the auth/onboarding
      footer links and the invite-acceptance "you agree to..." copy
      depend on them.
- [ ] **17. PROD ONBOARDING PATH.** Signup-token minting only exists in
      the admin dev dashboard (prod-gated off) and the local script
      `packages/auth/scripts/issue-signup-token.ts`. Build a gated
      prod-safe minting surface or document a manual DB procedure.
      **Without this, v1 cannot onboard customers.**

## Infra / cost posture (flip at launch)

- [ ] **2. Remove `production` from `AUTO_STOP_ENVS`** in
      `infra/cdk/lib/security-stack.ts` + redeploy `Security-production`.
      (Correctly deferred until launch — flipping earlier would un-park
      prod and burn cost.) See `docs/runbooks/ENV-POWER.md` § "Production
      after v1" and the in-code banner.
- [ ] **3. Kill-switch: drop the CPU/memory 95% critical alarms from
      `KILL_SWITCH_ALARM_NAMES`** (`infra/cdk/lib/security-stack.ts`;
      alarms defined in `infra/cdk/lib/observability-stack.ts`) — do this
      after the load test (item 12). A legitimate launch-day burst on a
      0.5 vCPU task can sustain 95% for 10 min and self-inflict an
      outage. Keep email via BillingTopic.
- [ ] **4. Budget kill posture for prod** (`infra/cdk/lib/security-stack.ts`,
      ADR-0016 amendment 2026-05-31): raise the prod Total / AccountTotal
      $55 caps to realistic post-launch spend, and/or flip production's
      100% subscriber from the kill-switch topic to page-only. Keep
      auto-kill for staging.
- [ ] **12. Load test** web+api on staging at expected launch RPS
      (`infra/cdk/lib/app-stack.ts` task sizing, cpu=512 today); bump
      prod to cpu=1024 if p95 degrades. Interacts with item 3.

## Observability / ops

- [ ] **5. Restart OpenStatus + cloudflared on the OVH VPS — SAME-MORNING
      ops** (both `status.afframe.com` and `monitoring.afframe.com`
      return 530 as of 2026-06-10; `infra/openstatus/deploy/` has
      `keepalive.sh`). Then click the monitor changes into the dashboard
      (prod monitors active, bot monitor, staging sleeping-page
      awareness) — the YAML in `infra/openstatus/openstatus.yaml` is
      intent-only; see `docs/runbooks/STATUS-PAGE.md`.
- [ ] **6. Sentry: provision `SENTRY_DSN`** (Vault → SSM → task env, per
      `docs/runbooks/SECRETS-ADD-DELETE.md`) for api+web, **or formally
      accept CloudWatch-only** and keep error-issue wording free of
      Sentry references. ADR-0002.
- [ ] **9. SNS→bot subscription into the deploy workflow.** The
      `https://bot.afframe.com/sns?token=…` subscriptions on the 3 prod
      alarm topics were created manually; topic re-creation drops the
      Telegram alarm path silently. Add the https subscription to
      `_deploy-aws.yml`'s existing subscribe-loop step (token from
      secrets, masked).
- [ ] **14. One green manual backup-restore drill** (after the DB-06
      backup-workflow fix lands), against production. Log the evidence.
      `.github/workflows/backup-restore-monthly.yml`,
      `docs/runbooks/DR-DRILL.md`.

## Auth / platform decisions

- [ ] **7. Cookie apex final flip.** Decide whether
      `BETTER_AUTH_COOKIE_DOMAIN=.afframe.com` (cross-subdomain session,
      web session carries to admin) stays or is removed. PREP lands in
      the hardening PR (Wave H) as an uncommitted proposal + Telegram
      ask; this item is the final flip at deploy.
- [ ] **16. DECIDE `requireEmailVerification` posture.** Currently
      unverified users can log in
      (`packages/auth/src/server.ts`, `emailAndPassword` — BA default
      `false`). Signup is invite/token-gated, which mitigates; record the
      decision either way.
- [ ] **13. EMAIL_FROM / Resend posture re-confirm.** Sender
      `no-reply@afframe.com` must stay on the exact Resend-verified
      domain (no parent-domain inheritance). `docs/DOMAINS-AND-EMAIL.md`.

## CI / process

- [ ] **8. Required-check flips (Hleb-manual).** Once green: the 4 API
      gates (`openapi-lint`, `sdk-drift`, `mcp-coverage`, `pr-checklist`) + 2 DB gates (`db-schema-drift`, `db-migration-idempotency`) into
      `.github/rulesets/main.json`. Mind the path-filter trap — required
      checks must always-run (see `docs/conventions/CI-POLICY.md`).
- [ ] **15. Add `TURBO_TOKEN` (+ `TURBO_REMOTE_CACHE_SIGNATURE_KEY`) to
      Dependabot secrets** (repo settings → Dependabot; read-only token
      preferred). Dependabot PRs currently run without remote cache.
      ADR-0021, `docs/runbooks/CI-TURBO-REMOTE-CACHE.md`.

## Deferred tracks (Linear)

- [ ] **10. Workers boot + pg-boss v12** (joint issue/PR): pg-boss never
      starts in any deployed env, migration `0007_pgboss.sql` pre-creates
      the v10 schema while `packages/workers` depends on pg-boss ^12
      (schema 30), plus missing `boss.on("error")`/SIGTERM wiring. Must
      land together.
- [ ] **11. T1: 2FA functional test suite** (top post-audit test
      priority — enroll, verify-TOTP, backup codes, recovery;
      `apps/web/e2e/`).
- [ ] **18. CONFIRM: launching without self-serve billing** (stub only) —
      stated decision, record it here when confirmed.
- [ ] **19. File Linear (post-v1): session list/revoke UI; license gate.**
