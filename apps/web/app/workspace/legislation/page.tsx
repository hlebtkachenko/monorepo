import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { inArray } from "drizzle-orm"
import { auth } from "@workspace/auth/server"
import { withAdminBypass } from "@workspace/db"
import { organization } from "@workspace/db/schema"

import { AppPageHeader } from "../../_components/app-page-header"
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
 * Forward-looking + conditional-marked, mirroring the org Closing surface:
 * there is no persisted filing state yet, so a past obligation can't be
 * truthfully labelled "overdue" or "filed" — only rows with `dueDate >=
 * today` are shown, and conditional obligations (SH, identified-person VAT
 * return) carry `conditional`/`note` instead of being asserted as hard.
 */
export default async function LegislationPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/auth/login")

  const ctx = await getWorkspaceContext(session.user.id)
  if (!ctx.activeWorkspaceId) return null

  const today = new Date().toISOString().slice(0, 10)
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
    for (const [orgId, obligations] of obligationsByOrg) {
      const legalName = legalNameByOrg.get(orgId)
      if (!legalName) continue // defensive; the org backing this id must exist
      const assignee = assigneeByOrg.get(orgId)?.name ?? null
      for (const o of obligations) {
        if (o.dueDate < today) continue // no filing state -> can't truthfully call a past obligation overdue/filed
        if (o.status === "Overdue") continue // defensive; dueDate >= today should never derive Overdue
        const status: ObligationStatus = o.status
        flattened.push({
          id: `${orgId}-${o.kind}-${o.dueDate}`,
          obligation: o.title,
          company: legalName,
          dueDate: o.dueDate,
          status,
          conditional: o.conditional,
          note: o.note,
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
