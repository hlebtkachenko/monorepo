import { notFound } from "next/navigation"

import { IncomeTaxLandingView } from "./_components/income-tax-landing-view"
import { getIncomeTaxLanding } from "./_lib/income-tax-data"

export const metadata = { title: "Income tax" }

/**
 * Income tax landing — a launchpad to whichever of Corporation tax (DPPO)
 * or Personal income tax (DPFO) applies to this organization.
 */
export default async function IncomeTaxPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const data = await getIncomeTaxLanding(orgSlug)
  if (data.status === "no-access") notFound()

  return <IncomeTaxLandingView slug={orgSlug} data={data} />
}
