import "server-only"

import { sql } from "drizzle-orm"
import { executeRows, withOrganization } from "@workspace/db"
import {
  getPeriodRegime,
  type PersonType,
  type Regime,
  type VatFilingPeriod,
  type VatRegime,
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
      vatRegimeCode: VatRegime | null
      filingPeriod: VatFilingPeriod | null
      personType: PersonType
      regime: Regime
      hasEmployees: boolean
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

  const { vatRegimeCode, filingPeriod, personType, regime, hasEmployees } =
    await withOrganization(ctx.organizationId, ctx.userId, async (db) => {
      const [vatStatus] = await executeRows<{
        vat_regime_code: string
        filing_period: string | null
      }>(
        db,
        // Regime effective FOR the active period (not merely current), so a
        // historical period reports its own regime. Mid-period regime
        // changes are approximated by the latest overlapping row — the
        // engine is single-regime-per-period; a mid-year change is a known
        // simplification to revisit if it matters.
        sql`SELECT vat_regime_code, filing_period FROM vat_status
            WHERE organization_id = ${ctx.organizationId}::uuid
              AND valid_from <= ${periodEnd}
              AND (valid_to IS NULL OR valid_to >= ${periodStart})
            ORDER BY valid_from DESC LIMIT 1`,
      )
      const [org] = await executeRows<{ person_type: string }>(
        db,
        sql`SELECT person_type FROM organization WHERE id = ${ctx.organizationId}::uuid`,
      )
      const regime = await getPeriodRegime(db, periodId)
      const [taxRow] = await executeRows<{ has_employees: boolean }>(
        db,
        // Same period-effective predicate as the vat_status read above —
        // and the same single-value-per-period simplification: if MORE THAN
        // ONE organization_tax_profile row overlaps the active period (e.g.
        // a mid-period hire or termination), `ORDER BY valid_from DESC
        // LIMIT 1` reduces it to the latest overlapping row's value. Splitting
        // payroll obligations at the mid-period boundary is deferred.
        sql`SELECT has_employees FROM organization_tax_profile
            WHERE organization_id = ${ctx.organizationId}::uuid
              AND valid_from <= ${periodEnd}
              AND (valid_to IS NULL OR valid_to >= ${periodStart})
            ORDER BY valid_from DESC LIMIT 1`,
      )
      return {
        // No vat_status row overlapping the period -> treat as no VAT
        // obligations (same effect as NON_PAYER: computeObligations only
        // branches on "PAYER" and "IDENTIFIED_PERSON").
        vatRegimeCode: (vatStatus?.vat_regime_code ?? null) as VatRegime | null,
        filingPeriod: (vatStatus?.filing_period ??
          null) as VatFilingPeriod | null,
        personType: (org?.person_type ?? "LEGAL") as PersonType,
        regime,
        // No organization_tax_profile row overlapping the period -> no
        // payroll obligations, the honest default (no profile set = no
        // employees on record).
        hasEmployees: taxRow?.has_employees ?? false,
      }
    })

  return {
    status: "ok",
    ctx,
    periodId,
    periodStart,
    periodEnd,
    periodLabel,
    vatRegimeCode,
    filingPeriod,
    personType,
    regime,
    hasEmployees,
  }
}
