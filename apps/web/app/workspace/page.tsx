import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { and, eq, inArray, isNull, isNotNull } from "drizzle-orm"
import { auth } from "@workspace/auth/server"
import { withAdminBypass } from "@workspace/db"
import {
  app_user,
  organization,
  organization_membership,
} from "@workspace/db/schema"

import { CompaniesView } from "../_components/workspace/companies/companies-view"
import { CompaniesProvider } from "../_components/workspace/companies/context"
import {
  enrichCompanyMock,
  fiscalYearLabel,
  type CompanyMember,
  type CompanyRow,
} from "../_components/workspace/companies/data"
import { getWorkspaceContext } from "./_lib/workspace-context"

export const metadata = { title: "Companies" }

// `?error=` values the org layout redirects here on a failed book entry
// (`[orgSlug]/layout.tsx`). Surfaced as a toast on load — Companies is the
// workspace index + post-login landing, so the signal isn't lost.
const ERROR_MESSAGES: Record<string, string> = {
  "invalid-slug": "That company address isn't valid.",
  "no-access": "You don't have access to that company.",
  internal: "Something went wrong. Please try again.",
}

/**
 * Companies — the accountant-office hub + workspace index (post-login landing).
 * Lists the company books (organizations) of the active workspace as big cards
 * or a table. Identity fields + the member stack are real; operational columns
 * are mock (see `data.ts`). Reads use `withAdminBypass` + an explicit
 * `workspace_id` predicate — `organization` RLS is keyed on `app.organization_id`
 * (no workspace-scoped read policy), so `withWorkspace` would return zero rows.
 */
export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; archived?: string }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/auth/login")

  const ctx = await getWorkspaceContext(session.user.id)
  if (!ctx.activeWorkspaceId) return null

  const { error, archived } = await searchParams
  // The list defaults to active books (`archived_at IS NULL`); `?archived=1`
  // shows the archived ones. This is REAL isolation on `organization.archived_at`
  // and is orthogonal to the mock status tabs (which filter `enrichCompanyMock`).
  const showArchived = archived === "1"

  const activeWorkspaceId = ctx.activeWorkspaceId
  const companies = await withAdminBypass(async (db) => {
    const orgs = await db
      .select({
        id: organization.id,
        slug: organization.slug,
        legalName: organization.legal_name,
        personKind: organization.person_kind,
        legalSubjectKind: organization.legal_subject_kind,
        fiscalYearStartMonth: organization.fiscal_year_start_month,
      })
      .from(organization)
      .where(
        and(
          eq(organization.workspace_id, activeWorkspaceId),
          showArchived
            ? isNotNull(organization.archived_at)
            : isNull(organization.archived_at),
        ),
      )
      .orderBy(organization.legal_name)

    if (orgs.length === 0) return []

    // Active members of every company in one round-trip, grouped by company.
    const memberRows = await db
      .select({
        organizationId: organization_membership.organization_id,
        userId: app_user.id,
        name: app_user.name,
        displayName: app_user.display_name,
        image: app_user.image,
      })
      .from(organization_membership)
      .innerJoin(app_user, eq(app_user.id, organization_membership.user_id))
      .where(
        and(
          inArray(
            organization_membership.organization_id,
            orgs.map((o) => o.id),
          ),
          eq(organization_membership.active, true),
        ),
      )

    const membersByCompany = new Map<string, CompanyMember[]>()
    for (const m of memberRows) {
      const list = membersByCompany.get(m.organizationId) ?? []
      list.push({
        userId: m.userId,
        name: m.displayName || m.name || "Member",
        image: m.image ?? undefined,
      })
      membersByCompany.set(m.organizationId, list)
    }

    return orgs.map<CompanyRow>((o) => ({
      id: o.id,
      slug: o.slug,
      legalName: o.legalName,
      typeLabel: o.legalSubjectKind || o.personKind,
      fiscalYear: fiscalYearLabel(o.fiscalYearStartMonth),
      members: membersByCompany.get(o.id) ?? [],
      archived: showArchived,
      ...enrichCompanyMock(o.id),
    }))
  })

  const errorMessage = error ? ERROR_MESSAGES[error] : undefined

  return (
    <CompaniesProvider>
      <CompaniesView
        companies={companies}
        errorMessage={errorMessage}
        showArchived={showArchived}
      />
    </CompaniesProvider>
  )
}
