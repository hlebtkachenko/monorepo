import "server-only"

import { sql } from "drizzle-orm"
import { executeRows, withOrganization } from "@workspace/db"
import {
  getPeriodRegime,
  resolveEffectiveTimeline,
  statutoryVatEnvelope,
  type EffectiveFact,
  type EffectiveSegment,
  type PayrollProfileValue,
  type PersonType,
  type Regime,
  type VatProfileValue,
} from "@workspace/accounting"

import {
  getOrgAccountingContext,
  type OrgAccountingContext,
} from "../../_lib/accounting-data"
import { formatIsoDate } from "./closing-shared"

/**
 * Resolve the org + active accounting period, then read — EFFECTIVE FOR that
 * period (not merely the current one; the active period can be a historical
 * one the user switched to) — the vat_status, person_type, and accounting
 * regime in one `withOrganization` round trip. This is the single
 * period-scoped profile every Closing loader builds on before branching into
 * its own kind-specific logic:
 *   - `getClosingObligations` (closing-data.ts) + `resolveVatContext`
 *     (vat-data.ts) branch on vat_status + person_type;
 *   - the annual income-tax (income-tax-data.ts) + year-end
 *     (year-end-data.ts) loaders branch on person_type + regime.
 */
export type PeriodProfileResult =
  | { status: "no-access" }
  | { status: "no-period" }
  | {
      status: "ok"
      ctx: OrgAccountingContext
      periodId: string
      periodStart: string
      periodEnd: string
      periodLabel: string
      personType: PersonType
      regime: Regime
      vatTimeline: EffectiveSegment<VatProfileValue>[]
      payrollTimeline: EffectiveSegment<PayrollProfileValue>[]
    }

export async function resolvePeriodProfile(
  orgSlug: string,
): Promise<PeriodProfileResult> {
  const ctx = await getOrgAccountingContext(orgSlug)
  if (!ctx) return { status: "no-access" }
  if (
    ctx.periodId == null ||
    ctx.periodStart == null ||
    ctx.periodEnd == null
  ) {
    return { status: "no-period" }
  }
  const periodId = ctx.periodId
  const periodStart = ctx.periodStart
  const periodEnd = ctx.periodEnd
  const periodLabel = `${formatIsoDate(periodStart)} – ${formatIsoDate(periodEnd)}`

  const vatEnvelope = statutoryVatEnvelope(periodStart, periodEnd)
  const { personType, regime, vatFacts, payrollFacts } = await withOrganization(
    ctx.organizationId,
    ctx.userId,
    async (db) => {
      const [vatRows, orgRows, regime, taxRows] = await Promise.all([
        executeRows<{
          id: string
          vat_regime_code: VatProfileValue["regime"]
          filing_period: VatProfileValue["filingPeriod"]
          valid_from: string
          valid_to: string | null
        }>(
          db,
          sql`SELECT id, vat_regime_code, filing_period, valid_from, valid_to
                FROM vat_status
               WHERE organization_id = ${ctx.organizationId}::uuid
                 AND valid_from <= ${vatEnvelope.to}
                 AND (valid_to IS NULL OR valid_to >= ${vatEnvelope.from})
               ORDER BY valid_from`,
        ),
        executeRows<{ person_type: PersonType }>(
          db,
          sql`SELECT person_type FROM organization WHERE id = ${ctx.organizationId}::uuid`,
        ),
        getPeriodRegime(db, periodId),
        executeRows<{
          id: string
          has_employees: boolean
          valid_from: string
          valid_to: string | null
        }>(
          db,
          sql`SELECT id, has_employees, valid_from, valid_to
                FROM organization_tax_profile
               WHERE organization_id = ${ctx.organizationId}::uuid
                 AND valid_from <= ${periodEnd}
                 AND (valid_to IS NULL OR valid_to >= ${periodStart})
               ORDER BY valid_from`,
        ),
      ])
      const org = orgRows[0]
      if (!org) throw new Error("Organization profile not found")

      const vatFacts: EffectiveFact<VatProfileValue>[] = vatRows.map((row) => ({
        sourceId: row.id,
        validFrom: row.valid_from,
        validTo: row.valid_to,
        value: {
          regime: row.vat_regime_code,
          filingPeriod: row.filing_period,
        },
      }))
      const payrollFacts: EffectiveFact<PayrollProfileValue>[] = taxRows.map(
        (row) => ({
          sourceId: row.id,
          validFrom: row.valid_from,
          validTo: row.valid_to,
          value: { hasEmployees: row.has_employees },
        }),
      )
      return {
        personType: org.person_type,
        regime,
        vatFacts,
        payrollFacts,
      }
    },
  )

  const vatTimeline = resolveEffectiveTimeline({
    from: vatEnvelope.from,
    to: vatEnvelope.to,
    facts: vatFacts,
  })
  const payrollTimeline = resolveEffectiveTimeline({
    from: periodStart,
    to: periodEnd,
    facts: payrollFacts,
  })

  return {
    status: "ok",
    ctx,
    periodId,
    periodStart,
    periodEnd,
    periodLabel,
    personType,
    regime,
    vatTimeline,
    payrollTimeline,
  }
}
