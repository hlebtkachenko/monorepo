import { redirect } from "next/navigation"

import { orgHref } from "@/lib/org/href"

/**
 * Účetnictví (Accounting) module root. The module has a single leaf for now —
 * the chart of accounts (Účtový rozvrh) — so the bare route redirects to it.
 * Landing on the module ROOT keeps the rail's `activeRailEntry` (longest-prefix)
 * resolution pointing at the Accounting sidebar tree for every accounting leaf.
 */
export default async function AccountingModulePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  redirect(orgHref(orgSlug, "accounting/chart-of-accounts"))
}
