# INFRA-REBUILD-PLAN.md

> **SUPERSEDED** by `/Users/hleb/.claude/plans/please-review-your-plan-distributed-moth.md` (the executor brief for the 17-commit branch `hlebtkachenko/infra-rebuild`). Historical reference only.

Rebuild `infra/` w/ locked decisions from `.context/infra-review-synthesis.md`. Clean rot, ship working AWS deploy, three-layer authz.

**Generated**: 2026-05-14
**Last updated**: 2026-05-14 (rebased on `origin/main` at `ab91391`)
**Status**: Ready to execute
**Decisions input**: `.context/infra-review-synthesis.md` §E (all 7 locked)
**Research input**: `.context/research-monorepo-infra.md`, `.context/research-monorepo-deps.md`, `.context/research-lac-infra.md`, `.context/decision-*.md`

## Changelog
- **2026-05-14 r2**: Rebased on main after PR #63 (apps/web + identity + tenancy + i18n) and PR #73 (module resolution). ADR numbers shifted (0015 now taken by bundler-module-resolution). `scripts/generate-env.sh` reconciliation task added. Better Auth integration in AuthGuard noted. `infra/` itself unchanged → all wave scopes intact.

---

## 1. Goal

Take `infra/` from "stale-doc + half-wired CDK" → "deployable AWS MVP w/ correct authz, pooling, backups, secrets workflow."

## 2. Non-Goals (defer post-MVP)

- Multi-account AWS (Control Tower, Identity Center)
- DR region (eu-west-1 replication)
- Billing catalog (`infra/billing/plans.yaml`)
- Honeycomb wiring (configs only, unwired)
- RDS Multi-AZ
- CMK KMS (uses default AWS-managed keys)
- Object Lock buckets
- Multi-replica api task (single replica only)

## 3. Success Criteria

| # | Criterion | How verified |
|---|-----------|--------------|
| 3.1 | All `infra/tofu/` refs purged | `grep -r 'infra/tofu' .` returns 0 results (excluding `_junk/`) |
| 3.2 | `windhoek` codename gone from CDK | `grep -ri 'windhoek' infra/` returns 0 results |
| 3.3 | `afframe` brand untouched in domain refs | `staging.afframe.com`, `app.afframe.com` still present |
| 3.4 | `cdk synth` clean for staging + production | `make synth-cdk ENV=staging` exits 0; same for production |
| 3.5 | All image tags pinned | No `:latest` in any Dockerfile or compose file |
| 3.6 | OpenFGA + Cerbos three-layer authz wired | `fga model test infra/openfga` passes; `cerbos compile --tests` passes; AuthGuard integration test passes |
| 3.7 | Migration task runs before web/api | `_deploy-aws.yml` deploys migration task first, gates app on its success |
| 3.8 | pgBouncer sidecar reachable | api container `psql -h localhost -p 6432 ...` works in deployed task |
| 3.9 | Backup + restore drill real | `infra/scripts/restore-drill.sh` actually restores, asserts row counts |
| 3.10 | SOPS+age dev secrets workflow | `sops -d infra/secrets/secrets.dev.sops.yaml` decrypts cleanly |
| 3.11 | `.env.example` matches app code | every `process.env.*` in `apps/`/`packages/` listed |
| 3.12 | ADR-0015 + ADR-0016 Accepted | files exist, status field = Accepted |
| 3.13 | All existing CI green | 14 workflows pass |

## 4. Locked Decisions (from §E)

| # | Decision |
|---|----------|
| E.1 | Workers = pg-boss only. Drop BullMQ + ioredis |
| E.2 | pgBouncer = sidecar in api task. RDS Proxy eliminated |
| E.3 | Observability = CloudWatch + Sentry at MVP. Honeycomb deferred |
| E.4 | SOPS+age for dev/staging secrets. Secrets Manager for prod |
| E.5 | Billing plans.yaml deferred post-MVP |
| E.6 | windhoek → monorepo. afframe stays as brand |
| E.7 | RLS (L1) + OpenFGA sidecar (L2) + Cerbos embedded (L3) |

---

## 5. Wave Plan

Waves run mostly sequential. Within a wave, tasks can parallelize unless dep noted. Each task = one atomic commit (some waves = one PR w/ multiple commits).

### Wave 0 — ADR capture (no code, ~30 min)

