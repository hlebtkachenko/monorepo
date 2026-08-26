import type { ReactNode } from "react"

import { assertNotEmployeeSeat } from "@/lib/data/scope"

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
 * NO ROLE GATE, WITH ONE EXCEPTION. Everything under Finance is client-visible
 * data every role may read (spec §5: guest is an external viewer of it), and the
 * owner-only surface is Pro účetní › Zadávání dat, where all of it is edited
 * (§3.3). The exception is the EMPLOYEE SEAT (spec §2.6.1, PR 33), whose rail is
 * Přehled · Dokumenty · Moje mzda and for whom "Everything else 404" — an
 * employee has no business with their employer's supplier debts, bank balances
 * or partner saldo.
 *
 * THE GATE IS HERE RATHER THAN IN EACH PAGE because §2.6.1's rule has to hold
 * for leaves that do not exist yet: §2.4 names five sidebar items and they land
 * across several PRs. A per-page check is a rule every future PR has to
 * remember; a Next layout renders for every nested route, so the refusal is
 * inherited rather than repeated.
 *
 * `employee-seat-fence.boundary.test.ts` fails if this call is ever removed.
 */
export default async function FinanceLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  assertNotEmployeeSeat(await resolveOrgScope(orgSlug))

  return (
    <div className="flex flex-col">
      <FinanceNavTabs orgSlug={orgSlug} />
      {children}
    </div>
  )
}
