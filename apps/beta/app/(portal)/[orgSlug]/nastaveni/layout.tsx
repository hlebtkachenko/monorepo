import type { ReactNode } from "react"

import { isEmployeeSeat } from "@/lib/data/scope"

import { resolveOrgScope } from "../_lib/org-scope"

import { NastaveniNavTabs } from "./_components/nastaveni-nav-tabs"
import { nastaveniNavFor } from "./_nav/nastaveni-nav"

/**
 * The Nastavení tree (spec §2.10): a tab row above whichever page is active.
 *
 * `resolveOrgScope` is the same `cache()`-wrapped call the org layout already
 * made for this request. Two of the three tabs do not vary by role — Společnost
 * is visible to everyone and only its edit controls are owner-gated (§2.10:
 * "owner edit; others view"), and Účet is about the viewer's own account — but
 * LIDÉ DOES (§5: people management is owner + admin), so the resolved scope now
 * chooses the list — and SPOLEČNOST does too since PR 33, because the employee
 * seat (§2.6.1) has no business with the company's identity card. The pages
 * behind the tabs gate themselves independently; this is about not advertising
 * them.
 *
 * THE SEAT IS NOT REFUSED THE SECTION ITSELF. `nastaveni-nav.ts`'s
 * `nastaveniDefaultSlug` explains the narrow exception: Účet is where an account
 * changes its own password, and it holds no company data.
 */
export default async function NastaveniLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const scope = await resolveOrgScope(orgSlug)

  return (
    <div className="flex flex-col">
      <NastaveniNavTabs orgSlug={orgSlug} items={nastaveniNavFor({
          role: scope.role,
          employeeSeat: isEmployeeSeat(scope),
        })} />
      <div className="grid gap-6 p-6">{children}</div>
    </div>
  )
}
