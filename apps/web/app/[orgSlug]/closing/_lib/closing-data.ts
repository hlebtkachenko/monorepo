import "server-only"

import { sql } from "drizzle-orm"
import { executeRows, withOrganization } from "@workspace/db"
import {
  computeObligations,
  type PersonType,
  type VatFilingPeriod,
  type VatRegimeCode,
} from "@workspace/accounting"

import { getOrgAccountingContext } from "../../_lib/accounting-data"
import {
  deriveObligationStatus,
  formatIsoDate,
  type ClosingObligationsResult,
} from "./closing-shared"

export {
  deriveObligationStatus,
  formatIsoDate,
  type ClosingObligationStatus,
  type ObligationWithStatus,
  type ClosingObligationsResult,
} from "./closing-shared"

/**
 * Server-side data for the Closing Overview + Calendar pages — resolves the
 * org's active accounting period and current VAT/person profile, then runs
 * them through `computeObligations` (the pure `@workspace/accounting`
 * obligation engine). Real, computed rows only: an org that owes nothing
 * (e.g. NON_PAYER, no employees) legitimately gets an empty obligations
 * array — that is the correct answer, not a gap.
 *
 * `computeObligations` THROWS when `vatRegimeCode === "PAYER"` and
 * `vatFilingPeriod` is null (a payer must declare a filing cadence) — the
 * "vat-unconfigured" result branch below detects that combination BEFORE
 * calling the engine.
 */

/**
 * Resolve the org + active period (via `getOrgAccountingContext`), load the
 * vat_status + person_type EFFECTIVE FOR that period (not merely the current
 * one — the active period can be a historical one the user switched to) in
 * one `withOrganization` read, then compute the period's statutory
 * obligations.
 */
export async function getClosingObligations(
  orgSlug: string,
): Promise<ClosingObligationsResult> {
  const ctx = await getOrgAccountingContext(orgSlug)
  if (!ctx) return { status: "no-access" }
  if (
    ctx.periodId == null ||
    ctx.periodStart == null ||
    ctx.periodEnd == null
  ) {
    return { status: "no-period" }
  }
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
        vatRegimeCode: (vatStatus?.vat_regime_code ??
          null) as VatRegimeCode | null,
        filingPeriod: (vatStatus?.filing_period ??
          null) as VatFilingPeriod | null,
        personType: (org?.person_type ?? "LEGAL") as PersonType,
      }
    },
  )

  if (vatRegimeCode === "PAYER" && filingPeriod == null) {
    return { status: "vat-unconfigured", periodLabel }
  }

  // TODO(tax-profile): wire real has_employees once organization_tax_profile
  // lands (PR 3d); false = no payroll obligations shown, honest default.
  const hasEmployees = false

  const obligations = computeObligations({
    periodStart,
    periodEnd,
    vatRegimeCode,
    vatFilingPeriod: filingPeriod,
    personType,
    hasEmployees,
  })

  const today = new Date().toISOString().slice(0, 10)

  return {
    status: "ok",
    periodLabel,
    periodStart,
    periodEnd,
    obligations: obligations.map((o) => ({
      ...o,
      status: deriveObligationStatus(o.dueDate, today),
    })),
  }
}
