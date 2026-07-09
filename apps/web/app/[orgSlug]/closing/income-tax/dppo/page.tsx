import { notFound } from "next/navigation"

import { DppoView } from "../_components/dppo-view"
import { getCorporateIncomeTax } from "../_lib/income-tax-data"

export const metadata = { title: "Corporation tax" }

/**
 * Corporation tax (DPPO) — the active accounting period's real computed
 * figures from `buildDppo`. Annual output, no filing-period picker.
 */
export default async function DppoPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const data = await getCorporateIncomeTax(orgSlug)
  if (data.status === "no-access") notFound()

  return <DppoView data={data} />
}
