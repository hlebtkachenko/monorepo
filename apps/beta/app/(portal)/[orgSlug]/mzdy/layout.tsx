import { notFound } from "next/navigation"
import type { ReactNode } from "react"

import { payrollScope } from "@/lib/data/payroll"

import { resolveOrgScope } from "../_lib/org-scope"

import { MzdyNavTabs } from "./_components/mzdy-nav-tabs"
import { MZDY_NAV, MZDY_SEAT_NAV } from "./_nav/mzdy-nav"

/**
 * The Mzdy tree (spec §2.6): a tab row above whichever payroll page is active
 * underneath, gated to the management seats `payrollScope()` already answers
 * `all` for.
 *
 * THE GATE LIVES HERE, NOT ONLY IN THE RAIL. `betaRailNav` hiding the Mzdy
 * entry from an unlinked guest (`beta-nav.ts`) is the honest reflection of what
 * `payrollScope` answers, not the enforcement of it — the same relationship
 * `requireOwner` has with the Pro účetní rail entry. A guest who still has the
 * URL (a bookmark from before losing access, or a hand-typed one) must get the
 * same 404 every other refusal in this application answers with, so the check
 * runs here, at the route, rather than only in the tab row's visibility. Salary
 * is "the one dataset in this product where a leak is not recoverable by an
 * apology" (`lib/data/payroll.ts`).
 *
 * THE EMPLOYEE SEAT REACHES THIS TREE (PR 33) — and exactly one leaf of it.
 * Spec §2.6.1 gives the seat its own narrower rail whose third entry is **Moje
 * mzda**, which lives under `/mzdy/moje-mzda` because it IS a payroll page: it
 * reads `payroll_employee_line` and `document(doc_type='payslip')` through the
 * same two modules every other page here reads them through. So this layout
 * admits `all` AND `employee`, and each LEAF re-states which of the two it is
 * for. The alternative — mounting Moje mzda outside `/mzdy` to keep this gate a
 * one-liner — would have put a payroll surface where nobody auditing payroll
 * would look for it.
 *
 * THE LAYOUT IS NOT THE LEAF GATE, and this is the part worth being explicit
 * about: `payrollScope(scope).kind === "none"` is the ONLY refusal here, so
 * passing it does not mean a page may render. `zamestnanci`, `vyplatnice`,
 * `podklady`, `platby-a-terminy` and the module root each independently require
 * `kind === "all"`, and `moje-mzda` requires `kind === "employee"`. A layout
 * that tried to be the whole gate would have to know the route, which a Next
 * layout does not.
 *
 * `payrollScope`, not a bespoke role check: it is the SAME seam every read in
 * `lib/data/payroll.ts` already gates on, so "may this caller open Mzdy at
 * all" and "may this caller's reads see any payroll row" can never disagree —
 * two independent role checks are two places for them to drift apart.
 *
 * `resolveOrgScope` is the SAME `cache()`-wrapped call the outer layout
 * already made for this request — proving a scope exists at all, and reading
 * its role, costs no second database round trip.
 */
export default async function MzdyLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const scope = await resolveOrgScope(orgSlug)
  const visibility = payrollScope(scope)
  if (visibility.kind === "none") notFound()

  return (
    <div className="flex flex-col">
      <MzdyNavTabs
        orgSlug={orgSlug}
        items={visibility.kind === "employee" ? MZDY_SEAT_NAV : MZDY_NAV}
      />
      <div className="grid gap-6 p-6">{children}</div>
    </div>
  )
}
