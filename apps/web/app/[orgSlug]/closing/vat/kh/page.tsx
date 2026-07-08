import { notFound } from "next/navigation"

import { KhView } from "../_components/kh-view"
import { getControlStatement } from "../_lib/vat-data"

export const metadata = { title: "Control statement" }

/**
 * Control statement (kontrolní hlášení) — the selected filing period's real
 * row-level sections from `buildKontrolniHlaseni`. Selection is server-read
 * via `?fp=<from>` (the filing period's start date); an unset or crafted
 * value falls back to the default period.
 */
export default async function ControlStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { orgSlug } = await params
  const sp = await searchParams
  const fp = typeof sp["fp"] === "string" ? sp["fp"] : undefined

  const data = await getControlStatement(orgSlug, fp)
  if (data.status === "no-access") notFound()

  return <KhView slug={orgSlug} data={data} />
}