**Note**: ADR-0015 is now taken (`bundler-module-resolution`, merged in #73). Plan ADRs shifted up by one.

| Task | What | Output |
|------|------|--------|
| T0.1 | Write `docs/adr/0016-workers-pgboss-only.md` | ADR Accepted, drops BullMQ rationale |
| T0.2 | Write `docs/adr/0017-three-layer-authz.md` | ADR Accepted, RLS+OpenFGA+Cerbos w/ wiring detail. Note Better Auth = identity layer (WHO), authz = WHAT |
| T0.3 | Update `docs/adr/0010-multi-tenant-rls.md` | Add "Related: 0017" link, mark Accepted (was Proposed) |
| T0.4 | Update `docs/adr/0012-local-postgres-infra.md` | Mark Accepted (was Proposed) |

**Commit msg**: `docs(adr): add 0016 pg-boss + 0017 three-layer authz; accept 0010 + 0012`

**Acceptance**: 4 ADR files updated, statuses correct. References across `.context/*.md` updated.

---

### Wave 1 — Doc rot + dead-code cleanup (~1-2 hrs)

P0 — unblocks all reviewers.

| Task | Files | Change |
|------|-------|--------|
| T1.1 | `AGENTS.md` line 137 | Remove `infra/tofu/` mention |
| T1.1 | `ARCHITECTURE.md` line 29 | Remove `tofu/` from tree diagram |
| T1.1 | `.github/dependabot.yml` line 49 | Remove `/infra/tofu` directory monitor entry |
| T1.1 | `docs/conventions/CI-POLICY.md` line 43 | Remove `infra/tofu/**` CI path rule |
| T1.1 | `infra/cdk/README.md` | Delete "stacks throw not yet implemented" lie, delete SSM cross-stack section, fix runbook pointer to `AWS-DEPLOY.md` |
| T1.1 | `infra/README.md` | Add `observability-stack.ts` + `compose/` to layout diagram |
| T1.1 | `docs/plans/EXECUTOR-BRIEF.md`, `AWS-INTEGRATION-PLAN.md`, `CICD-PLAN.md` | Add "SUPERSEDED by ADR-0007" header. Strip Tofu-specific sections OR rewrite to current state (pick: rewrite if active reference, supersede header if only historical) |
| T1.2 | `infra/package.json` | Remove `plan:tofu`, `apply:tofu`, `fmt:tofu` scripts |
| T1.2 | `pnpm-workspace.yaml` | Add `infra` so `@workspace/infra` is real workspace member (or remove `@workspace/infra` name and merge into `@workspace/cdk` — pick one) |
| T1.3 | `infra/cdk/lib/observability-stack.ts` | Add SNS subscription target (email or ntfy topic from `INCIDENT.md` once topic name set) — OR remove SNS topic if alarms fire to nothing |
| T1.4 | `_deploy-aws.yml` | Include `Observability-{env}` stack in default `stack=all` AND in `stack=infra-only` lists |
| T1.5 | `infra/cdk/cdk.json` | Remove `drRegion=eu-west-1` (aspirational, no DR stack). Restore when DR scope materializes |

**Commit strategy**: 1 commit per logical group. ~5-7 commits total. One PR.

**Commit msgs**:
- `docs: remove stale infra/tofu references after ADR-0007 supersession`
- `chore(infra): remove dead tofu scripts from package.json`
- `chore(infra): fix cdk/README — stale stub claim + SSM section`
- `feat(infra/cdk): wire SNS subscription for billing alarm`
- `feat(ci): include Observability stack in default deploy scope`

**Acceptance**: `grep -r 'infra/tofu' . --exclude-dir=_junk --exclude-dir=node_modules` returns 0.

---

### Wave 2 — Image pinning (P1, independent, parallel w/ Wave 1)

| Task | File | Change |
|------|------|--------|
| T2.1 | `infra/cdk/lib/app-stack.ts:184` | `cloudflare/cloudflared:latest` → `cloudflare/cloudflared:2026.5.0` (verify current stable on Cloudflare release page) |
| T2.2 | `infra/compose/docker-compose.dev.yml` | `edoburu/pgbouncer:latest` → `edoburu/pgbouncer:v1.25.1-p0` (lac's pin) |
| T2.3 | `infra/compose/docker-compose.dev.yml` | `axllent/mailpit:latest` → `axllent/mailpit:v1.21.5` (verify current) |
| T2.4 | All Dockerfiles | Audit any other `:latest` refs, pin |

**Commit msg**: `chore(infra): pin all container image tags to specific versions`

**Acceptance**: `grep -r ':latest' infra/ apps/*/Dockerfile` returns 0.

---

### Wave 3 — windhoek → monorepo rename (single PR, careful)

**Pre-condition**: Wave 0 + 1 merged. Pre-bootstrap (no AWS state yet) — safe to rename freely.

| Task | What |
|------|------|
| T3.1 | Audit: `grep -ri 'windhoek' .` → classify each hit: resource-name / domain-ref / comment / brand-context |
| T3.2 | Bulk rename in CDK: `windhoek-{env}-*` → `monorepo-{env}-*` (ECR repos, ECS cluster, S3 bucket prefix, Secrets Manager paths, log groups `/ecs/...`, alarm prefixes) |
| T3.3 | RDS database name: `"windhoek"` → `"monorepo"` in `data-stack.ts` |
| T3.4 | RDS username in secret template: `"windhoek"` → `"app_owner"` (matches ADR-0010 role topology — better than generic `monorepo`) |
| T3.5 | `INCIDENT.md` ntfy topic: `windhoek-incidents-<TBD>` → `monorepo-incidents-<TBD>` |
| T3.6 | Sentry project name + Cloudflare Tunnel name (in runbooks): rename to `monorepo` |
| T3.7 | Verify untouched: `app.afframe.com`, `staging.afframe.com`, `APP_DOMAIN` values, Cloudflare Email Routing `*@afframe.com` |
| T3.8 | `cdk synth` diff vs main — verify ONLY name changes, no logical drift |
| T3.9 | **Reconcile `scripts/generate-env.sh`** w/ ADR-0010 role topology. Current script generates `DATABASE_URL=postgres://app:app_dev@localhost:5432/app_dev` — wrong role (`app` doesn't exist in `infra/compose/postgres/init.d/00-roles.sql`), wrong port (no pgBouncer), wrong DB name (after rename should be `monorepo_dev`). Fix to: `postgres://app_user:app_user_dev@localhost:6432/monorepo_dev` (pgBouncer) + `DATABASE_DIRECT_URL=postgres://app_owner:app_owner_dev@localhost:5432/monorepo_dev` (direct). Update `docs/runbooks/LOCAL-DEV.md` accordingly |
| T3.10 | Update `docs/runbooks/LOCAL-DEV.md` standalone `docker run` snippet — replace w/ `docker compose -f infra/compose/docker-compose.dev.yml up postgres pgbouncer` to use real role topology + pooling. OR: keep standalone option but make it use `app_user` role. Decide w/ Hleb |

**Commit msg**: `refactor(infra): rename codename windhoek → monorepo (afframe stays as brand)`

**Acceptance**: `grep -ri 'windhoek' infra/` returns 0. `cdk synth` clean.

---

### Wave 4 — Workers migration BullMQ → pg-boss (independent)

| Task | What |
|------|------|
| T4.1 | `packages/workers/package.json` — remove `bullmq`, `ioredis`. Add `pg-boss` if not present |
| T4.2 | `packages/workers/src/` — rewrite stub re-exports. Provide `createQueue(boss, lane)`, `createWorker(boss, lane, handler)` wrappers over pg-boss |
| T4.3 | `packages/workers/src/index.ts` — exports: `boot`, `getBoss`, lane registry |
| T4.4 | `packages/workers/src/lanes/` — define lane catalog (file per lane, e.g. `permissions-drain.ts`, `email-outbound.ts`, future) |
| T4.5 | Unit tests w/ `pg-boss` testing helpers (or fake `Boss` interface) |
| T4.6 | Remove `REDIS_URL` from any env or `.env.example` drafts |
| T4.7 | Remove ADR-0007 "Workers / Upstash Redis (deferred)" note — superseded by 0015 |

**Commit msg**: `feat(workers): migrate to pg-boss (closes BullMQ vs pg-boss conflict; ADR-0015)`

**Acceptance**: `grep -r 'bullmq\|ioredis' packages/workers/` returns 0. `pnpm test --filter @workspace/workers` passes.

---

### Wave 5 — App-stack correctness (sequential, depends on Wave 1 + 3)

P1 — closes prod deployability gaps.

| Task | What |
|------|------|
| T5.1 | **pgBouncer sidecar in AppStack** — add 4th container to api task definition. Image `edoburu/pgbouncer:v1.25.1-p0`. Mount `pgbouncer.ini` via configMap or build into image. Auth via SCRAM, fetch userlist from Secrets Manager at task start (script in container entrypoint). Expose `:6432` on task localhost only |
| T5.2 | api container env: `DATABASE_URL` → `postgres://app_user:${pwd}@localhost:6432/monorepo`. `DATABASE_DIRECT_URL` unchanged (RDS :5432, used by migration task only) |
| T5.3 | **Migration ECS task** — one-shot Fargate task definition. Image = api image. Command = `node packages/db/dist/scripts/apply-migrations.js`. Same network as web/api. Reads `DATABASE_DIRECT_URL` directly to RDS. ExitCode 0 = success |
| T5.4 | `_deploy-aws.yml` — deploy step ordering: 1) deploy Data, 2) RunTask migration, 3) wait for migration ExitCode 0, 4) deploy App. Fail deploy on migration non-zero |
| T5.5 | `apps/api/Dockerfile` — add `HEALTHCHECK CMD curl -fsS http://127.0.0.1:${PORT}/health || exit 1` |
| T5.6 | Verify ADR-0010 GUC contract preserved through pgBouncer transaction mode (existing `packages/db/tests/pgbouncer-canary.test.ts` should suffice; extend if needed) |

