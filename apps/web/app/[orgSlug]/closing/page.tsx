import { notFound } from "next/navigation"

import { getClosingObligations } from "./_lib/closing-data"
import { ClosingOverviewView } from "./_components/closing-overview-view"

export const metadata = { title: "Closing" }

/**
 * Closing Overview — the real computed statutory obligations for the org's
 * active accounting period (VAT return, control statement, EC sales list,
 * payroll remittances), sourced from the `@workspace/accounting` obligation
 * engine. No mock rows: an org that owes nothing shows an honest empty state.
 */
export default async function ClosingPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const data = await getClosingObligations(orgSlug)
  if (data.status === "no-access") notFound()

  return <ClosingOverviewView data={data} />
}
