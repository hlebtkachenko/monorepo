/**
 * Cross-organization held-write queue stats (M0.8 / 11.11 stale-queue alert).
 *
 * A held write is a `tool_call_log` row the gate did NOT auto-apply:
 * `auto_applied = false` and `approved_by_user_id IS NULL` (mirrors the
 * predicate `held-writes.controller.ts` uses for its per-organization review
 * list). Staleness is an OPERATOR-wide signal, not a tenant one — an
 * unreviewed write in any organization ages the same way — so this reads
 * ACROSS all organizations via `withAdminBypass`, unlike the org-scoped
 * `listAuditTimeline` / `listHeldWrites`.
 *
 * Read-only. Never touches the gate/veto/score decision.
 */
import { and, count, eq, isNull, lt, min } from "drizzle-orm"
import type { AdminBypassDb } from "../tenancy"
import { tool_call_log } from "../schema/tool_call_log"

export interface StaleHeldWriteQueueStats {
  /** Held writes older than the caller-supplied cutoff. */
  staleCount: number
  /** `created_at` of the oldest row in the ENTIRE held queue (any age), or null when empty. */
  oldestCreatedAt: Date | null
}

/**
 * `cutoff` is the caller-computed `now - thresholdHours`. Two aggregate
 * queries (count of stale rows + min created_at over the whole queue) rather
 * than one FILTER clause, matching the two-query style already used by
 * `listAuditTimeline`. When `staleCount > 0` the returned `oldestCreatedAt`
 * IS the oldest stale row: the queue-wide minimum can never be younger than a
 * row already known to be older than `cutoff`.
 */
export async function getStaleHeldWriteQueueStats(
  db: AdminBypassDb,
  cutoff: Date,
): Promise<StaleHeldWriteQueueStats> {
  const heldWhere = and(
    eq(tool_call_log.auto_applied, false),
    isNull(tool_call_log.approved_by_user_id),
  )

  const [staleRow] = await db
    .select({ staleCount: count() })
    .from(tool_call_log)
    .where(and(heldWhere, lt(tool_call_log.created_at, cutoff)))

  const [oldestRow] = await db
    .select({ oldestCreatedAt: min(tool_call_log.created_at) })
    .from(tool_call_log)
    .where(heldWhere)

  return {
    staleCount: Number(staleRow?.staleCount ?? 0),
    oldestCreatedAt: oldestRow?.oldestCreatedAt ?? null,
  }
}
