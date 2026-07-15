import { notFound } from "next/navigation"

import {
  fetchCashJournalRows,
  getOrgAccountingContext,
} from "../../_lib/accounting-data"
import {
  CashJournalView,
  type CashJournalTableRow,
} from "../../../_components/cash-journal/cash-journal-view"

export const metadata = { title: "Cash journal" }

/**
 * Peněžní deník (cash journal) — the period's classified monetary lines in
 * chronological book order (§13b / §7b), the primary book for the cash regimes
 * (jednoduché účetnictví / daňová evidence). Table archetype; fills the wired
 * `accounting › Books › Cash journal` nav slot. Server-fetched: resolves the org's
 * active period and runs the org-scoped monetary read (`fetchCashJournalRows`,
 * FORCE RLS), mapping each domain line to a flat scalar row — money stays a
 * decimal STRING; the running Zůstatek is derived client-side from row order.
 *
 * The default seed is a double-entry org with no `posting_monetary_line` rows, so
 * this renders EMPTY (clean empty state) until a cash-regime org books here.
 */
export default async function CashJournalPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const ctx = await getOrgAccountingContext(orgSlug)
  if (!ctx) notFound()

  const domainRows = await fetchCashJournalRows(ctx)
  const rows: CashJournalTableRow[] = domainRows.map((r) => ({
    id: r.line_id,
    date: r.posting_date,
    document: r.summary_designation,
    category: r.category_name ?? "",
    location: r.location,
    direction: r.direction,
    taxRelevant: r.is_tax_relevant ? "yes" : "no",
    taxBase: r.tax_base ?? "",
    amount: r.amount,
  }))

  return <CashJournalView rows={rows} />
}
