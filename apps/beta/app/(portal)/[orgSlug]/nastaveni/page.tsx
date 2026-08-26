import { redirect } from "next/navigation"

import { isEmployeeSeat } from "@/lib/data/scope"

import { resolveOrgScope } from "../_lib/org-scope"

import { nastaveniDefaultSlug, nastaveniHref } from "./_nav/nastaveni-nav"

/**
 * `/[orgSlug]/nastaveni` — the route the spec names (§2.10) and the account
 * menu links to. It has no body of its own: Nastavení is a set of tabs, and the
 * first one is Společnost.
 *
 * A redirect rather than rendering Společnost here, so there is exactly ONE
 * canonical URL per tab — two routes rendering the same page would make the tab
 * row's active state depend on which link the user happened to follow.
 *
 * `resolveOrgScope` is the same `cache()`-wrapped call the outer layout already
 * made, so asking WHICH tab this viewer lands on costs no extra query.
 */
export default async function NastaveniIndexPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const scope = await resolveOrgScope(orgSlug)
  // Per viewer (PR 33): the employee seat lands on Účet, everyone else on
  // Společnost. Redirecting a seat to a page it would 404 on is the dead end
  // this function exists to avoid.
  redirect(nastaveniHref(orgSlug, nastaveniDefaultSlug({
      role: scope.role,
      employeeSeat: isEmployeeSeat(scope),
    })))
}