**Commit msgs** (split into 3 PRs):
1. `feat(api): add health endpoint + HEALTHCHECK in Dockerfile`
2. `feat(infra/cdk): pgBouncer sidecar in api Fargate task (E.2)`
3. `feat(infra/cdk): one-shot migration ECS task + deploy ordering`

**Acceptance**: Deployed task has 4 containers running; api reaches RDS via `localhost:6432`; migration task ran exit-0 before app started.

---

### Wave 6 — Three-layer authz (E.7) — largest wave, 4 sub-PRs

**Depends on**: Wave 0 (ADR-0016), Wave 4 (workers ready for drain lane).

#### Sub-PR 6A — Cerbos foundation (~1 day)

| Task | What |
|------|------|
| T6A.1 | `infra/cerbos/policies/` — author YAML policies. Resources: `invoice`, `journal_entry`, `ledger_entry`, `account`, `counterparty`, `bank_account`, `vat_rate`, `numerical_series`, `project`, `file`. Principals: `user`, `agent`. Cover: action gating, immutability (journal_entry/ledger_entry no delete), `can_administer`-gated edits (vat_rate, numerical_series), AI agent restrictions |
| T6A.2 | `infra/cerbos/common/conditions.yaml` — shared CEL expressions (workflow state, money limits if needed) |
| T6A.3 | `infra/cerbos/.cerbos-tests/` — assertion files mirroring policy file names |
| T6A.4 | `infra/cerbos/build.sh` — `cerbos compile --output infra/cerbos/policies/bundle.wasm infra/cerbos/policies` |
| T6A.5 | `apps/api/Dockerfile` — `RUN ./infra/cerbos/build.sh && cp infra/cerbos/policies/bundle.wasm /app/cerbos-bundle.wasm` |
| T6A.6 | `apps/api/src/authz/cerbos.module.ts` — NestJS module loading `@cerbos/embedded` from `/app/cerbos-bundle.wasm`. Singleton client |
| T6A.7 | `apps/api/package.json` — add `@cerbos/embedded` |
| T6A.8 | CI job `cerbos-policies-test.yml` — runs `cerbos compile --tests` on PR |
| T6A.9 | Wire `CerbosModule` into `AuthGuard` (next sub-PR) — placeholder export for now |

**Commit msg**: `feat(authz): cerbos embedded policy engine (L3 conditional + action gating, ADR-0016)`

**Acceptance**: `cerbos compile --tests infra/cerbos/policies infra/cerbos/.cerbos-tests` exits 0 w/ all assertions pass. CI workflow green.

