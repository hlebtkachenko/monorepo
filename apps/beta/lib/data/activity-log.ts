import "server-only"

import { and, eq } from "drizzle-orm"

import { betaDb, type BetaExecutor } from "@/db/client"
import { activity_log } from "@/db/schema"

import type { AgentScope, OwnerScope } from "./scope"

/**
 * activity_log writes (spec §4).
 *
 * ONE ROW PER ACT, WRITTEN IN THE ACT'S OWN TRANSACTION. That is the entire
 * contract, and it is why `recordAgentActivity` takes an executor rather than
 * reaching for `betaDb()`: a log row on its own connection would survive a
 * rolled-back write and claim something happened that did not, which is worse
 * than no log at all. The converse holds too — a committed write cannot lose its
 * row, because losing it would roll the write back.
 *
 * THE SUMMARY IS BUILT BY THE CALLER, BY EXPLICIT PICK. Nothing here spreads a
 * request body into jsonb: the summary carries counts, external refs and ids,
 * never the accounting payload (it is already in its own table) and never a
 * credential.
 *
 * The table is append-only at the database (trigger
 * `activity_log_is_append_only`), so there is deliberately no update function
 * here and no way to write one.
 */

export type ActivitySummary = Record<string, unknown>

export type AgentActivityEntry = {
  /** `<entity>.<verb>`, matching `activity_log_action_shape`. */
  readonly action: string
  readonly entityKind: string
  /** The one row the act touched, when there was exactly one. */
  readonly entityId?: string | null
  /** The caller's `Idempotency-Key`. See `agentActivityByRequestId`. */
  readonly requestId?: string | null
  readonly summary: ActivitySummary
}

/**
 * Record an agent act.
 *
 * `actor_user_id` is the KEY'S acting accountant, not a fiction: an agent key is
 * that person's automation (migration 0011), so the row answers both "which
 * credential did this" and "who is answerable for it". `activity_log_actor_
 * coherence` is the floor under the pairing.
 *
 * When `requestId` is set this INSERT is also the idempotency gate: a retry of
 * the same call raises 23505 on `activity_log_agent_request_idx`, which rolls
 * back the enclosing transaction whole. `lib/data/agent-ingest.ts` catches that
 * and replays the first call's summary.
 */
export async function recordAgentActivity(
  executor: BetaExecutor,
  owner: OwnerScope,
  agent: AgentScope,
  entry: AgentActivityEntry,
): Promise<void> {
  await executor.insert(activity_log).values({
    organization_id: owner.organizationId,
    actor_kind: "agent",
    actor_user_id: agent.actingUserId,
    agent_key_id: agent.keyId,
    action: entry.action,
    entity_kind: entry.entityKind,
    entity_id: entry.entityId ?? null,
    request_id: entry.requestId ?? null,
    summary: entry.summary,
  })
}

/**
 * The act this key already performed under `requestId`, if any.
 *
 * Read on the OUTSIDE of a rolled-back transaction — by the time it is called
 * the retry's own write is gone, and this is the surviving record of what the
 * first call did. Keyed on (key, request id), the same pair the unique index is
 * on, so it can only ever return this key's own act.
 *
 * IT RETURNS THE ACT'S IDENTITY, NOT JUST ITS RESULT, and that is the whole
 * point of the two extra columns. The unique index spans the KEY, so one request
 * id is spent across every endpoint and every book — an agent that generates one
 * id per RUN (the natural shape for a month-end script) would send `run-42` to
 * `filings` and then to `assets`, and a replay that only looked up the summary
 * would answer the second call with the first one's result: a 200, a plausible
 * body, and a write that silently never happened. So the caller compares
 * `action` and `organizationId` before it is allowed to call anything a replay.
 */
export async function agentActivityByRequestId(
  agent: AgentScope,
  requestId: string,
): Promise<{
  summary: ActivitySummary
  entityId: string | null
  action: string
  organizationId: string
} | null> {
  const [row] = await betaDb()
    .select({
      summary: activity_log.summary,
      entityId: activity_log.entity_id,
      action: activity_log.action,
      organizationId: activity_log.organization_id,
    })
    .from(activity_log)
    .where(
      and(
        eq(activity_log.agent_key_id, agent.keyId),
        eq(activity_log.request_id, requestId),
      ),
    )
    .limit(1)

  if (!row) return null
  return {
    summary: asSummary(row.summary),
    entityId: row.entityId,
    action: row.action,
    organizationId: row.organizationId,
  }
}

/**
 * A jsonb column reads back as `unknown`. Rebuilt entry by entry rather than
 * asserted: the DB CHECK `activity_log_summary_is_object` makes anything else
 * unreachable, and a cast here would be the one place that stops being true if
 * the CHECK is ever relaxed.
 */
function asSummary(value: unknown): ActivitySummary {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return Object.fromEntries(Object.entries(value))
}
