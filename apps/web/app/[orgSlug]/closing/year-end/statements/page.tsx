import { notFound } from "next/navigation"

import { StatementsView } from "../_components/statements-view"
import { getFinancialStatements } from "../_lib/year-end-data"

export const metadata = { title: "Statements" }

/**
 * Financial statements (účetní závěrka) — the active accounting period's
 * real totals + layout from `buildZaverka` / `buildStatementLayout`. Annual
 * output, no filing-period picker.
 */
export default async function StatementsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const data = await getFinancialStatements(orgSlug)
  if (data.status === "no-access") notFound()

  return <StatementsView data={data} />
}
