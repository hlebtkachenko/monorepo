import { redirect } from "next/navigation"

import { orgHref } from "@/lib/org/href"

/**
 * Finance module root. The module's first surface is the Číselníky (reference)
 * data; the bare route redirects to Měny. Landing on the module ROOT keeps the
 * rail's `activeRailEntry` (longest-prefix) resolution pointing at the Finance
 * sidebar tree for every Finance leaf. Operational leaves (bank / cash / …) and a
 * Přehled overview arrive in later phases.
 */
export default async function FinanceModulePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  redirect(orgHref(orgSlug, "finance/ciselniky/meny"))
}
