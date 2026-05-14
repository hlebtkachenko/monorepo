# 17. Workers backed by pg-boss only (drop BullMQ + ioredis)

- Status: Accepted
- Date: 2026-05-14
- Deciders: Hleb Tkachenko

## Context and Problem Statement

`packages/workers` currently re-exports BullMQ types from `bullmq` plus a transitive
`ioredis` dependency. Nothing in `apps/` or `packages/` imports the workers package yet,
so the BullMQ wiring is unused stub code. Two queue systems are present simultaneously:
BullMQ (needs Redis) sits as a dead dependency, while migration `0007_pgboss.sql` has
already bootstrapped the full pg-boss schema (`pgboss.queue`, `pgboss.job`, `pgboss.archive`)
with grants for `app_user` and `app_admin`. ADR-0007 (CDK-only, single-account) and ADR-0008
(Cloudflare Tunnel, no ALB or NAT) push the architecture toward fewer moving parts. Adding
Redis (Upstash, ElastiCache, or self-hosted) for BullMQ would be a separate service to
provision, secure, monitor, back up, and pay for. The ADR-0007 deploy runbook explicitly
defers "Workers / Upstash Redis" — that deferral is now permanent.

## Decision

`packages/workers` is migrated to pg-boss as the only job queue implementation. `bullmq` and
`ioredis` are removed from dependencies. The package exposes thin wrappers
(`createQueue`, `createWorker`, `boot`, lane registry) over the pg-boss API. The first lane
on the registry is `permissions-drain` (consumer of `permissions_outbox`, ADR-0018).
pg-boss connects via `DATABASE_DIRECT_URL` (Postgres :5432) — pg-boss requires an
unpooled connection because it uses advisory locks and `LISTEN/NOTIFY` semantics that
pgBouncer transaction mode does not preserve.

## Consequences

Positive:

- Zero extra services in prod. No Redis to provision, monitor, back up, or rotate.
- pg-boss DDL is already applied (migration 0007); zero schema work needed for activation.
- Job state lives in the same Postgres backup taken by the nightly dump — disaster recovery
  is the same procedure for app data and job state.
- Matches the "single tenant store + sidecars only" thrust of ADR-0007 + ADR-0008.
- Removes ~600 KB of dead `bullmq` + `ioredis` from the deploy bundle.

Negative / trade-offs:

- pg-boss enqueue/dequeue latency is higher than BullMQ at high job rates (advisory locks
  + `SELECT … FOR UPDATE SKIP LOCKED` vs. Redis pop). Acceptable until sustained job rate
  exceeds ~1000/s, far above MVP scale.
- pg-boss runs background polling on Postgres, adding minor connection pressure. Mitigated
  by keeping pg-boss on its own dedicated connection rather than sharing the application
  pgBouncer pool (pgBouncer transaction mode would break pg-boss `LISTEN/NOTIFY`).

Follow-up work required:

- `packages/workers/src/__tests__/workers.test.ts` — unit tests for queue + worker
  wrappers using a `FakeBoss` interface.
- `packages/workers/src/lanes/permissions-drain.ts` — drain lane implementation lands in
  ADR-0018 (Commit 9 of the infra rebuild plan).
- Reconsider when sustained job rate >1000/s or queue depth contention shows in RDS WAL
  growth.

## Alternatives considered

- **BullMQ + Redis** — rejected. Requires a Redis service (Upstash $25/mo minimum, or
  ElastiCache from $13/mo, or a sidecar Redis container that fights for Fargate task RAM).
  Adds an authentication + TLS configuration surface, a separate backup story, and a second
  failure mode that the operator must understand. None of this is justified at MVP scale.
- **In-process workers (no durability)** — rejected. Anything that crosses a process
  restart needs durability. Email send, OpenFGA tuple sync, AI cost accounting all
  cannot lose state on Fargate task replacement.
- **AWS SQS** — rejected. AWS lock-in for a piece of infrastructure that pg-boss does
  equally well. Also adds Lambda or polling-consumer complexity. Not aligned with the
  "Postgres is the only durable store" simplification.

## See also

- ADR-0007 — MVP single-account CDK-only deploy
- ADR-0008 — Cloudflare Tunnel and email split
- ADR-0010 — Multi-tenant RLS (workspace + organization tiers)
- ADR-0012 — Local Postgres development infrastructure
- ADR-0018 — Three-layer authz (drain lane consumer)
- `packages/db/migrations/0007_pgboss.sql` — pg-boss DDL
- `packages/workers/src/index.ts` — new pg-boss wrapper entrypoint
