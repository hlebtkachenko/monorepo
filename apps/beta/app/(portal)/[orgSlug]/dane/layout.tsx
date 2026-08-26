import type { ReactNode } from "react"

import { assertNotEmployeeSeat } from "@/lib/data/scope"

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
/**
 * THE EMPLOYEE SEAT DOES NOT HAVE THIS MODULE (spec §2.6.1: its rail is Přehled ·
 * Dokumenty · Moje mzda, and "Everything else 404"). `assertNotEmployeeSeat` is
 * that sentence, applied once at the module root so every leaf beneath it
 * inherits the refusal — a Next layout renders for every nested route, which is
 * exactly the property a whitelist wants.
 *
 * `employee-seat-fence.boundary.test.ts` fails if this call is ever removed.
 */
export default async function DaneLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  assertNotEmployeeSeat(await resolveOrgScope(orgSlug))
  const visibleFamilies = await resolveVisibleFilingFamilies(orgSlug)

  return (
    <div className="flex flex-col">
      <DaneNavTabs orgSlug={orgSlug} visibleFamilies={visibleFamilies} />
      <div className="grid gap-6 p-6">{children}</div>
    </div>
  )
}
