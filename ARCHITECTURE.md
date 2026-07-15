# Architecture

System-wide architecture reference. Concise overview only; deep design documents live under `docs/adr/` and `docs/specs/`.

## Product Shape

Agent-native Czech accounting platform. A single accountant runs many client organizations; every operation is both human-usable (UI) and machine-operable (AI agent calling the same tool registry). Multi-tenant isolation is load-bearing: CZ 10-year retention liability makes tenant-leak cost high.

## Monorepo Layout

pnpm workspaces + Turborepo.

```
apps/
  web/                             Next.js 16 App Router, React 19
  admin/                           Next.js 16 staff admin surface (workspace-allowlisted)
  api/                             NestJS versioned REST API (API-key auth, rate limiting, OpenAPI)
  mcp/                             Official MCP server for the public API (@afframe/mcp) — also Brain's local stdio bridge (ADR-0025)
  cli/                             Official command-line client for the public API (@afframe/cli) — also the `afframe brain` operator commands
  bot/                             Telegram dev bot — sole owner of Telegram I/O; grammY on a Cloudflare Worker
packages/
  ui/                              shadcn/ui component library (120 registry entries, Storybook, Vitest)
  db/                              Drizzle schema + RLS + migrations
  auth/                            Better Auth + session binding + RLS GUC
  brain/                           Afframe Brain — agent-native accounting-booking client (unprivileged API/MCP client, not a server; ADR-0025)
  shared/                          Shared utilities, Zod schemas
  sdk/                             Official TypeScript SDK for the public API (@afframe/sdk)
  notify/                          Typed client + message contract for the Telegram bot (POSTs to bot /ingest)
  i18n/                            Internationalization (next-intl)
  config/                          Runtime config loader (AWS Secrets Manager / SSM)
  workers/                         pg-boss background job handlers
  observability/                   pino + OpenTelemetry helpers
  email/                           React Email templates + transport
  pdf/                             PDF/A-3 generation + QR Platba
  storage/                         Org-scoped object storage
  testcontainers/                  Integration test containers
  eslint-config/                   Shared ESLint flat configs
  typescript-config/               Shared TypeScript presets
infra/
  cdk/                             AWS CDK v2 app stacks (network, data, app, security, observability, backup)
  cerbos/                          L3 authz policies + tests + DockerImageAsset (ADR-0018)
  openfga/                         L2 authz model + tests + SSM bootstrap (ADR-0018)
  cloudflare/                      Cloudflare Worker for the Tunnel edge surface
  cloudflare-sleeping/             Edge "app is asleep" page for cold-paused envs
  vault/                           Vault VPS bring-up assets (secrets-admin.afframe.com; secrets migration)
  compose/                         Local Docker Compose (Postgres 18 + pgBouncer + pgTap + auth + observability profiles)
  observability/                   OTel + FireLens configs (UNWIRED in CDK; ADR-0002 trip-wire)
  openstatus/                      Status page monitors-as-code (OpenStatus on OVH VPS, off-AWS; ADR-0019)
  scripts/                         backup + restore + WAL archive scripts
docs/
  adr/                             Architecture Decision Records
  api/                             API architecture guide + OpenAPI specs
  runbooks/                        Operational runbooks
  specs/                           Design specifications
  conventions/                     Commit + CI conventions
  plans/                           Strategic execution plans
  compliance/                      Compliance + regulatory mapping
```

## Tenancy Tiers

Three tiers, each with its own FORCE RLS boundary and GUC:

1. **Global** identity + permission catalog. No tenant scoping. `app_user`, `auth_*`, `permission_rule`.
2. **Workspace tier** accounting office. GUC `app.workspace_id`. Contains `workspace`, `workspace_membership`, `audit_event`.
3. **Organization tier** individual client book. GUC `app.organization_id`. Contains `organization` + all ledger, period, account, invoice, and per-org AI budget tables.

A workspace aggregates permissions, audit, and billing across the organizations it contains. `organization.workspace_id` is set at creation and is immutable (enforced by trigger).

Every workspace- or organization-scoped table has `FORCE ROW LEVEL SECURITY`. Table owners bypass policy without `FORCE`, so every migration that adds a tenant-scoped table must set both `ENABLE` and `FORCE`.

## Tier Choke Points

All app reads and writes go through one of:

- `withWorkspace(workspaceId, userId, fn)` binds `app.workspace_id` + `app.user_id`.
- `withOrganization(organizationId, userId, fn)` binds `app.organization_id` (and re-derives `app.workspace_id` from `organization.workspace_id` in the same transaction).
- `withAdminBypass()` takes `SET LOCAL ROLE lac_admin` (BYPASSRLS) for backfill, admin tooling, and cross-tenant lookups.