#### Sub-PR 6B — OpenFGA model + tooling (~1 day)

| Task | What |
|------|------|
| T6B.1 | `infra/openfga/model.fga` — port lac semantics. Tier: workspace → org → resource. Roles per tier. Resource types matching domain (10+ types). Special semantics: journal_entry/ledger_entry no `can_delete`, agent principal no `can_administer`, guest cascade blocker, `viewer` ad-hoc slot on invoice + file, `can_administer`-gated edits on vat_rate + numerical_series |
| T6B.2 | `infra/openfga/tests/00-workspace-roles.fga.yaml` — workspace role assertions |
| T6B.3 | `infra/openfga/tests/01-organization-inheritance.fga.yaml` — workspace→org inheritance + cascade tests |
| T6B.4 | `infra/openfga/tests/02-resource-grants.fga.yaml` — all resource types (new vs lac — lac under-tested) |
| T6B.5 | `infra/openfga/tests/03-agent-action-gates.fga.yaml` — AI principal semantics |
| T6B.6 | `infra/openfga/tests/04-external-shares.fga.yaml` — ad-hoc viewer grants on invoice + file |
| T6B.7 | `infra/openfga/bootstrap.mjs` — idempotent: check existing store named `monorepo-{env}`, create if absent. Write/update model. Capture store_id + model_id. Write back to AWS Secrets Manager OR SSM parameter `/monorepo/{env}/openfga/store-id`, `/.../model-id` |
| T6B.8 | CI job `openfga-model-test.yml` — runs `fga model test infra/openfga` on PR. Uses `openfga/cli` Docker image |
| T6B.9 | `infra/openfga/docker-compose.openfga.yml` — compose service for local dev. Profile `auth`. Reuses local Postgres. Includes one-shot `openfga-migrate` step on startup |
| T6B.10 | `infra/openfga/README.md` — model versioning + bootstrap doc |

**Commit msg**: `feat(authz): openfga model + tests (L2 ReBAC, ADR-0016)`

**Acceptance**: `fga model test infra/openfga` 100% pass. Local `docker compose --profile auth up` boots OpenFGA on `localhost:8080`.

#### Sub-PR 6C — OpenFGA sidecar in AppStack + RDS schema (~1 day)

| Task | What |
|------|------|
| T6C.1 | `infra/cdk/lib/data-stack.ts` — add `openfga` schema creation. Either: (a) via post-deploy CDK CustomResource running `CREATE SCHEMA openfga AUTHORIZATION app_owner`; (b) as part of migration task that runs `openfga migrate` |
| T6C.2 | `infra/cdk/lib/app-stack.ts` — add 5th container `openfga`. Image `openfga/openfga:v1.8.x` (pin exact). Memory 200 MiB reserve, 400 MiB hard limit. Port 8080. `OPENFGA_DATASTORE_ENGINE=postgres`, `OPENFGA_DATASTORE_URI` from Secrets Manager (separate URI for `openfga` schema; same RDS cluster) |
| T6C.3 | Healthcheck on OpenFGA container: `wget -qO- http://localhost:8080/healthz` |
| T6C.4 | CW log group `/ecs/monorepo-{env}/openfga`, 7d retention (or align w/ other containers) |
| T6C.5 | `_deploy-aws.yml` — add post-deploy step running `infra/openfga/bootstrap.mjs` against deployed OpenFGA endpoint. Use temporary network access via ECS Exec OR via short-lived Lambda. Decide: Lambda approach cleaner |
| T6C.6 | Verify task fits in 2 GB. Measure OpenFGA RAM in compose under representative tuple load (~10k tuples). If >300 MB → bump task to 2.5 GB and update CDK constants |

**Commit msg**: `feat(infra/cdk): openfga sidecar in api task + rds schema (L2, ADR-0016)`

**Acceptance**: Deployed task shows OpenFGA on `localhost:8080` healthy; bootstrap script wrote store + model; Secrets Manager has `OPENFGA_STORE_ID` + `OPENFGA_MODEL_ID` populated.

#### Sub-PR 6D — Drain worker + AuthGuard (~2 days)

| Task | What |
|------|------|
| T6D.1 | `packages/workers/src/lanes/permissions-drain.ts` — pg-boss lane. Polls `permissions_outbox`, transforms rows to OpenFGA tuples, writes via `@openfga/sdk`. On success: mark outbox row drained. On failure: retry w/ backoff. Idempotent. Single drainer per env |
| T6D.2 | `packages/workers/src/boot.ts` — register `permissions-drain` lane on boot |
| T6D.3 | `apps/api/src/authz/openfga.module.ts` — NestJS module wrapping `@openfga/sdk` client. Reads `OPENFGA_API_URL=http://localhost:8080`, `OPENFGA_STORE_ID`, `OPENFGA_MODEL_ID` from env (injected by AppStack from Secrets Manager) |
| T6D.4 | `apps/api/src/authz/authz.guard.ts` — NestJS guard. Order: 1) extract user via `auth.api.getSession()` from `@workspace/auth/server` (Better Auth handles identity), 2) open tx + `SET LOCAL app.organization_id/user_id` (L1 RLS), 3) `cerbos.checkResource(...)` (L3), 4) for list/share/transfer actions: `openfga.check(...)` or `listObjects(...)` (L2), 5) proceed |
| T6D.5 | `apps/api/src/authz/authz.module.ts` — combine modules. Export `@CanAccess(resource, action)` decorator |
| T6D.6 | `apps/web/lib/authz.ts` — same three-layer check for Next.js layouts (Node runtime, NOT edge proxy). `(app)/workspace/layout.tsx` + `(app)/[orgSlug]/layout.tsx` call `requireAccess(resource, action)` server-side. Edge `proxy.ts` keeps cookie-only optimistic check (unchanged) |
| T6D.7 | Integration tests in `apps/api/tests/authz/` AND `apps/web/tests/authz/` — exercise all 3 layers in real DB w/ compose `auth` profile |
| T6D.8 | Update `docs/runbooks/AWS-DEPLOY.md` — add OpenFGA migrate step to bootstrap order |
| T6D.9 | Update `docs/INVENTORY.md` — add OpenFGA + Cerbos to DORA register |
| T6D.10 | Verify Better Auth tables (`auth_session`, `auth_account`, `auth_verification`, `two_factor`, `app_user`) coexist w/ OpenFGA schema. OpenFGA migrate creates own schema `openfga`; no table-name collisions |

