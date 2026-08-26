import { notFound } from "next/navigation"
import type { ReactNode } from "react"

import { payrollScope } from "@/lib/data/payroll"

import { resolveOrgScope } from "../_lib/org-scope"

import { MzdyNavTabs } from "./_components/mzdy-nav-tabs"

/**
 * The Mzdy tree (spec §2.6): a tab row above whichever payroll page is active
 * underneath, gated to the management seats `payrollScope()` already answers
 * `all` for.
 *
 * THE GATE LIVES HERE, NOT ONLY IN THE RAIL. Spec §2.6.1 draws the employee
 * seat's OWN, narrower rail (Přehled personal · Dokumenty own · Moje mzda) in
 * place of the nine-module one — it never reaches this tree at all, salary
 * being "the one dataset in this product where a leak is not recoverable by an
 * apology" (`lib/data/payroll.ts`'s own header). `betaRailNav` hiding the Mzdy
 * entry from a guest (`beta-nav.ts`) is the honest reflection of that, not the
 * enforcement of it — the same relationship `requireOwner` has with the Pro
 * účetní rail entry. A guest who still has the URL (a bookmark from before
 * losing access, or a hand-typed one) must get the same 404 every other
 * refusal in this application answers with, so the check runs here, at the
 * route, rather than only in the tab row's own visibility.
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
  if (payrollScope(scope).kind !== "all") notFound()

  return (
    <div className="flex flex-col">
      <MzdyNavTabs orgSlug={orgSlug} />
      <div className="grid gap-6 p-6">{children}</div>
    </div>
  )
}
