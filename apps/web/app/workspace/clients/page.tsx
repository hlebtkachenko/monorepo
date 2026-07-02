import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { auth } from "@workspace/auth/server"
import { withAdminBypass } from "@workspace/db"
import { organization } from "@workspace/db/schema"

import { AppPageHeader } from "../../_components/app-page-header"
import { ClientsBody } from "../../_components/workspace/clients/clients-body"
import { ClientsHeader } from "../../_components/workspace/clients/clients-header"
import { ClientsProvider } from "../../_components/workspace/clients/context"
import {
  enrichClientMock,
  fiscalYearLabel,
  type ClientRow,
} from "../../_components/workspace/clients/data"
import { getWorkspaceContext } from "../_lib/workspace-context"

export const metadata = { title: "Clients" }

/**
 * Clients — the client-book (organization) list for the active workspace. The
 * Table archetype: identity columns are real (resolved here from `organization`
 * scoped to the active workspace), operational columns are deterministic mock
 * enrichment (see `enrichClientMock`). Reads use `withAdminBypass` + an explicit
 * `workspace_id` predicate — `organization` RLS is keyed on `app.organization_id`
 * (no workspace-scoped read policy), so a `withWorkspace` frame would return zero
 * rows.
 */
export default async function ClientsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/auth/login")

  const ctx = await getWorkspaceContext(session.user.id)
  // The layout renders the no-workspace empty state before reaching here; this
  // guard only satisfies the type + covers a race where the context is empty.
  if (!ctx.activeWorkspaceId) redirect("/workspace")

  const activeWorkspaceId = ctx.activeWorkspaceId
  const orgs = await withAdminBypass(async (db) =>
    db
      .select({
        id: organization.id,
        slug: organization.slug,
        legalName: organization.legal_name,
        personKind: organization.person_kind,
        legalSubjectKind: organization.legal_subject_kind,
        fiscalYearStartMonth: organization.fiscal_year_start_month,
      })
      .from(organization)
      .where(eq(organization.workspace_id, activeWorkspaceId))
      .orderBy(organization.legal_name),
  )

  const clients: ClientRow[] = orgs.map((o) => ({
    id: o.id,
    slug: o.slug,
    legalName: o.legalName,
    typeLabel: o.legalSubjectKind || o.personKind,
    fiscalYear: fiscalYearLabel(o.fiscalYearStartMonth),
    ...enrichClientMock(o.id),
  }))

  return (
    <ClientsProvider>
      <AppPageHeader>
        <ClientsHeader />
      </AppPageHeader>
      <ClientsBody clients={clients} />
    </ClientsProvider>
  )
}
