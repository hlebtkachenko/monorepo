# Architecture

System-wide architecture reference. Concise overview only; deep design documents live under `docs/adr/` and `docs/specs/`.

## Product Shape

AI-native Czech accounting platform. A single accountant runs many client organizations; every operation is both human-usable (UI) and machine-operable (AI agent calling the same tool registry). Multi-tenant isolation is load-bearing: CZ 10-year retention liability makes tenant-leak cost high.

## Monorepo Layout

pnpm workspaces + Turborepo.

```
apps/
  web/                             Next.js 16 App Router, React 19
  api/                             NestJS backend API
packages/
  ui/                              shadcn/ui component library (55 components, Storybook, Vitest)
  db/                              Drizzle schema + RLS + migrations
  auth/                            Better Auth + session binding + RLS GUC
  shared/                          Shared utilities, i18n, Zod schemas
  workers/                         pg-boss background job handlers
  observability/                   pino + OpenTelemetry helpers
  email/                           React Email templates + transport
  pdf/                             PDF/A-3 generation + QR Platba
  eslint-config/                   Shared ESLint flat configs
  typescript-config/               Shared TypeScript presets
infra/
  tofu/                            OpenTofu platform layer (Org, OUs, SCPs, network)
  cdk/                             AWS CDK v2 app stacks (network, data, app, observability)
  compose/                         Local Docker Compose (Postgres 18 + pgBouncer)
docs/
  adr/                             Architecture Decision Records
  runbooks/                        Operational runbooks
  specs/                           Design specifications
  conventions/                     Commit + CI conventions
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

The helpers are not nestable. Each opens its own top-level transaction; `set_config(..., true)` is transaction-scoped and not visible across the boundary under pgBouncer transaction pooling.

## Request Flow

1. Client hits `/workspace/*` or `/<org-slug>/*`.
2. Middleware verifies session, resolves workspace and organization from cookie + URL, enforces reserved-slug list, checks MFA gate.
3. Route handler or Server Action calls a domain tool handler.
4. Domain handler writes through the right tier-bound DB (RLS enforced by Postgres).
5. `audit_event` row is written in the same transaction.

AI requests flow through SSE endpoint, the agent loop, and dispatch to the same domain tool handlers.

## AI Safety Layer

Five primitives:

1. **Executor + advisor model split.** Two Claude models, one role each. Executor (Sonnet) runs the tool-use loop and streams tokens. Advisor (Opus) runs a single non-streaming call per tool dispatch to score correctness.

2. **Advisor verdict loop.** Every `approval: required` and `approval: confidence` dispatch passes through the advisor. Returns a 0..100 score plus explicit verdict (`approve` | `reject` | `escalate_to_human`). Approve auto-commits; reject hard-stops; escalate queues a `user_task` row.

3. **AI-deny overlay.** Subtractive, global. Hard-blocks destructive tools from AI dispatch path even when the permission chain would authorize them.

4. **Per-org budget + cooldown.** Daily/monthly CZK ceilings. On breach, writes cooldown row. Chat route short-circuits with 429 when window is active.

5. **Confidence gate on mutations.** Executor self-reports confidence score per tool_use; agent loop escalates to `user_task` when score < 95 on `approval: confidence` tools. Organization id is never carried in tool input.

## Idempotency Contract

Every mutation that crosses a trust boundary (HTTP API edge, AI tool dispatch, scheduled-task trigger, inbound webhook) is idempotent on a server-side composite key.

Enforcement: `(organization_id, tool_name, idempotency_key)` UNIQUE on `tool_call_log` plus `(source, idempotency_key)` UNIQUE on `webhook_inbox`.

Replay window: 24 hours from first successful insert. After expiry, a fresh request with the same key is treated as new.

Key shape rules: use UUIDv4 or typed prefix (`task:<uuid>`, `import:<batch>:<row>`, `webhook:<provider>:<event_id>`). Never derive key from payload hash alone.

Dispatch failure semantics: `invokeTool` opens transaction, inserts into `tool_call_log` first (UNIQUE fires before side effects), then runs tool body. On UNIQUE violation, returns previously stored result. On other failure, rolls back including audit row.

## Background Jobs

pg-boss owns schema `pgboss`. Seven explicit lanes with independent retry, timeout, retention, priority, and batch-size policy.

| Lane | Use | Priority | Timeout | Retry |
|---|---|---|---|---|
| `ledger` | ledger side-effects (fx, audit batch) | 10 | 30s | 3 + backoff |
| `bank-import` | ABO / camt.053 / CSV parse + recon | 10 | 300s | 3 + backoff |
| `ai-verify` | confidence-gated AI writes | 8 | 60s | 2 + backoff |
| `email-send` | invoice emails, OTP, notifications | 5 | 30s | 3 + backoff |
| `pdf-gen` | PDF/A-3 + QR Platba rendering | 5 | 120s | 3 + backoff |
| `export` | org-export, ledger CSV, audit CSV | 2 | 600s | 2 |
| `scheduled` | cron tasks via taskName dispatcher | 1 | 1800s | 2 |

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

| Stream | Source | Retention |
|---|---|---|
| Pino app logs | Next.js + workers stdout | 30 days |
| `tool_call_log` (DB) | every tool call (human + AI) | 10 years (CZ statutory) |
| OTel traces | request timing + spans | 7 days |
| `audit_event` (DB) | workspace + org dual-dimension | indefinite |

Redaction baseline: auth tokens, Czech PII (DIC, rodne cislo, IBAN), session IDs in audit only. Organization ID and user ID are never redacted.

## Storage

Single bucket with per-org prefixes. Tenant isolation enforced three times: (a) `OrganizationScopedStorage` injects org prefix server-side, (b) IAM condition on prefix, (c) dispatch under `withOrganization` so audit is RLS-bound.

Sensitive document classes get client-side age encryption layer on top of SSE-KMS.

Lifecycle: S3 Standard (0d) -> Standard-IA (30d) -> Glacier Flexible (90d) -> Deep Archive (365d) -> manual purge (3650d).

## Deployment Targets

- **Dev:** macOS local Docker (Postgres 18 + pgBouncer).
- **Prod:** AWS eu-central-1 (ECS Fargate web + worker + API, RDS Postgres 18 + RDS Proxy, S3, ALB + ACM, CloudWatch + OTel Collector sidecar).

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
- pino to OpenTelemetry Collector to Grafana Cloud