**Commit msg**: `feat(api): three-layer AuthGuard + permissions outbox drain (ADR-0016)`

**Acceptance**: Integration test boots compose stack, seeds outbox rows, drain worker syncs them, authz check against API returns correct decisions from all 3 layers.

---

### Wave 7 — Backup + restore (independent, parallel w/ Wave 6)

| Task | What |
|------|------|
| T7.1 | `infra/scripts/pg-dump-nightly.sh` — port lac, rename `GARAGE_S3_*` → `APP_S3_*`. Keep: pg_dumpall globals, pg_dump -Fc, per-org NDJSON+zstd, UUID regex validation. Add proper error handling (no `\|\| true` on psql calls) |
| T7.2 | `infra/scripts/wal-archive.sh` — port lac, rename vars |
| T7.3 | `infra/scripts/restore-drill.sh` — **REAL** restore, NOT skeleton: download latest from S3, decompress, boot scratch PG18 container, restore, **assert row counts** per org-scoped table (list from `packages/db/src/tenancy.ts` constant). Exit 1 on count mismatch |
| T7.4 | `infra/scripts/seed-dev.sh` — thin wrapper over `pnpm seed:dev` |
| T7.5 | `infra/cdk/lib/backup-stack.ts` — ECS Scheduled Task. Schedule: 03:00 UTC daily. Image = backup util image (built from `infra/Dockerfile.backup`). IAM: S3 PUT to `monorepo-{env}-backups`. Reads `DATABASE_DIRECT_URL` from Secrets Manager |
| T7.6 | `.github/workflows/backup-restore-monthly.yml` — replace fake `bash -n` job. Real: on 2nd of month, RunTask backup, then RunTask restore against scratch DB, assert. Alarm on fail |
| T7.7 | S3 backup bucket in DataStack: `monorepo-{env}-backups`, versioned, lifecycle IA 30d → Glacier 90d → DeepArchive 365d. NO auto-expire (audit compliance) |

**Commit msgs**:
1. `feat(infra/scripts): real backup + restore scripts with row-count assertions`
2. `feat(infra/cdk): backup stack w/ ecs scheduled task + s3 bucket`
3. `feat(ci): monthly backup-restore drill (replaces bash -n fake)`

**Acceptance**: `infra/scripts/restore-drill.sh` against local compose DB exits 0 w/ matching row counts. Monthly CI workflow registered.

---

### Wave 8 — SOPS+age secrets workflow (E.4, independent)

| Task | What |
|------|------|
| T8.1 | `infra/secrets/.sops.yaml` — age recipient = Hleb's public key. `encrypted_regex` covering 20+ specific secret key names (mirror lac pattern) |
| T8.2 | `infra/secrets/secrets.dev.sops.yaml.example` — template shape, monorepo-shaped keys (no Garage/Caddy noise). Encrypt actual dev secrets file separately |
| T8.3 | `infra/secrets/secrets.staging.sops.yaml.example` — template |
| T8.4 | `infra/secrets/README.md` — onboarding: `brew install sops age`, `age-keygen`, share pubkey w/ Hleb for re-encryption, decrypt loop `sops -d`, edit loop `sops infra/secrets/secrets.dev.sops.yaml` |
| T8.5 | `.gitignore` — ensure `secrets.*.sops.yaml` (unencrypted) ignored; `.sops.yaml` + `secrets.*.sops.yaml.example` tracked |
| T8.6 | Update `docs/runbooks/SECRETS.md` — add SOPS section. Clarify SOPS = dev/staging-shared, Secrets Manager = prod |

**Commit msg**: `feat(infra/secrets): adopt SOPS+age for dev + staging shared secrets (E.4)`

**Acceptance**: `sops -d infra/secrets/secrets.dev.sops.yaml` decrypts (after committing an encrypted file). `age-keygen` + re-encrypt loop documented.

---

### Wave 9 — `.env.example` + dev experience (independent)

