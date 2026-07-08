import { notFound } from "next/navigation"

import { ShView } from "../_components/sh-view"
import { getEcSalesList } from "../_lib/vat-data"

export const metadata = { title: "EC Sales List" }

/**
 * EC Sales List (souhrnné hlášení) — the selected filing period's real rows
 * from `buildSouhrnneHlaseni`. Selection is server-read via `?fp=<from>` (the
 * filing period's start date); an unset or crafted value falls back to the
 * default period.
 */
export default async function EcSalesListPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { orgSlug } = await params
  const sp = await searchParams
  const fp = typeof sp["fp"] === "string" ? sp["fp"] : undefined

  const data = await getEcSalesList(orgSlug, fp)
  if (data.status === "no-access") notFound()

  return <ShView slug={orgSlug} data={data} />
}
