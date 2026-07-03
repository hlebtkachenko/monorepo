/**
 * withPeriodLock — per-(organization, period) write serialization (ADR-0028).
 *
 * The Afframe Brain is an unprivileged API *client*; many client sessions book
 * concurrently against one multi-tenant Postgres. Cross-tenant leakage is handled
 * by FORCE RLS (ADR-0010). The unhandled threat is two agents writing the SAME
 * `(organization, period)` at once: `allocateNumber` is a read-modify-write
 * increment race, and `closePeriod` is a bare UPDATE whose closed-period trigger
 * is BEFORE INSERT only — it cannot stop a close racing a concurrent post.
 *
 * The fix (ADR-0028 §Decision.2) is a **transaction-scoped** Postgres advisory
 * lock taken INSIDE the write transaction, keyed by (orgId, periodId):
 *
 *   - `pg_advisory_xact_lock` is auto-released on COMMIT or ROLLBACK — including
 *     a client crash (the connection dies, the transaction aborts, the lock
 *     goes with it). No orphan lock, no bespoke lock table to reconcile.
 *   - Transaction-scoped (not session-scoped) locks are the ONLY safe choice
 *     behind the transaction-mode pgbouncer pool: a session lock would leak
 *     across pooled connections. This is why we never use
 *     `pg_advisory_lock` here.
 *   - The **two-int form** `pg_advisory_xact_lock(int4, int4)` keys on two
 *     independent 32-bit ints (hashInt(orgId), hashInt(periodId)) rather than
 *     one hashed 64-bit int, so an org-hash collision cannot falsely serialize
 *     two different orgs (and vice-versa). See ADR-0028 alternatives.
 *   - Locks are always taken in a fixed order (org first, then period is folded
 *     into the same single lock call) so there is no lock-ordering deadlock.
 *
 * Different (org, period) keys hash to different lock coordinates and run fully
 * in parallel. Reads take no lock.
 *
 * Placement: this is DB infrastructure (a raw-SQL transaction primitive), so it
 * lives in `packages/db/src/`. It is built on postgres-js `sql.begin(...)` — the
 * repo's canonical way to run raw SQL in a transaction (see the `sql.begin`
 * usages across `packages/db/tests/` and `packages/auth/scripts/`).
 *
 * NOTE (scope): the REAL wiring — the accounting write endpoint taking this lock
 * around its posting logic, and `closePeriod` / `openNextPeriod` taking the SAME
 * lock — is deferred to the accounting write endpoints (#395). This module is the
 * reusable, tested core only.
 */

import { sql, type SQL } from "drizzle-orm"
import type postgres from "postgres"

/**
 * Deterministic signed 32-bit hash of a string (FNV-1a, 32-bit).
 *
 * Used to fold a UUID (or any string id) into an `int4` lock coordinate for
 * `pg_advisory_xact_lock(int4, int4)`. Deterministic: the SAME string always
 * maps to the SAME int, so the same (org, period) always contends on the same
 * lock across processes and restarts. NEVER random — a random key would defeat
 * serialization entirely.
 *
 * Returns a value in the signed int4 range [-2_147_483_648, 2_147_483_647] via
 * `| 0` (ToInt32), matching Postgres `int4`.
 */
export function hashInt(s: string): number {
  // FNV-1a 32-bit offset basis.
  let hash = 0x811c9dc5
  // Bound the loop by a constant. Keys are UUIDs (<= 36 chars) resolved from the
  // principal / a validated `periodId`, so this never truncates a real id; the
  // cap only stops a maliciously long string from turning the hash into a DoS
  // (CodeQL js/loop-bound-injection). A collision past the cap merely
  // over-serializes an advisory lock — always the safe direction.
  const len = Math.min(s.length, 256)
  for (let i = 0; i < len; i++) {
    hash ^= s.charCodeAt(i)
    // FNV prime 16777619, kept in 32-bit via Math.imul; `| 0` yields the
    // final signed-32-bit (int4) result.
    hash = Math.imul(hash, 0x01000193)
  }
  return hash | 0
}

/**
 * Acquire a transaction-scoped advisory lock keyed by (orgId, periodId) and run
 * `fn` inside that transaction. Writes to the same (org, period) serialize;
 * different keys run in parallel; the lock auto-releases on commit/rollback
 * (including crash).
 *
 * `sql` is a postgres-js client (`sqlClient` from `@workspace/db/client`, or a
 * per-connection client in tests). A fresh transaction is opened via
 * `sql.begin`; the lock is taken as the first statement, then `fn` runs. If `fn`
 * throws, the transaction rolls back and the lock is released, so the next
 * acquirer proceeds.
 *
 * The lock does NOT run `fn`'s writes for you — `fn` is your critical section.
 * If `fn` needs the transaction handle (to run its writes on the same tx that
 * holds the lock), pass a closure that captured it, or compose at the call site.
 * For the accounting endpoint (#395) the endpoint's own tx wiring supplies the
 * writes; here we expose the minimal serialization primitive.
 */
export async function withPeriodLock<T>(
  sql: postgres.Sql,
  orgId: string,
  periodId: string,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  const orgKey = hashInt(orgId)
  const periodKey = hashInt(periodId)
  return (await sql.begin(async (tx) => {
    // Fixed lock order (org, then period) folded into the single two-int call:
    // deadlock-free. Transaction-scoped: released on COMMIT/ROLLBACK/crash.
    await tx`SELECT pg_advisory_xact_lock(${orgKey}::int4, ${periodKey}::int4)`
    return await fn(tx)
  })) as T
}

/** A drizzle raw-SQL executor — any `withOrganization`-bound tx handle satisfies this. */
type SqlExecutor = { execute: (query: SQL) => Promise<unknown> }

/**
 * Take the per-(org, period) advisory lock on an EXISTING transaction, instead
 * of opening a fresh one via {@link withPeriodLock}.
 *
 * The accounting write path already runs inside a `withOrganization` transaction
 * that sets the RLS GUCs (`app.organization_id`, `app.user_id`) on one backend
 * connection. The advisory lock MUST share that connection — a
 * `pg_advisory_xact_lock` taken on a different connection serializes nothing for
 * this write, and (behind the transaction-mode pgbouncer pool) a lock on a
 * second connection would leak across the pool. So the caller passes its bound
 * `tx` and we take the lock as the FIRST statement inside it, before any write
 * to `(org, period)`.
 *
 * Same keying as `withPeriodLock` (two-int `pg_advisory_xact_lock(int4, int4)`
 * on `hashInt(orgId)`, `hashInt(periodId)`), so a direct write, an approve-replay
 * and a future `closePeriod` all contend on the SAME lock. Transaction-scoped:
 * auto-released on COMMIT / ROLLBACK / crash. Reads take no lock.
 */
export async function lockPeriodInTx(
  db: SqlExecutor,
  orgId: string,
  periodId: string,
): Promise<void> {
  await db.execute(
    sql`SELECT pg_advisory_xact_lock(${hashInt(orgId)}::int4, ${hashInt(periodId)}::int4)`,
  )
}
