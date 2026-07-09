import "server-only"

import { and, desc, eq, inArray, isNull } from "drizzle-orm"
import { withAdminBypass } from "@workspace/db"
import {
  accounting_period,
  organization,
  organization_tax_profile,
  vat_status,
} from "@workspace/db/schema"
import {
  computeObligations,
  computePayrollObligations,
  type Obligation,
  type PersonType,
  type VatFilingPeriod,
  type VatRegime,
} from "@workspace/accounting"

import {
  deriveObligationStatus,
  type ObligationWithStatus,
} from "../../[orgSlug]/closing/_lib/closing-shared"

export interface WorkspaceObligation extends ObligationWithStatus {
  organizationId: string
}

type PeriodRow = {
  organizationId: string
  id: string
  periodStart: string
  periodEnd: string
}

type VersionedRow = {
  organizationId: string
  validFrom: string
  validTo: string | null
}

type VatStatusRow = VersionedRow & {
  vatRegimeCode: string
  filingPeriod: VatFilingPeriod | null
}

type TaxProfileRow = VersionedRow & {
  hasEmployees: boolean
}

/** The org's current period: contains today, else newest by period_start. */
function pickCurrentPeriod(
  rows: PeriodRow[],
  today: string,
): PeriodRow | undefined {
  return (
    rows.find((r) => r.periodStart <= today && today <= r.periodEnd) ?? rows[0]
  )
}

/**
 * The row PERIOD-EFFECTIVE for [periodStart, periodEnd]: `valid_from <=
 * periodEnd AND (valid_to IS NULL OR valid_to >= periodStart)`, newest
 * `valid_from` wins. Mirrors the predicate in `closing/_lib/period-profile.ts`.
 */
function pickEffective<T extends VersionedRow>(
  rows: T[],
  periodStart: string,
  periodEnd: string,
): T | undefined {
  const candidates = rows.filter(
    (r) =>
      r.validFrom <= periodEnd &&
      (r.validTo === null || r.validTo >= periodStart),
  )
  if (candidates.length === 0) return undefined
  return candidates.reduce((newest, r) =>
    r.validFrom > newest.validFrom ? r : newest,
  )
}

function groupByOrg<T extends { organizationId: string }>(
  rows: T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const list = map.get(row.organizationId) ?? []
    list.push(row)
    map.set(row.organizationId, list)
  }
  return map
}

/**
 * Compute every active org's real statutory obligations for its CURRENT
 * accounting period, batch-loaded (no N-per-org round trips) inside one
 * `withAdminBypass` — `organization` has no workspace-scoped read policy (see
 * `getWorkspaceContext`), so admin bypass + the explicit `workspace_id`
 * predicate is the tenant fence, same as every other workspace-tier reader.
 *
 * Known, honest limitations (mirrors `period-profile.ts`):
 *   - "current period" = the period containing today's date; if none does,
 *     the org's newest period by `period_start`. An org with no period at
 *     all contributes no obligations (still onboarding).
 *   - a VAT payer with no filing period configured (`vat_status.filing_period
 *     IS NULL`) cannot run through `computeObligations` (it throws), so only
 *     payroll is computed for that org — an honest partial, not a fabricated
 *     VAT schedule.
 *   - vat_status / organization_tax_profile are versioned by [valid_from,
 *     valid_to]; if more than one row overlaps the chosen period, the row
 *     with the latest `valid_from` wins (single-value-per-period, same
 *     simplification as `period-profile.ts`).
 */
export async function computeWorkspaceObligations(
  activeWorkspaceId: string,
): Promise<Map<string, WorkspaceObligation[]>> {
  const today = new Date().toISOString().slice(0, 10)
  const result = new Map<string, WorkspaceObligation[]>()

  await withAdminBypass(async (db) => {
    const orgs = await db
      .select({
        id: organization.id,
        personType: organization.person_type,
      })
      .from(organization)
      .where(
        and(
          eq(organization.workspace_id, activeWorkspaceId),
          isNull(organization.archived_at),
        ),
      )

    if (orgs.length === 0) return

    const orgIds = orgs.map((o) => o.id)

    const periodRows: PeriodRow[] = await db
      .select({
        organizationId: accounting_period.organization_id,
        id: accounting_period.id,
        periodStart: accounting_period.period_start,
        periodEnd: accounting_period.period_end,
      })
      .from(accounting_period)
      .where(inArray(accounting_period.organization_id, orgIds))
      .orderBy(desc(accounting_period.period_start))

    const vatStatusRows: VatStatusRow[] = await db
      .select({
        organizationId: vat_status.organization_id,
        vatRegimeCode: vat_status.vat_regime_code,
        filingPeriod: vat_status.filing_period,
        validFrom: vat_status.valid_from,
        validTo: vat_status.valid_to,
      })
      .from(vat_status)
      .where(inArray(vat_status.organization_id, orgIds))

    const taxProfileRows: TaxProfileRow[] = await db
      .select({
        organizationId: organization_tax_profile.organization_id,
        hasEmployees: organization_tax_profile.has_employees,
        validFrom: organization_tax_profile.valid_from,
        validTo: organization_tax_profile.valid_to,
      })
      .from(organization_tax_profile)
      .where(inArray(organization_tax_profile.organization_id, orgIds))

    const periodsByOrg = groupByOrg(periodRows)
    const vatByOrg = groupByOrg(vatStatusRows)
    const taxByOrg = groupByOrg(taxProfileRows)

    for (const org of orgs) {
      const orgPeriods = periodsByOrg.get(org.id)
      if (!orgPeriods || orgPeriods.length === 0) continue // no period yet — onboarding

      const period = pickCurrentPeriod(orgPeriods, today)
      if (!period) continue // defensive; orgPeriods is non-empty

      const effectiveVat = pickEffective(
        vatByOrg.get(org.id) ?? [],
        period.periodStart,
        period.periodEnd,
      )
      const effectiveTax = pickEffective(
        taxByOrg.get(org.id) ?? [],
        period.periodStart,
        period.periodEnd,
      )

      const vatRegimeCode = (effectiveVat?.vatRegimeCode ??
        null) as VatRegime | null
      const filingPeriod = effectiveVat?.filingPeriod ?? null
      const personType = (org.personType ?? "LEGAL") as PersonType
      const hasEmployees = effectiveTax?.hasEmployees ?? false

      let obligations: Obligation[]
      if (vatRegimeCode === "PAYER" && filingPeriod == null) {
        // VAT-unconfigured payer: computeObligations throws on this
        // combination. Compute payroll only — a real, honest partial.
        obligations = computePayrollObligations({
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          hasEmployees,
        })
      } else {
        obligations = computeObligations({
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          vatRegimeCode: vatRegimeCode ?? "NON_PAYER",
          vatFilingPeriod: filingPeriod,
          personType,
          hasEmployees,
        })
      }

      // Both `computeObligations` and `computePayrollObligations` already
      // return dueDate-ascending rows; this sort is redundant today but makes
      // the dueDate-ascending contract explicit rather than an implicit
      // coupling to the engine's internal ordering — the Companies page's
      // `.find(first upcoming)` (see `workspace/page.tsx`) relies on it.
      const withStatus: WorkspaceObligation[] = obligations
        .map((o) => ({
          ...o,
          organizationId: org.id,
          status: deriveObligationStatus(o.dueDate, today),
        }))
        .sort((a, b) =>
          a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0,
        )

      result.set(org.id, withStatus)
    }
  })

  return result
}
