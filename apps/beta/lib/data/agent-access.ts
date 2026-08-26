import "server-only"

import { and, asc, eq, isNull, lt, or, sql } from "drizzle-orm"

import { betaDb } from "@/db/client"
import {
  agent_key,
  app_user,
  organization,
  organization_membership,
} from "@/db/schema"
import { BETA_AGENT_LAST_USED_INTERVAL_MS } from "@/lib/auth/policy"

import type { AgentScope } from "./scope"

/**
 * What a resolved agent key may SEE, as opposed to what it may write.
 *
 * The write path is `lib/data/agent-ingest.ts`; this module answers the one
 * question the office agent has to ask before it writes anything — "which books
 * does this key reach?" — and keeps `agent_key.last_used_at` roughly current for
 * the /admin registry.
 *
 * It takes an `AgentScope`, which only `resolveAgentScope` can mint, so neither
 * function is reachable without a live key.
 */

/**
 * Every organization this key may publish into, in listing order.
 *
 * IT IS DERIVED, NOT STORED. The answer is the acting accountant's own active
 * `owner` memberships, narrowed by the key's `organization_id` when it has one —
 * the same join `resolveAgentOwnerScope` runs per request, asked for all rows
 * instead of one. So the discovery endpoint and the write path can never
 * disagree about reach: they are one query in two shapes.
 */
export async function agentOrganizations(
  agent: AgentScope,
): Promise<{ slug: string; legalName: string }[]> {
  const rows = await betaDb()
    .select({ slug: organization.slug, legalName: organization.legal_name })
    .from(organization_membership)
    .innerJoin(
      organization,
      eq(organization.id, organization_membership.organization_id),
    )
    .innerJoin(app_user, eq(app_user.id, organization_membership.user_id))
    .where(
      and(
        eq(organization_membership.user_id, agent.actingUserId),
        eq(organization_membership.role, "owner"),
        eq(organization_membership.active, true),
        isNull(organization.archived_at),
        isNull(app_user.disabled_at),
        agent.organizationId === null
          ? undefined
          : eq(organization.id, agent.organizationId),
      ),
    )
    .orderBy(asc(organization.slug))

  return rows
}

/**
 * Stamp `last_used_at`, at most once per {@link BETA_AGENT_LAST_USED_INTERVAL_MS}.
 *
 * THE THROTTLE IS IN THE WHERE CLAUSE, not in a process-local cache: the
 * comparison is against the row's own value, so two tasks (or a task that just
 * restarted) cannot both decide it is their turn. The UPDATE simply matches zero
 * rows when the stamp is fresh, which costs one indexed statement and no
 * coordination.
 *
 * It is a liveness signal for the office — "this key was used today" — and
 * explicitly NOT an access log. The access log is `activity_log`, which is
 * written per act, inside the act's transaction.
 */
export async function touchAgentKeyUsed(agent: AgentScope): Promise<void> {
  const threshold = new Date(Date.now() - BETA_AGENT_LAST_USED_INTERVAL_MS)

  await betaDb()
    .update(agent_key)
    .set({ last_used_at: sql`now()` })
    .where(
      and(
        eq(agent_key.id, agent.keyId),
        or(
          isNull(agent_key.last_used_at),
          lt(agent_key.last_used_at, threshold),
        ),
      ),
    )
}
