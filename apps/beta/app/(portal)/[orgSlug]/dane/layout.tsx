import type { ReactNode } from "react"

import { resolveOrgScope } from "../_lib/org-scope"

import { DaneNavTabs } from "./_components/dane-nav-tabs"
import { resolveVisibleFilingFamilies } from "./_lib/dane-scope"

/**
 * The Daně a podání tree (spec §2.3): a tab row (Souhrn + up to four
 * families, DPH gated) above whichever page is active underneath.
 *
 * `resolveOrgScope` here is the SAME `cache()`-wrapped call the org layout
 * already made for this request — proving a scope exists at all is the only
 * thing this layout needs it for; `resolveVisibleFilingFamilies` (itself
 * `cache()`-wrapped) does the one real extra read.
 */
export default async function DaneLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  await resolveOrgScope(orgSlug)
  const visibleFamilies = await resolveVisibleFilingFamilies(orgSlug)

  return (
    <div className="flex flex-col">
      <DaneNavTabs orgSlug={orgSlug} visibleFamilies={visibleFamilies} />
      <div className="grid gap-6 p-6">{children}</div>
    </div>
  )
}
