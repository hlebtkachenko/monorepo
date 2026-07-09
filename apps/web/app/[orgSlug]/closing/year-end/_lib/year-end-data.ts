import "server-only"

import { withOrganization } from "@workspace/db"
import {
  buildZaverka,
  buildStatementLayout,
  type Zaverka,
  type StatementLayout,
} from "@workspace/accounting"

import {
  resolvePeriodProfile,
  type PeriodProfileResult,
} from "../../_lib/period-profile"

/**
 * Server-side data for the Closing Year-end > Statements page. Like Income
 * tax this is ANNUAL — one computation per accounting period, no
 * filing-period picker.
 *
 * Financial statements (účetní závěrka, §18 ZoÚ) apply to DOUBLE_ENTRY
 * bookkeeping only (`buildZaverka` / `buildStatementLayout` read the
 * double-entry read-model). A period kept in a different regime
 * (SINGLE_ENTRY / TAX_RECORDS) reports an honest "not-applicable" state
 * instead of an empty/fabricated statement.
 */

type YearEndBase = Exclude<PeriodProfileResult, { status: "ok" }>

export type FinancialStatementsResult =
  | YearEndBase
  | { status: "not-applicable"; reason: string }
  | {
      status: "ok"
      periodLabel: string
      zaverka: Zaverka
      layout: StatementLayout
    }

const NOT_DOUBLE_ENTRY_REASON =
  "Financial statements (účetní závěrka) apply to double-entry bookkeeping only — this company's active accounting period is not kept in double-entry regime."

/** Financial statements (účetní závěrka) — the active period's real totals + layout. */
export async function getFinancialStatements(
  orgSlug: string,
): Promise<FinancialStatementsResult> {
  const profile = await resolvePeriodProfile(orgSlug)
  if (profile.status !== "ok") return profile
  if (profile.regime !== "DOUBLE_ENTRY") {
    return { status: "not-applicable", reason: NOT_DOUBLE_ENTRY_REASON }
  }
  const { zaverka, layout } = await withOrganization(
    profile.ctx.organizationId,
    profile.ctx.userId,
    async (db) => {
      const [zaverka, layout] = await Promise.all([
        buildZaverka(db, profile.periodId),
        buildStatementLayout(db, profile.periodId),
      ])
      return { zaverka, layout }
    },
  )
  return { status: "ok", periodLabel: profile.periodLabel, zaverka, layout }
}
