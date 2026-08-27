import "server-only"

import { and, eq } from "drizzle-orm"

import { betaDb, type BetaExecutor } from "@/db/client"
import { activity_log } from "@/db/schema"

import type { AgentScope, OfficeScope, OwnerScope } from "./scope"

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

export type OfficeActivityEntry = {
  /** `<entity>.<verb>`, matching `activity_log_action_shape`. */
  readonly action: string
  readonly entityKind: string
  /** The one row the act touched, when there was exactly one. */
  readonly entityId?: string | null
  readonly summary: ActivitySummary
}

/**
 * Record an act the OFFICE performed by hand.
 *
 * WHY THIS EXISTS AT ALL, given most office writes are not logged. The agent
 * ingestion path logs every write it makes; a fact that can enter the book
 * through BOTH doors and is only logged through one has an audit trail that
 * silently depends on which door was used. That is tolerable for a partner's
 * address; it is not tolerable for obrat, which is the figure the portal tells a
 * client whether they have a DPH registration duty against. So the Ukazatele
 * writes log too, and the two rows differ only in `actor_kind`.
 *
 * `agent_key_id` is deliberately absent, not merely unset:
 * `activity_log_actor_coherence` refuses a `user` row that names a key, so "an
 * agent write logged as if a human had performed it" is not a representable
 * state — which is the one lie this table exists to make impossible.
 *
 * NO `request_id`. Idempotency is the agent API's problem: a Server Action is
 * driven by a person clicking a button, and there is no key to spend a request
 * id against (the unique index is on the key).
 *
 * Takes an executor for the same reason `recordAgentActivity` does — a log row
 * on its own connection would survive a rolled-back write and claim something
 * happened that did not.
 */
export async function recordOfficeActivity(
  executor: BetaExecutor,
  owner: OwnerScope,
  entry: OfficeActivityEntry,
): Promise<void> {
  await executor.insert(activity_log).values({
    organization_id: owner.organizationId,
    actor_kind: "user",
    actor_user_id: owner.userId,
    agent_key_id: null,
    action: entry.action,
    entity_kind: entry.entityKind,
    entity_id: entry.entityId ?? null,
    request_id: null,
    summary: entry.summary,
  })
}

/**
 * Record an act performed by office staff from /admin, in every book it touches.
 *
 * THE SIBLING OF `recordOfficeActivity`, AND THE DIFFERENCE IS THE DOOR. That
 * one takes an `OwnerScope` — an accountant acting INSIDE one book, which is
 * where almost every logged write happens. This one takes an `OfficeScope`, the
 * /admin door, which is above organizations: the act is not performed in a book
 * at all, it merely lands in several. Same row shape, two authorities, so they
 * stay two functions rather than one with a union parameter that would have to
 * re-derive which authority it was handed.
 *
 * `actor_kind: "user"` with no `agent_key_id`, exactly as its sibling writes.
 * `actor_user_id` is the OFFICE USER WHO ACTED, never the subject of the act —
 * "who is answerable for this row" has exactly one meaning in this table and an
 * /admin act does not get to redefine it.
 *
 * ONE ROW PER BOOK, WHICH IS WHY THIS TAKES A LIST. `organization_id` is NOT
 * NULL: this log is a BOOK'S history, not a global feed, and there is no
 * org-less row to write. An /admin act that reaches into three books therefore
 * leaves a row in each of the three, so an accountant reading one book's history
 * sees everything that happened to it without having to know that /admin exists.
 *
 * AN ACT THAT TOUCHES NO BOOK LEAVES NO ROW, and the caller is told so by the
 * returned count rather than by silence. That is a real gap and it is stated
 * here rather than hidden: an account that never held a membership anywhere has
 * no book whose history it belongs in, and inventing one — a sentinel
 * organization, a nullable column — would put rows nobody reads in a table
 * everything else trusts.
 */
export async function recordAdminActivity(
  executor: BetaExecutor,
  office: OfficeScope,
  organizationIds: readonly string[],
  entry: OfficeActivityEntry,
): Promise<number> {
  // De-duplicated: a caller collecting book ids from a join can hand over the
  // same one twice, and two identical rows would read as two acts.
  const books = [...new Set(organizationIds)]
  if (books.length === 0) return 0

  await executor.insert(activity_log).values(
    books.map((organizationId) => ({
      organization_id: organizationId,
      actor_kind: "user" as const,
      actor_user_id: office.userId,
      agent_key_id: null,
      action: entry.action,
      entity_kind: entry.entityKind,
      entity_id: entry.entityId ?? null,
      request_id: null,
      summary: entry.summary,
    })),
  )

  return books.length
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
