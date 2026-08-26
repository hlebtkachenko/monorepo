import type { ReactNode } from "react"

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
 * LIDÉ DOES (§5: people management is owner + admin), so the resolved role now
 * chooses the list. The page behind the tab gates itself independently; this is
 * about not advertising it.
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
      <NastaveniNavTabs orgSlug={orgSlug} items={nastaveniNavFor(scope.role)} />
      <div className="grid gap-6 p-6">{children}</div>
    </div>
  )
}
