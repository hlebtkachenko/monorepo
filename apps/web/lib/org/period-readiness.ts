import "server-only"

import { withOrganization } from "@workspace/db"
import { assessPeriodCloseReadiness } from "@workspace/accounting"
import type { OrgCtx, PeriodCloseReadiness } from "@workspace/accounting"

import { resolveMembership } from "./resolve"
import { getRequestSession } from "./session"

/**
 * Close-readiness read for the org tree's Close-period wizard.
 *
 * The wizard's server page assesses whether an účetní období is ready to close
 * (the BLOCKER / WARNING checklist the domain computes) and whether the caller
 * may run the seal. Tenancy is resolved server-side exactly like `listPeriods`:
 * `userId` from the session, `organizationId` + `workspaceId` from
 * `resolveMembership({ slug, userId })` (only an org the caller belongs to
 * resolves). Runs under `withOrganization` (the org-bound executor
 * `assessPeriodCloseReadiness` requires) — the `accounting_period` FORCE-RLS
 * policy is the tenant boundary; the assessment is all SELECTs, matching the
 * shipped `loadPeriodCloseReadiness`. `slug` is a routing key, never a tenant id.
 */

/** A uuid shape guard so a non-uuid path segment never reaches the assessment. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface PeriodCloseReadinessState {
  readiness: PeriodCloseReadiness
  /** Whether the signed-in caller may run the close (owner/admin). */
  canManage: boolean
}

/**
 * Assess close readiness for one period, or `null` when there is no session,
 * membership, or the id is not a uuid (the layout already guards membership —
 * this is defense-in-depth so the page can `notFound()` rather than throw).
 */
export async function getPeriodCloseReadiness(input: {
  slug: string
  periodId: string
}): Promise<PeriodCloseReadinessState | null> {
  if (!UUID_RE.test(input.periodId)) return null

  const session = await getRequestSession()
  const userId = session?.user?.id
  if (!userId) return null

  const membership = await resolveMembership({ slug: input.slug, userId })
  if (!membership) return null
  const { organizationId, workspaceId, role } = membership

  const readiness = await withOrganization(organizationId, userId, (db) => {
    const ctx: OrgCtx = { organizationId, workspaceId }
    return assessPeriodCloseReadiness(db, ctx, input.periodId)
  })

  return {
    readiness,
    canManage: role === "owner" || role === "admin",
  }
}
