import { notFound } from "next/navigation"

import { DpfoView } from "../_components/dpfo-view"
import { getPersonalIncomeTax } from "../_lib/income-tax-data"

export const metadata = { title: "Section 7 tax-record worksheet" }

/**
 * Section 7 tax-record worksheet from the active accounting period.
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
