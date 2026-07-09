# 28. Afframe Brain marshrutizátor — admission + per-(org, period) write isolation at the API front door

- Status: Accepted
- Date: 2026-07-01 (Accepted 2026-07-08)
- Deciders: Hleb Tkachenko

> Records a decision from the 2026-07-01 Brain reframe (`.context/afframe-brain/REFRAME-v1.2.md`). Pairs with the
> [ADR-0025 amendment](0025-brain-runtime-placement.md#amendment-2026-07-01--brain-v1-is-an-external-client-not-a-worker-runtime):
> Brain v1 is an unprivileged Claude Code **client** that books via the accounting MCP/HTTP API.

## Context and Problem Statement

Many Brain client sessions run in parallel (Hleb drives several at once during dev; more later). They all book
through the same accounting API against one multi-tenant Postgres. Cross-tenant leakage is already handled
physically by FORCE RLS (ADR-0010). The unhandled threat is **two agents writing the same `(organization, period)`
concurrently**: the v2 domain ships `allocateNumber` / `number-series` (a read-modify-write increment race), and
`closePeriod` is a bare `UPDATE … SET stav='uzavreno'` whose closed-period trigger (R12) is **BEFORE INSERT only**
— it cannot stop a close racing a concurrent post and stranding a half-booked document. RLS does nothing here:
both writers are inside the _same_ org's scope. We need a front door that lets N clients run without corrupting
each other, while reads stay fully parallel.

A further constraint: the app's write path runs through a **transaction-mode connection pooler** (pgbouncer), so
**session-scoped** advisory locks are unsafe (they leak across pooled connections and on a client crash).

## Decision

The **marshrutizátor** lives **at the API front door** (not a worker lane — the Brain is a client), as three
composed layers over existing substrate:

1. **Admission (DDoS / rate).** Reuse `apps/api`'s `ApiKeyThrottlerGuard` (`resolveThrottleKey`) for per-key rate
   limits, plus a **global** and **per-org** concurrent-run cap enforced before a run is admitted.
2. **Serialization — per-(org, period) write-lock.** Inside the write endpoint's transaction, take
   `pg_advisory_xact_lock(hashInt(orgId), hashInt(periodId))` — **transaction-scoped** (auto-released on
   commit/rollback, crash-safe, pooler-safe) and keyed by **two 32-bit ints** (not one hashed 64-bit) to avoid
   false mutual exclusion from hash collision. `closePeriod` / `openNextPeriod` acquire the **same** lock. Locks
   are always taken in a fixed order (org, then period) so there is no lock-ordering deadlock. Reads take no lock.
3. **Isolation floor.** FORCE RLS + `withOrganization` (server-injected org), unchanged.

The pg-boss `policy: 'stately'` + `singletonKey = \`${org}:${period}\`` **whole-run** single-writer serializer
(one active run per (org, period), the rest queue) is recorded as an **optional robustness path** for v2 /
unattended operation; v1 does not require it because Hleb drives concurrency personally.

## Consequences

Positive:

- N clients book concurrently; writes to the same (org, period) serialize, different periods run parallel, reads
  never block. "As many agents as wanted, none breaks another."
- Crash-safe with **no orphan lock**: a transaction-scoped advisory lock dies with the transaction/connection —
  strictly better than a bespoke lock table (which would strand a lock on a dead client).
- Deadlock-free (fixed lock order) and starvation-resistant; the per-org admission cap stops one org monopolizing.

Negative / trade-offs:

- A hot (org, period) serializes writes — acceptable (a single book is not a high-QPS target) and correct.
- Admission caps are new API-side state (concurrent-run counters) the throttler doesn't provide natively.

Follow-up work required:

- WP-EPIC-R — the marshrutizátor: admission caps + the per-(org, period) advisory lock in the write endpoint +
  `closePeriod` under the lock; tested against `bootPostgres18()` (same-key serializes, different-key parallel,
  crash releases). Lands with the accounting write endpoints (GATE-A A0), stub-tested before.

## Alternatives considered

- **Session-scoped advisory locks** — rejected: leak through the transaction-mode pooler and on a client crash
  (the lock outlives the dead run), stranding the (org, period).
- **Row / period `SELECT … FOR UPDATE`** — rejected as the primary: too coarse (blocks readers that shouldn't be
  blocked) and only lives as long as one transaction, not the write critical section.
- **A bespoke `lock` table** — rejected: orphans on crash (the exact failure the advisory lock avoids) and adds
  state to reconcile.
- **A net-new gateway service** — rejected: the throttler + pg-boss + RLS already exist; a separate service is
  scope the problem doesn't need (compose, don't build).

## See also

- [ADR-0025](0025-brain-runtime-placement.md) (runtime, amended), [ADR-0010](0010-multi-tenant-rls.md) (RLS),
  [ADR-0017](0017-workers-pgboss-only.md) (pg-boss)
- `.context/afframe-brain/REFRAME-v1.2.md` (the reframe), `apps/api/src/v1/api-key-throttler.guard.ts` (admission)
- Code anchor: the write endpoint's lock + admission caps land with WP-EPIC-R (accounting API side).
