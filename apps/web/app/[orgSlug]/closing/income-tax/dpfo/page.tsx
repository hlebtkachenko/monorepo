import { notFound } from "next/navigation"

import { DpfoView } from "../_components/dpfo-view"
import { getPersonalIncomeTax } from "../_lib/income-tax-data"

export const metadata = { title: "Personal income tax" }

/**
 * Personal income tax (DPFO) — the active accounting period's real computed
 * figures from `buildDpfo`. Annual output, no filing-period picker.
 */
export default async function DpfoPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const data = await getPersonalIncomeTax(orgSlug)
  if (data.status === "no-access") notFound()

  return <DpfoView data={data} />
}
