import "server-only"

import { and, desc, eq, inArray, isNull } from "drizzle-orm"
import { withAdminBypass } from "@workspace/db"
import { czechToday } from "@workspace/shared/date"
import {
  accounting_period,
  organization,
  organization_tax_profile,
  vat_status,
} from "@workspace/db/schema"
import {
  computeTimelineObligations,
  deriveObligationPresentationStatus,
  getVatPeriodActivity,
  resolveEffectiveTimeline,
  statutoryVatEnvelope,
  type EffectiveFact,
  type PayrollProfileValue,
  type PersonType,
  type ProfileIssue,
  type VatFilingPeriod,
  type VatProfileValue,
  type VatRegime,
} from "@workspace/accounting"

import type { ObligationWithStatus } from "../../[orgSlug]/closing/_lib/closing-shared"

export interface WorkspaceObligation extends ObligationWithStatus {
  organizationId: string
}

export interface WorkspaceObligationResult {
  obligations: WorkspaceObligation[]
  issues: ProfileIssue[]
}

type PeriodRow = {
  organizationId: string
  id: string
  periodStart: string
  periodEnd: string
}

type VersionedRow = {
  id: string
  organizationId: string
  validFrom: string
  validTo: string | null
}

type VatStatusRow = VersionedRow & {
  vatRegimeCode: string
  filingPeriod: VatFilingPeriod | null
}

type TaxProfileRow = VersionedRow & {
  hasStandardEmployment: boolean | null
  hasDpp: boolean | null
  hasDpc: boolean | null
  socialInsuranceParticipation: boolean | null
  healthInsuranceParticipation: boolean | null
  payrollTaxAdvanceDue: boolean | null
  specialRateWithholdingDue: boolean | null
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
 *   - missing VAT cadence or profile intervals remain explicit issues while
 *     independently known payroll intervals are still computed.
 *   - vat_status / organization_tax_profile are resolved as complete
 *     effective-dated timelines; gaps are preserved and overlaps fail loudly.
 */
export async function computeWorkspaceObligations(
  activeWorkspaceId: string,
): Promise<Map<string, WorkspaceObligationResult>> {
  const today = czechToday()
  const result = new Map<string, WorkspaceObligationResult>()

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
        id: vat_status.id,
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
        id: organization_tax_profile.id,
        organizationId: organization_tax_profile.organization_id,
        hasStandardEmployment: organization_tax_profile.has_standard_employment,
        hasDpp: organization_tax_profile.has_dpp,
        hasDpc: organization_tax_profile.has_dpc,
        socialInsuranceParticipation:
          organization_tax_profile.social_insurance_participation,
        healthInsuranceParticipation:
          organization_tax_profile.health_insurance_participation,
        payrollTaxAdvanceDue: organization_tax_profile.payroll_tax_advance_due,
        specialRateWithholdingDue:
          organization_tax_profile.special_rate_withholding_due,
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

      const vatEnvelope = statutoryVatEnvelope(
        period.periodStart,
        period.periodEnd,
      )
      const vatFacts: EffectiveFact<VatProfileValue>[] = (
        vatByOrg.get(org.id) ?? []
      ).map((row) => ({
        sourceId: row.id,
        validFrom: row.validFrom,
        validTo: row.validTo,
        value: {
          // Backed by vat_status.vat_regime_code -> vat_regime(code).
          regime: row.vatRegimeCode as VatRegime,
          filingPeriod: row.filingPeriod,
        },
      }))
      const payrollFacts: EffectiveFact<PayrollProfileValue>[] = (
        taxByOrg.get(org.id) ?? []
      ).map((row) => ({
        sourceId: row.id,
        validFrom: row.validFrom,
        validTo: row.validTo,
        value: {
          hasStandardEmployment: row.hasStandardEmployment,
          hasDpp: row.hasDpp,
          hasDpc: row.hasDpc,
          socialInsuranceParticipation: row.socialInsuranceParticipation,
          healthInsuranceParticipation: row.healthInsuranceParticipation,
          payrollTaxAdvanceDue: row.payrollTaxAdvanceDue,
          specialRateWithholdingDue: row.specialRateWithholdingDue,
        },
      }))
      const computed = computeTimelineObligations({
        from: period.periodStart,
        to: period.periodEnd,
        personType: org.personType as PersonType,
        vatTimeline: resolveEffectiveTimeline({
          from: vatEnvelope.from,
          to: vatEnvelope.to,
          facts: vatFacts,
        }),
        payrollTimeline: resolveEffectiveTimeline({
          from: period.periodStart,
          to: period.periodEnd,
          facts: payrollFacts,
        }),
        vatActivity: await getVatPeriodActivity(
          db,
          { kind: "FILING_PERIOD", period: vatEnvelope },
          org.id,
        ),
      })

      // Both `computeObligations` and `computePayrollObligations` already
      // return dueDate-ascending rows; this sort is redundant today but makes
      // the dueDate-ascending contract explicit rather than an implicit
      // coupling to the engine's internal ordering — the Companies page's
      // `.find(first upcoming)` (see `workspace/page.tsx`) relies on it.
      const withStatus: WorkspaceObligation[] = computed.obligations
        .map((o) => ({
          ...o,
          organizationId: org.id,
          status: deriveObligationPresentationStatus(o, today),
        }))
        .sort((a, b) =>
          a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0,
        )

      result.set(org.id, { obligations: withStatus, issues: computed.issues })
    }
  })

  return result
}
