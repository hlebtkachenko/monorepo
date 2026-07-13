import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { inArray } from "drizzle-orm"
import { auth } from "@workspace/auth/server"
import { withAdminBypass } from "@workspace/db"
import { organization } from "@workspace/db/schema"

import { AppPageHeader } from "@workspace/ui/blocks/app-shell"
import { LegislationBody } from "../../_components/workspace/legislation/legislation-body"
import { LegislationHeader } from "../../_components/workspace/legislation/legislation-header"
import { LegislationProvider } from "../../_components/workspace/legislation/context"
import type {
  ObligationRow,
  ObligationStatus,
} from "../../_components/workspace/legislation/data"
import { loadOrgAssignees } from "../_lib/assign-company"
import { getWorkspaceContext } from "../_lib/workspace-context"
import { computeWorkspaceObligations } from "../_lib/workspace-obligations"

export const metadata = { title: "Legislation" }

/**
 * Legislation — the accountant office's cross-client statutory obligation board
 * for the active workspace. Real rows, flattened one-per-(organization,
 * obligation) from the shared obligation engine (`workspace-obligations.ts`),
 * each org's CURRENT accounting period only. An org with no computable
 * obligations for now simply contributes no rows — an honest empty board, not
 * a fake one, when the workspace has nothing due.
 *
 * Past schedule dates remain visible but are not labelled overdue without a
 * persisted filing record. Conditional candidates carry an explicit
 * applicability decision and missing profile intervals become needs-input
 * rows instead of disappearing.
 */
export default async function LegislationPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/auth/login")

  const ctx = await getWorkspaceContext(session.user.id)
  if (!ctx.activeWorkspaceId) return null

  const obligationsByOrg = await computeWorkspaceObligations(
    ctx.activeWorkspaceId,
  )
  const orgIds = Array.from(obligationsByOrg.keys())

  const rows: ObligationRow[] = await withAdminBypass(async (db) => {
    if (orgIds.length === 0) return []

    const orgs = await db
      .select({ id: organization.id, legalName: organization.legal_name })
      .from(organization)
      .where(inArray(organization.id, orgIds))
    const legalNameByOrg = new Map(orgs.map((o) => [o.id, o.legalName]))

    const assigneeByOrg = await loadOrgAssignees(db, orgIds)

    const flattened: ObligationRow[] = []
    for (const [orgId, result] of obligationsByOrg) {
      const legalName = legalNameByOrg.get(orgId)
      if (!legalName) continue // defensive; the org backing this id must exist
      const assignee = assigneeByOrg.get(orgId)?.name ?? null
      for (const o of result.obligations) {
        const status: ObligationStatus = o.status
        flattened.push({
          id: `${orgId}-${o.kind}-${o.dueDate}`,
          obligation: o.title,
          company: legalName,
          dueDate: o.dueDate,
          status,
          applicability: o.applicability.status,
          note: o.applicability.reason,
          assignee,
        })
      }
      for (const issue of result.issues) {
        flattened.push({
          id: `${orgId}-${issue.code}-${issue.from}`,
          obligation: "Configuration needed",
          company: legalName,
          dueDate: issue.from,
          status: "Needs input",
          applicability: "NEEDS_INPUT",
          note: `${issue.message} ${issue.from} to ${issue.to}.`,
          assignee,
        })
      }
    }
    flattened.sort((a, b) =>
      a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0,
    )
    return flattened
  })

  return (
    <LegislationProvider>
      <AppPageHeader>
        <LegislationHeader />
      </AppPageHeader>
      <LegislationBody rows={rows} />
    </LegislationProvider>
  )
}