The helpers are nestable via SAVEPOINT. Pass `outerTx` to nest inside an existing transaction; Drizzle opens a SAVEPOINT rather than a new top-level transaction. Prior GUCs (`app.organization_id`, `app.user_id`, `app.workspace_id`) are snapshot-and-restored in `finally` because `set_config(..., true)` is transaction-scoped, not SAVEPOINT-scoped — `ROLLBACK TO SAVEPOINT` does not undo `set_config`. The save/restore pair is load-bearing. `withWorkspace` additionally clears `app.organization_id` in nested calls to prevent workspace-tier reads from inheriting an org GUC from an outer scope.

## Request Flow

1. Client hits `/workspace/*` or `/<org-slug>/*`.
2. Middleware verifies session, resolves workspace and organization from cookie + URL, enforces reserved-slug list, checks MFA gate.
3. Route handler or Server Action calls a domain tool handler.
4. Domain handler writes through the right tier-bound DB (RLS enforced by Postgres).
5. `audit_event` row is written in the same transaction.

AI requests flow through SSE endpoint, the agent loop, and dispatch to the same domain tool handlers.

## AI Safety Layer

> **Status: Planned — not yet implemented.**

Five primitives:

1. **Executor + advisor model split.** Two Claude models, one role each. Executor (Sonnet) runs the tool-use loop and streams tokens. Advisor (Opus) runs a single non-streaming call per tool dispatch to score correctness.

2. **Advisor verdict loop.** Every `approval: required` and `approval: confidence` dispatch passes through the advisor. Returns a 0..100 score plus explicit verdict (`approve` | `reject` | `escalate_to_human`). Approve auto-commits; reject hard-stops; escalate queues a `user_task` row.

3. **AI-deny overlay.** Subtractive, global. Hard-blocks destructive tools from AI dispatch path even when the permission chain would authorize them.

4. **Per-org budget + cooldown.** Daily/monthly CZK ceilings. On breach, writes cooldown row. Chat route short-circuits with 429 when window is active.

5. **Confidence gate on mutations.** Executor self-reports confidence score per tool_use; agent loop escalates to `user_task` when score < 95 on `approval: confidence` tools. Organization id is never carried in tool input.

## Afframe Brain

Distinct from the (planned) in-app AI Safety Layer above: **Afframe Brain is the operator-driven accounting agent, and it is implemented + live** (pre-launch — every write HELDs at cold start; nothing auto-applies). It is an **unprivileged external client**, not a server-side worker (ADR-0025, amended 2026-07-01): a Claude Code session runs `afframe brain` commands that drive a nested, sandboxed Agent-SDK session through a **local stdio MCP bridge** (`@afframe/mcp` via `tsx`) to the public REST API — there is no Brain server. Every booking is gated **server-side** by `runGatedWrite` (`apps/api/src/v1/accounting/accounting-writes.gate.ts`): a three-way AND (client confidence · server veto · server-recomputed green score); at cold start an unconditional `extraction_failed` floor forces every write to `202 HELD` for human approval at `/{orgSlug}/accounting/approvals` (an agent key is 403 there). Confidence is infrastructure-gated + calibrated, never model-verbalized (ADR-0026); learned OCR-template state is workspace-scoped (ADR-0029); learning artifacts land only via PR (ADR-0027).

