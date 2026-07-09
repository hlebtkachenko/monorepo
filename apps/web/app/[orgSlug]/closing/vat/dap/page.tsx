import { notFound } from "next/navigation"

import { DapView } from "../_components/dap-view"
import { getVatReturn } from "../_lib/vat-data"

export const metadata = { title: "VAT return worksheet" }

/**
 * VAT return (přiznání k DPH) — the selected filing period's real přiznání
 * lines from `buildDph`. Selection is server-read via `?fp=<from>` (the
 * filing period's start date); an unset or crafted value falls back to the
 * default period.
 */
export default async function VatReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { orgSlug } = await params
  const sp = await searchParams
  const fp = typeof sp["fp"] === "string" ? sp["fp"] : undefined

  const data = await getVatReturn(orgSlug, fp)
  if (data.status === "no-access") notFound()

  return <DapView slug={orgSlug} data={data} />
}
