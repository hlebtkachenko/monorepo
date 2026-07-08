import "server-only"

import { withOrganization } from "@workspace/db"
import {
  buildZaverka,
  buildStatementLayout,
  getPeriodRegime,
  type Zaverka,
  type StatementLayout,
  type Regime,
} from "@workspace/accounting"

import { getOrgAccountingContext } from "../../../_lib/accounting-data"
import { formatIsoDate } from "../../_lib/closing-shared"

/**
 * Server-side data for the Closing Year-end > Statements page. Like Income
 * tax this is ANNUAL — one computation per accounting period, no
 * filing-period picker.
 *
 * Financial statements (účetní závěrka, §18 ZoÚ) apply to DOUBLE_ENTRY
 * bookkeeping only (`buildZaverka` reads the double-entry read-model). A
 * period kept in a different regime (SINGLE_ENTRY / TAX_RECORDS) reports an
 * honest "not-applicable" state instead of an empty/fabricated statement.
 */

export type YearEndBaseStatus =
  { status: "no-access" } | { status: "no-period" }

export type FinancialStatementsResult =
  | YearEndBaseStatus
  | { status: "not-applicable"; reason: string }
  | {
      status: "ok"
      periodLabel: string
      zaverka: Zaverka
      layout: StatementLayout
    }

const NOT_DOUBLE_ENTRY_REASON =
  "Financial statements (účetní závěrka) apply to double-entry bookkeeping only — this company's active accounting period is not kept in double-entry regime."

type RegimeOutcome =
  | { regime: Exclude<Regime, "DOUBLE_ENTRY"> }
  | { regime: "DOUBLE_ENTRY"; zaverka: Zaverka; layout: StatementLayout }

/** Financial statements (účetní závěrka) — the active period's real totals + layout. */
export async function getFinancialStatements(
  orgSlug: string,
): Promise<FinancialStatementsResult> {
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
  const periodLabel = `${formatIsoDate(ctx.periodStart)} – ${formatIsoDate(ctx.periodEnd)}`

  const outcome = await withOrganization(
    ctx.organizationId,
    ctx.userId,
    async (db): Promise<RegimeOutcome> => {
      const regime = await getPeriodRegime(db, periodId)
      if (regime !== "DOUBLE_ENTRY") return { regime }
      const [zaverka, layout] = await Promise.all([
        buildZaverka(db, periodId),
        buildStatementLayout(db, periodId),
      ])
      return { regime, zaverka, layout }
    },
  )

  if (outcome.regime !== "DOUBLE_ENTRY") {
    return { status: "not-applicable", reason: NOT_DOUBLE_ENTRY_REASON }
  }

  return {
    status: "ok",
    periodLabel,
    zaverka: outcome.zaverka,
    layout: outcome.layout,
  }
}
