import "server-only"

import { sql } from "drizzle-orm"
import { executeRows, withOrganization } from "@workspace/db"
import type {
  PersonType,
  VatFilingPeriod,
  VatRegime,
} from "@workspace/accounting"

import {
  getOrgAccountingContext,
  type OrgAccountingContext,
} from "../../_lib/accounting-data"
import { formatIsoDate } from "./closing-shared"

/**
 * Resolve the org + active accounting period, then read the vat_status +
 * person_type EFFECTIVE FOR that period (not merely the current one — the
 * active period can be a historical one the user switched to) in one
 * `withOrganization` read. Shared by `getClosingObligations`
 * (closing-data.ts) and `resolveVatContext` (vat-data.ts) — both need this
 * exact same period-effective profile before branching into their own
 * kind-specific logic.
 */
export type PeriodVatProfileResult =
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
    }

export async function resolvePeriodVatProfile(
  orgSlug: string,
): Promise<PeriodVatProfileResult> {
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

  const { vatRegimeCode, filingPeriod, personType } = await withOrganization(
    ctx.organizationId,
    ctx.userId,
    async (db) => {
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
      return {
        // No vat_status row overlapping the period -> treat as no VAT
        // obligations (same effect as NON_PAYER: computeObligations only
        // branches on "PAYER" and "IDENTIFIED_PERSON").
        vatRegimeCode: (vatStatus?.vat_regime_code ?? null) as VatRegime | null,
        filingPeriod: (vatStatus?.filing_period ??
          null) as VatFilingPeriod | null,
        personType: (org?.person_type ?? "LEGAL") as PersonType,
      }
    },
  )

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
  }
}