Full reference: [`docs/brain/README.md`](docs/brain/README.md) (index), [`docs/brain/TECHNICAL.md`](docs/brain/TECHNICAL.md) (internals and data-flow diagram), GitHub epic [#524](https://github.com/hlebtkachenko/monorepo/issues/524) (delivery status), and ADRs 0025–0029.

## Idempotency Contract

> **Status: Partially implemented.** The `tool_call_log` table and its `(organization_id, tool_name, idempotency_key)` dedup (`packages/db/src/audit/write-log.ts`) are landed. The `webhook_inbox` table and the `invokeTool` dispatch wrapper described below are not yet.

Every mutation that crosses a trust boundary (HTTP API edge, AI tool dispatch, scheduled-task trigger, inbound webhook) is idempotent on a server-side composite key.

Enforcement: `(organization_id, tool_name, idempotency_key)` UNIQUE on `tool_call_log` plus `(source, idempotency_key)` UNIQUE on `webhook_inbox`.

Replay window: 24 hours from first successful insert. After expiry, a fresh request with the same key is treated as new.

Key shape rules: use UUIDv4 or typed prefix (`task:<uuid>`, `import:<batch>:<row>`, `webhook:<provider>:<event_id>`). Never derive key from payload hash alone.

Dispatch failure semantics: `invokeTool` opens transaction, inserts into `tool_call_log` first (UNIQUE fires before side effects), then runs tool body. On UNIQUE violation, returns previously stored result. On other failure, rolls back including audit row.

## Background Jobs

pg-boss owns schema `pgboss`. Seven explicit lanes with independent retry, timeout, retention, priority, and batch-size policy.

| Lane          | Use                                   | Priority | Timeout | Retry       |
| ------------- | ------------------------------------- | -------- | ------- | ----------- |
| `ledger`      | ledger side-effects (fx, audit batch) | 10       | 30s     | 3 + backoff |
| `bank-import` | ABO / camt.053 / CSV parse + recon    | 10       | 300s    | 3 + backoff |
| `ai-verify`   | confidence-gated AI writes            | 8        | 60s     | 2 + backoff |
| `email-send`  | invoice emails, OTP, notifications    | 5        | 30s     | 3 + backoff |
| `pdf-gen`     | PDF/A-3 + QR Platba rendering         | 5        | 120s    | 3 + backoff |
| `export`      | org-export, ledger CSV, audit CSV     | 2        | 600s    | 2           |
| `scheduled`   | cron tasks via taskName dispatcher    | 1        | 1800s   | 2           |

### Tx-safe Enqueue

`enqueueInTx(tx, lane, payload, options?)` writes directly into `pgboss.job` using the caller's Drizzle transaction. Domain write and job enqueue commit together or neither does.

### Worker Scaling

One Docker image, N containers. Each container's active lanes controlled by `WORKERS_LANES=lane1,lane2` env. Empty means all lanes (dev default). Same image at all tiers.

### Connection Split

Workers connect on port 5432 directly via `DATABASE_DIRECT_URL`. pgBouncer's transaction pooling discards session state, but pg-boss uses LISTEN/NOTIFY and advisory locks that need session continuity.

## Auth Stack

Better Auth with Drizzle adapter. Plugin set:

- `twoFactor` TOTP + backup codes.
- `email-otp` for MFA recovery.
- `admin` user CRUD, ban, impersonation with audit trail.
- `haveIBeenPwned` HIBP k-anonymity check (prod only).
- Built-in rate limiter + app-level token bucket on auth endpoints.

Role scoping (split):

- `SystemRole = 'user' | 'admin'` on `app_user.role`.
- `WorkspaceRole = 'owner' | 'admin' | 'member' | 'guest'` on `workspace_membership.role`.

Password policy: min 12, at least one digit + one letter, `zxcvbn-ts` score >= 3, HIBP-checked in prod.

## Money and FX

All monetary values use `Money<Currency>` branded wrapper. Amounts stored as `numeric(19, 4)` in Postgres and `bigint` minor units in TypeScript. Never use native `number` for money fields.

Cross-currency conversion uses `FxRate<From, To>`. Call `FxRate.convert(money)` only. Never query rate tables directly; never auto-invert a rate; never substitute a neighbor date.

FX rate lookup precedence: org override (newest range containing date), then global rate at date with source CNB, then error.

Books remain CZK-only in v1. Foreign-currency postings carry both native and CZK amounts.

## Audit and Observability

Three log streams, three retentions:

| Stream               | Source                         | Retention               |
| -------------------- | ------------------------------ | ----------------------- |
| Pino app logs        | Next.js + workers stdout       | 30 days                 |
| `tool_call_log` (DB) | every tool call (human + AI)   | 10 years (CZ statutory) |
| OTel traces          | request timing + spans         | 7 days                  |
| `audit_event` (DB)   | workspace + org dual-dimension | indefinite              |

Redaction baseline: auth tokens, Czech PII (DIC, rodne cislo, IBAN), session IDs in audit only. Organization ID and user ID are never redacted.

## Storage

S3 uses purpose-specific private buckets, not one bucket with one lifecycle:

| Data                       | Storage and lifecycle                                                                                                                                                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application assets         | Per-environment, versioned S3 Standard bucket. Noncurrent versions expire after 30 days.                                                                                                                                                |
| Source documents           | Dedicated per-environment, workspace-scoped working store. Objects under 128 KiB stay in S3 Standard; larger objects use the automatic, instant-access S3 Intelligent-Tiering tiers. Dedicated SSE-KMS key, versioning, no Object Lock. |
| PostgreSQL backups         | Standard -> Standard-IA at 30 days -> Glacier Flexible at 90 days -> Deep Archive at 365 days. Current backups do not auto-expire.                                                                                                      |
| CloudTrail management logs | Account-global S3 Standard bucket with 90-day expiry.                                                                                                                                                                                   |

Document keys are `documents/{workspaceId}/{sha256}.{ext}`. Application roles
cannot delete them. The hourly document reaper is the sole runtime delete principal:
rejected uploads expire after 1 hour, abandoned unconfirmed uploads after 24
hours, and user soft-deletes after 60 days. Confirmed live documents have no
age-based expiry. The bucket is a working store, not the statutory archive of
record; future WORM retention requires a separate decision.

Browser uploads and reads are direct S3 transfers through short-lived presigned
URLs. Afframe computes the browser-side SHA-256, validates S3-authoritative
metadata and a bounded 4 KiB header, and persists only confirmed metadata in
the workspace-scoped `inbox_attachment` table under FORCE RLS. Confirmation is
S3-first then DB; delete is DB-first then S3; restore is S3-first then DB. These
orders prevent the reaper from deleting a document represented as live.

The web session surface supports upload, confirm, preview/download, soft delete,
and restore. The public API, generated SDK, and MCP expose read-only document
list and download-URL operations through user-bound API keys. The real Inbox,
OCR/extraction, batch review, and Brain re-extraction integration remain tracked
by [#518](https://github.com/hlebtkachenko/monorepo/issues/518).

Full bucket mapping, storage-class comparison, Frankfurt pricing snapshot, and
cost guardrails: [ADR-0031](docs/adr/0031-s3-storage-and-document-working-store.md).
Implemented flow, limits, local MinIO, alarms, troubleshooting, and follow-up
ownership: [document-store runbook](docs/runbooks/DOCUMENT-STORE.md).

## Deployment Targets

- **Dev:** macOS local Docker (Postgres 18 + pgBouncer).
- **Staging:** AWS eu-central-1, deployed and live at `app-staging.afframe.com`.
- **Production:** AWS eu-central-1 at `app.afframe.com` — **live** (deployed since v0.2.5, 2026-06). Stack: ECS Fargate web + worker + API, RDS Postgres 18 + RDS Proxy, S3, Cloudflare Tunnel, CloudWatch + OTel Collector sidecar.
- **Status page:** `status.afframe.com` — OpenStatus self-hosted on the OVH VPS (Docker Compose + Cloudflare Tunnel), deliberately **off AWS** so it survives an AWS region outage. Monitors-as-code in `infra/openstatus/`; not deployed by CDK. See [ADR-0019](docs/adr/0019-status-page-and-uptime-monitoring.md).

Full public host + email inventory: [`docs/DOMAINS-AND-EMAIL.md`](docs/DOMAINS-AND-EMAIL.md).

## Cost Protection

Three-layer defense against cost-runaway attacks (see [ADR 0016](docs/adr/0016-cost-runaway-protection.md)):

1. **CloudWatch alarms** cover resource pressure and attack vectors including S3 write rate, bucket size, and log ingestion. They publish to regional SNS topics; only an explicit alarm-name allowlist can trigger the kill-switch.
2. **Lambda kill-switch** in `SecurityStack`. SNS-triggered and idempotent, it stops the environment's ECS service and RDS instance. No IAM-deny is applied to the operator.
3. **AWS Budgets.** Each environment has a $55 total budget wired to the kill-switch and a $10 data-transfer alert budget. Production also has a $55 account-wide total budget wired to the kill-switch. Total-budget 100% notifications publish to the kill-switch SNS topic.

Container hardening: `capDrop ALL` on all 3 containers, `readonlyRootFilesystem` on api + cloudflared, shared ephemeral `/tmp` mount.

CloudTrail multi-region management-events trail (free first management trail) for forensics. RDS auto-restart watcher Lambda re-stops the DB after AWS's 7-day forced restart when tagged `cost-stop-requested=true`.

Incident response: [docs/runbooks/COST-INCIDENT.md](docs/runbooks/COST-INCIDENT.md).

## Stack

- Next.js 16 App Router + React 19 (RSC-first, islands of client)
- NestJS API (separate backend service)
- TypeScript 6.x strict
- PostgreSQL 18 + Drizzle ORM, FORCE RLS everywhere
- Better Auth + Drizzle adapter
- Anthropic TypeScript SDK direct (no Vercel AI SDK, no LangChain)
- pg-boss for background jobs (7 explicit lanes)
- Tailwind v4 + shadcn/ui + Storybook 10
- Vitest 4.x + Playwright + React Testing Library
- pino to OpenTelemetry Collector to Honeycomb
