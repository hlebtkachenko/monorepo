import { notFound } from "next/navigation"

import { getClosingObligations } from "../_lib/closing-data"
import { VatOverviewView } from "./_components/vat-overview-view"
import { getVatFilingPeriods } from "./_lib/vat-data"

export const metadata = { title: "VAT" }

/**
 * VAT landing — a launchpad to VAT return / control statement / EC sales
 * list, plus the real VAT-category statutory obligations (due dates +
 * status) for the active accounting period.
 */
export default async function VatPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const [filingPeriods, obligations] = await Promise.all([
    getVatFilingPeriods(orgSlug),
    getClosingObligations(orgSlug),
  ])
  if (filingPeriods.status === "no-access") notFound()

  return (
    <VatOverviewView
      slug={orgSlug}
      filingPeriods={filingPeriods}
      obligations={obligations}
    />
  )
}