**Note**: `scripts/generate-env.sh` already exists (created in PR #63) — generates `apps/web/.env.local` w/ random secrets for the dev quickstart. This wave ADDS the canonical `.env.example` at repo root as full env contract reference (separate purpose). Wave 3 T3.9 reconciles the script w/ ADR-0010 role topology.

| Task | What |
|------|------|
| T9.1 | `.env.example` at repo root — canonical env REGISTRY (not generator). Sections: Next.js, API server, Database (DATABASE_URL + DATABASE_DIRECT_URL), AWS (region + account `<TBD>`), Email (RESEND_API_KEY, EMAIL_FROM), Auth (BETTER_AUTH_SECRET, BETTER_AUTH_URL, NEXT_PUBLIC_BETTER_AUTH_URL, BETTER_AUTH_TRUSTED_ORIGINS, APP_TOKEN_SECRET), Observability (SENTRY_DSN, HONEYCOMB_API_KEY commented), pg-boss (no REDIS_URL — removed), OpenFGA (URL + STORE_ID + MODEL_ID), Cerbos (none — embedded). Each var commented: dev / staging / production / build-time. Cross-ref `scripts/generate-env.sh` for dev quickstart subset |
| T9.2 | Update `docs/runbooks/AWS-DEPLOY.md` — env section refs `.env.example` |
| T9.3 | `infra/compose/pgadmin/servers.json` — port lac, use `${WORKSPACE_ROOT}` or relative path. 5 entries: app_owner direct, app_user RLS, app_owner via pgbouncer, staging placeholder, prod placeholder |
| T9.4 | `infra/compose/pg_exporter/queries.yaml` — port lac's 4 pg-boss gauges (VALUES cross-join pattern) |
| T9.5 | `infra/compose/docker-compose.dev.yml` — add profiles: `observability` (pg_exporter), `auth` (openfga). Default `up` stays minimal: postgres + pgbouncer + mailpit only |
| T9.6 | Update `docs/runbooks/LOCAL-DEV.md` — fix migration path (currently says `packages/db/src/migrations/`, real location is `packages/db/migrations/`). Reflect compose-based dev path from T3.10 |

**Commit msgs**:
1. `feat(env): canonical .env.example for repo`
2. `feat(infra/compose): pgadmin + pg_exporter configs (lac patterns adapted)`
3. `feat(infra/compose): split heavy services into compose profiles`

**Acceptance**: `cp .env.example .env.local` then app boots in dev. `docker compose --profile auth up` boots OpenFGA. `docker compose --profile observability up` boots pg_exporter.

---

### Wave 10 — Observability skeleton (deferred wiring per E.3, independent)

| Task | What |
|------|------|
| T10.1 | `infra/observability/otel-collector.yaml` — port lac. Honeycomb OTLP exporter. Grafana Cloud exporter commented. `resourcedetection/aws` processor |
| T10.2 | `infra/observability/firelens-fluentbit.conf` — port lac. CloudWatch always-on + OTel forward conditional |
| T10.3 | `infra/observability/parsers.conf` — port lac |
| T10.4 | `infra/observability/README.md` — explains: configs ready, wire to AppStack when Honeycomb key provisioned (per ADR-0002 + E.3). Do NOT add to task def yet |
| T10.5 | Sentry: add `@sentry/node` to `apps/api/package.json` + `@sentry/nextjs` to `apps/web/package.json`. Init w/ `SENTRY_DSN` env. Tracing OFF (errors only at MVP per E.3) |
| T10.6 | Update `docs/runbooks/AWS-DEPLOY.md` — add Sentry to bootstrap secrets list. Note Honeycomb deferred |

**Commit msgs**:
1. `feat(infra/observability): otel + firelens configs (unwired, ready for wave 2)`
2. `feat(api,web): sentry error monitoring (E.3 MVP observability)`

**Acceptance**: Sentry SDK loads on boot, `SENTRY_DSN` empty = noop. OTel configs exist in `infra/observability/` w/ README explaining deferred wiring.

---

### Wave 11 — Final verification + ship (~2-3 hrs)

| Task | What |
|------|------|
| T11.1 | `cdk synth --all --context env=staging` clean |
| T11.2 | `cdk synth --all --context env=production` clean |
| T11.3 | `cdk diff` vs hypothetical bootstrapped state — verify no surprise resources |
| T11.4 | Full local boot: `docker compose --profile auth up`, `pnpm dev`, run AuthGuard integration test |
| T11.5 | Run real restore drill: `infra/scripts/restore-drill.sh` exits 0 w/ row counts asserted |
| T11.6 | All 14+ existing CI workflows green on PR |
| T11.7 | New CI workflows added (cerbos test, openfga test, backup-restore monthly) all green |
| T11.8 | Update `infra/README.md` — final state matches reality (4 stacks, 5 containers, profiles documented) |
| T11.9 | Update `docs/INVENTORY.md` — DORA register entries for OpenFGA, Cerbos, pgBouncer, OTel configs (status: deployed / configured / deferred) |
| T11.10 | Flip `vars.AWS_BOOTSTRAPPED = true` only after manual AWS account bootstrap per `AWS-DEPLOY.md` runbook — NOT part of this plan |

**Commit msg**: `chore(infra): final README + INVENTORY sync for rebuild`

**Acceptance criteria 3.1-3.13 all checked.**

---

## 6. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| OpenFGA RAM exceeds 200 MB at load | Medium | Task OOM | Spike in compose first w/ 10k tuples. Bump task to 2.5 GB (+$3.68/mo) if needed |
| Cerbos WASM compile breaks on policy complexity | Low | CI fails | Catch in T6A.1. Fallback: ship Cerbos as sidecar instead of embedded (one config swap) |
| Drain worker lag → tuple staleness window | Medium | Auth check returns stale answer briefly (~seconds) | Document expected lag. Add metric: outbox-row-age. Alarm if >10s sustained |
| `openfga` schema migration conflicts w/ app migration | Low | Deploy fails | Run `openfga migrate` BEFORE `apply-migrations.ts` in migration task. Sequential |
| windhoek→monorepo rename leaves broken refs | Low | Deploy diff noisy or fails | `grep -ri 'windhoek'` clean before merge. `cdk synth diff` review |
| pgBouncer sidecar SCRAM auth misconfig | Medium | App can't connect to DB | Mirror dev compose config exactly. Use existing `pgbouncer-canary.test.ts`. Verify in staging first |
| Sentry adds bundle weight to apps/web | Low | Cold start slower | `@sentry/nextjs` is tree-shakeable. Verify w/ size-limit workflow |
| Lac model semantics miss edge case | Medium | Authz hole | Expand test coverage in 6B vs lac (lac only 18 assertions; aim for 50+) |
| OpenFGA bootstrap script crashes mid-run | Low | Partial model state | Make idempotent: check existing store before create. Re-run safe |
| Backup script silently fails w/ empty dump | Medium | False confidence | restore-drill.sh asserts row counts; alarm on monthly CI fail |

## 7. Rollback Strategy

Each wave = independent PR. Revert is `git revert` + redeploy. Specifically:

- **Wave 0-2 (cleanup)**: low-risk, pure doc/config. Revert if needed.
- **Wave 3 (rename)**: pre-bootstrap only. AFTER bootstrap = breaking change for already-deployed resources. **Must merge before flipping `AWS_BOOTSTRAPPED=true`**.
- **Wave 4 (pg-boss)**: app code change. Revert restores BullMQ. Acceptable, isolated to `packages/workers`.
- **Wave 5 (app-stack)**: revert removes pgbouncer sidecar + migration task. Pre-bootstrap = no impact. Post-bootstrap = app reverts to direct RDS connection (works, no pooling).
- **Wave 6 (authz)**: split into 4 sub-PRs. Revert 6D (drain+guard) first, then 6C (sidecar), etc. App still functional w/o L2/L3 — L1 RLS still enforces. AuthGuard falls back to "deny new actions" w/ feature flag.
- **Wave 7-10**: independent additions. Revert any without breaking others.

## 8. Parallelization Notes

Solo dev w/ Claude → serialize but stack PRs.

Wave dependency graph:
```
W0 (ADRs) ─┬─→ W1 (cleanup) ─┬─→ W3 (rename) ─→ W5 (app-stack) ─┐
           │                  │                                  ├─→ W11 (verify)
           │                  └─→ W2 (image pin) ─────────────────┤
           │                                                      │
           ├─→ W4 (workers) ────────────────────────────────────-─┤
           ├─→ W6 (authz) [depends W0 + W4 for drain] ────────────┤
           ├─→ W7 (backup) ───────────────────────────────────────┤
           ├─→ W8 (sops) ─────────────────────────────────────────┤
           ├─→ W9 (env+compose) ──────────────────────────────────┤
           └─→ W10 (observability skeleton) ──────────────────────┘
```

W4, W6, W7, W8, W9, W10 can run in any order after W0. Real bottleneck = W3 + W5 (sequential, affect CDK).

## 9. Estimated Effort

| Wave | Effort | Calendar (solo + Claude) |
|------|--------|--------------------------|
| W0 | 30 min | 30 min |
| W1 | 1-2 hrs | half day |
| W2 | 30 min | inline w/ W1 |
| W3 | 1 hr | half day |
| W4 | 4 hrs | 1 day |
| W5 | 6 hrs | 1-2 days |
| W6 | 4 days | 1 week |
| W7 | 1 day | 1-2 days |
| W8 | 4 hrs | half day |
| W9 | 3 hrs | half day |
| W10 | 4 hrs | half day |
| W11 | 2-3 hrs | half day |
| **Total** | **~12-14 dev days** | **~3 calendar weeks solo** |

W6 dominates. Could split into separate epic if needed.

## 10. Definition of Done

All success criteria §3 checked. ADRs Accepted. CI green. `vars.AWS_BOOTSTRAPPED` still false (this plan does NOT bootstrap AWS account — that's a separate runbook execution per `docs/runbooks/AWS-DEPLOY.md`).

After this plan = infra is **deploy-ready**, awaiting bootstrap ceremony.

---

## Appendix A — File-level Change Summary

New files:
- `docs/adr/0016-workers-pgboss-only.md`
- `docs/adr/0017-three-layer-authz.md`
- `docs/plans/INFRA-REBUILD-PLAN.md` (this file)
- `infra/cdk/lib/backup-stack.ts`
- `infra/cerbos/**` (policies, tests, build.sh)
- `infra/openfga/**` (model, tests, bootstrap, compose)
- `infra/observability/**` (otel, firelens, parsers, README)
- `infra/secrets/**` (.sops.yaml, examples, README)
- `infra/scripts/{pg-dump-nightly,wal-archive,restore-drill,seed-dev}.sh`
- `infra/compose/pgadmin/servers.json`
- `infra/compose/pg_exporter/queries.yaml`
- `infra/Dockerfile.backup` (built image for backup ECS task)
- `apps/api/src/authz/{cerbos,openfga,authz}.module.ts` + `authz.guard.ts`
- `apps/web/lib/authz.ts` (server-side `requireAccess` helper for Node-runtime layouts)
- `packages/workers/src/lanes/permissions-drain.ts`
- `.env.example` (canonical registry — distinct from `scripts/generate-env.sh` dev quickstart)
- `.github/workflows/{cerbos-policies-test,openfga-model-test,backup-restore-monthly}.yml`

Modified files (high-traffic):
- `infra/cdk/lib/{app,data,observability,network}-stack.ts`
- `infra/cdk/bin/app.ts`
- `infra/cdk/cdk.json`
- `infra/Makefile`
- `infra/package.json`
- `infra/README.md`
- `infra/cdk/README.md`
- `infra/compose/docker-compose.dev.yml`
- `infra/compose/postgres/init.d/00-roles.sql` (audit, no expected change)
- `apps/api/Dockerfile`
- `apps/api/src/**` (AuthGuard integration)
- `apps/web/Dockerfile` (Sentry)
- `packages/workers/package.json`, `src/**`
- `pnpm-workspace.yaml`
- `AGENTS.md`, `ARCHITECTURE.md`
- `.github/dependabot.yml`
- `.github/workflows/_deploy-aws.yml`
- `docs/adr/0010-multi-tenant-rls.md`, `0012-local-postgres-infra.md`
- `docs/runbooks/{AWS-DEPLOY,SECRETS,INCIDENT,PUBLIC-REPO-CHECKLIST,LOCAL-DEV}.md`
- `scripts/generate-env.sh` (T3.9 — role topology reconciliation)
- `docs/plans/{EXECUTOR-BRIEF,AWS-INTEGRATION-PLAN,CICD-PLAN}.md` (mark superseded or rewrite)
- `docs/INVENTORY.md`

Deleted (none expected — infra/tofu/ already in `_junk/`).

## Appendix B — Rebase delta (origin/main ab91391, 2026-05-14)

Two new PRs merged after this plan's first draft:

### PR #73 (`d0049a8`) — Bundler module resolution alignment
- Changed `packages/{db,observability,testcontainers}` to `moduleResolution: "Bundler"`
- Added `packages/typescript-config/node-library.json`
- Added `docs/adr/0015-bundler-module-resolution.md` — **claims ADR-0015 slot**, forcing my plan ADRs to shift to 0016 + 0017
- Impact on plan: ADR renumbering only

### PR #63 (`ab91391`) — apps/web + identity + tenancy + i18n foundation
- **`apps/web/`** now real Next.js 16 App Router (not stub). Has `app/`, `components/`, `hooks/`, `i18n/`, `lib/`, `proxy.ts`
- **`packages/auth/`** NEW — Better Auth via Drizzle adapter. Owns identity (WHO). Tables: `app_user`, `auth_session`, `auth_account`, `auth_verification`, `two_factor`. Multi-tenant membership lives outside Better Auth in `workspace_membership` + `organization_membership`
- **`packages/i18n/`** NEW — next-intl config, locale resolution (cookie → session → default)
- **`apps/web/proxy.ts`** — edge-runtime optimistic cookie check (not real authz). Real authz happens in Node-runtime layouts. AuthGuard pattern (W6.D) plugs in there
- **`scripts/generate-env.sh`** — dev quickstart, generates `apps/web/.env.local` w/ random secrets. **CONFLICTS with ADR-0010 role topology** — fixed in T3.9
- **`scripts/dev-down.sh`** — kill :3000 + stop `app-dev-pg` docker container
- **`docs/runbooks/LOCAL-DEV.md`** NEW — bring up dev w/ standalone docker. Wrong migration path (T9.6 fixes)
- **`docs/adr/0015-bundler-module-resolution.md`** — Accepted
- DB schema updates: more auth-related fields, `impersonation` table, permission template tweaks
- `packages/email/` now has real `templates.ts` + `transport.ts` (Resend + console fallback)
- `.github/workflows/ci.yml` — Playwright install fix (no plan impact)

### What stayed unchanged
- `infra/` directory — ZERO file changes. All wave scopes intact
- Stale `infra/tofu/` refs in AGENTS.md, ARCHITECTURE.md, dependabot.yml, CI-POLICY.md — all still present (W1.1 still needed)
- `packages/workers` still declares BullMQ + ioredis (only stub `src/index.ts`) — W4 still needed
- `cdk/` stacks unchanged — `windhoek` codename still everywhere (W3 still needed)
- pgBouncer still local-only — prod sidecar still missing (W5 still needed)
- No OpenFGA + Cerbos files yet — W6 still needed
- Backup scripts absent — W7 still needed
- SOPS workflow absent — W8 still needed
- Migration files still at `packages/db/migrations/` (NOT `src/migrations/` per LOCAL-DEV.md)

### New constraints to honor
1. **Better Auth** is the identity layer — AuthGuard must call `auth.api.getSession()` from `@workspace/auth/server`, NOT roll own session extraction
2. **`apps/web/proxy.ts`** must stay edge-runtime — no DB calls. AuthGuard (W6.D) is Node-runtime (layouts + apps/api)
3. **next-intl** locale resolution reads `app_user.locale` via Better Auth session. OK as-is
4. **Better Auth tables** are foundational — OpenFGA schema (`openfga.*`) must NOT collide (T6D.10 verifies)
5. **`scripts/generate-env.sh`** output values are dev-only contract. After T3.9 fix, must match ADR-0010 role topology (`app_user`, port 6432, DB `monorepo_dev`)

---

## Appendix C — Cross-References

- `.context/infra-review-synthesis.md` — locked decisions (§E.1-E.7)
- `.context/decision-pgbouncer-prod.md` — W5 rationale
- `.context/decision-observability-mvp.md` — W10 + E.3 rationale
- `.context/decision-authz-stack.md` — W6 background (superseded conclusion at top)
- `.context/decision-casbin-vs-openfga.md` — W6 Casbin rejection rationale
- `.context/research-monorepo-infra.md` — W1/W3 cleanup targets
- `.context/research-monorepo-deps.md` — W9 env contract source
- `.context/research-lac-infra.md` — W6/W7/W8/W9 pattern source (KEEP-IDEA verdicts)
- `docs/adr/0007-mvp-single-account-cdk-only.md` — IaC scope
- `docs/adr/0008-cloudflare-tunnel-and-email.md` — network topology
- `docs/adr/0010-multi-tenant-rls.md` — L1 authz contract
- `docs/runbooks/AWS-DEPLOY.md` — post-this-plan bootstrap ceremony
