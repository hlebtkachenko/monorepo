import type { ReactNode } from "react"

import { resolveOrgScope } from "../_lib/org-scope"

import { FinanceNavTabs } from "./_components/finance-nav-tabs"

/**
 * The Finance tree (spec §2.4): a tab row above whichever leaf is active.
 *
 * IT ADDS NO PADDING, unlike `vykazy/layout.tsx`. Finance's first leaf shipped
 * before the module had a tab row and owns its own `p-6`; a layout that added a
 * second one would re-indent a page nobody is changing. Each leaf here pads
 * itself.
 *
 * `resolveOrgScope` is the SAME `cache()`-wrapped call the org layout already
 * made for this request — proving a scope exists at all is the only thing this
 * layout needs it for, exactly as `dane/layout.tsx` and `vykazy/layout.tsx` do.
 *
 * NO ROLE GATE. Everything under Finance is client-visible data every role may
 * read (spec §5: guest is an external viewer of it). The owner-only surface is
 * Pro účetní › Zadávání dat, which is where all of it is edited (§3.3).
 */
export default async function FinanceLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  await resolveOrgScope(orgSlug)

  return (
    <div className="flex flex-col">
      <FinanceNavTabs orgSlug={orgSlug} />
      {children}
    </div>
  )
}
