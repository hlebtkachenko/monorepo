import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { and, desc, eq, inArray, isNull, isNotNull } from "drizzle-orm"
import { auth } from "@workspace/auth/server"
import { withAdminBypass } from "@workspace/db"
import { czechToday } from "@workspace/shared/date"
import {
  accounting_period,
  app_user,
  organization,
  organization_membership,
  vat_status,
} from "@workspace/db/schema"

import { formatIsoDate } from "../[orgSlug]/closing/_lib/closing-shared"
import { CompaniesView } from "../_components/workspace/companies/companies-view"
import { CompaniesProvider } from "../_components/workspace/companies/context"
import {
  fiscalYearLabel,
  toCompanyPeriods,
  vatRegimeLabel,
  type CompanyMember,
  type CompanyPeriod,
  type CompanyRow,
} from "../_components/workspace/companies/data"
import {
  canAssignCompanies,
  loadAssignableMembers,
  loadOrgAssignees,
} from "./_lib/assign-company"
import { getWorkspaceContext } from "./_lib/workspace-context"
import { computeWorkspaceObligations } from "./_lib/workspace-obligations"

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
 * or a table. Every field is real: identity + the member stack from
 * `organization` / `organization_membership` / `accounting_period`; VAT regime
 * from the current `vat_status` row; status derived from `archived_at` + the
 * period list; the next deadline from the shared obligation engine
 * (`workspace-obligations.ts`); the assignee from
 * `organization.responsible_user_id ⋈ app_user`. Reads use `withAdminBypass` +
 * an explicit `workspace_id` predicate — `organization` RLS is keyed on
 * `app.organization_id` (no workspace-scoped read policy), so `withWorkspace`
 * would return zero rows.
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
  // and is orthogonal to the status tabs (which filter the derived `status`).
  const showArchived = archived === "1"

  const activeWorkspaceId = ctx.activeWorkspaceId
  const today = czechToday()

  // Each org's real statutory obligations for its current period — feeds the
  // card's "next deadline" (own batch-loaded `withAdminBypass`, see
  // `workspace-obligations.ts`).
  const obligationsByOrg = await computeWorkspaceObligations(activeWorkspaceId)

  const { companies, assignableMembers } = await withAdminBypass(async (db) => {
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

    const assignableMembers = await loadAssignableMembers(db, activeWorkspaceId)

    if (orgs.length === 0) return { companies: [], assignableMembers }

    const orgIds = orgs.map((o) => o.id)

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
          inArray(organization_membership.organization_id, orgIds),
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

    // Every company's accounting periods in one round-trip, newest-first per
    // company (the query's total order is period_start desc, id desc; grouping
    // by iteration preserves that relative order within each org's bucket).
    const periodRows = await db
      .select({
        organizationId: accounting_period.organization_id,
        id: accounting_period.id,
        period_start: accounting_period.period_start,
        period_end: accounting_period.period_end,
        status: accounting_period.status,
      })
      .from(accounting_period)
      .where(inArray(accounting_period.organization_id, orgIds))
      .orderBy(desc(accounting_period.period_start), desc(accounting_period.id))

    const periodRowsByCompany = new Map<string, typeof periodRows>()
    for (const row of periodRows) {
      const list = periodRowsByCompany.get(row.organizationId) ?? []
      list.push(row)
      periodRowsByCompany.set(row.organizationId, list)
    }
    const periodsByCompany = new Map<string, CompanyPeriod[]>()
    for (const [orgId, rows] of periodRowsByCompany) {
      periodsByCompany.set(orgId, toCompanyPeriods(rows))
    }

    // Current VAT regime per company (the row with valid_to IS NULL).
    const vatRows = await db
      .select({
        organizationId: vat_status.organization_id,
        vatRegimeCode: vat_status.vat_regime_code,
      })
      .from(vat_status)
      .where(
        and(
          inArray(vat_status.organization_id, orgIds),
          isNull(vat_status.valid_to),
        ),
      )
    const vatRegimeByCompany = new Map(
      vatRows.map((r) => [r.organizationId, r.vatRegimeCode]),
    )

    const assigneeByCompany = await loadOrgAssignees(db, orgIds)

    const companies = orgs.map<CompanyRow>((o) => {
      const periods = periodsByCompany.get(o.id) ?? []
      const obligations = obligationsByOrg.get(o.id)?.obligations ?? []
      // Definite obligations only — a conditional row (SH, identified-person
      // VAT return) only applies IF the underlying event occurred, so it must
      // never be asserted as the org's next hard deadline (mirrors the org
      // Closing surface's `definiteObligations` filter).
      const upcoming = obligations.find(
        (ob) => ob.applicability.status === "APPLICABLE" && ob.dueDate >= today,
      )
      return {
        id: o.id,
        slug: o.slug,
        legalName: o.legalName,
        typeLabel: o.legalSubjectKind || o.personKind,
        fiscalYear: fiscalYearLabel(o.fiscalYearStartMonth),
        members: membersByCompany.get(o.id) ?? [],
        archived: showArchived,
        periods,
        vatRegime: vatRegimeLabel(vatRegimeByCompany.get(o.id)),
        status: showArchived
          ? "Archived"
          : periods.length === 0
            ? "Onboarding"
            : "Active",
        nextDeadline: upcoming
          ? `${upcoming.title} · ${formatIsoDate(upcoming.dueDate)}`
          : "No upcoming deadline",
        assignee: assigneeByCompany.get(o.id) ?? null,
      }
    })

    return { companies, assignableMembers }
  })

  const errorMessage = error ? ERROR_MESSAGES[error] : undefined
  const canAssign = ctx.current ? canAssignCompanies(ctx.current.role) : false

  return (
    <CompaniesProvider
      canAssign={canAssign}
      assignableMembers={assignableMembers}
    >
      <CompaniesView
        companies={companies}
        errorMessage={errorMessage}
        showArchived={showArchived}
      />
    </CompaniesProvider>
  )
}
