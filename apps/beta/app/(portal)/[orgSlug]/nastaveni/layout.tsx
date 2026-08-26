import type { ReactNode } from "react"

import { resolveOrgScope } from "../_lib/org-scope"

import { NastaveniNavTabs } from "./_components/nastaveni-nav-tabs"

/**
 * The Nastavení tree (spec §2.10): a tab row above whichever page is active.
 *
 * `resolveOrgScope` is the same `cache()`-wrapped call the org layout already
 * made for this request; proving a scope exists is the only thing this layout
 * needs it for. Which tabs a viewer may SEE does not vary by role — Společnost
 * is visible to everyone and only its edit controls are owner-gated (§2.10:
 * "owner edit; others view"), and Účet is about the viewer's own account.
 */
export default async function NastaveniLayout({
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
      <NastaveniNavTabs orgSlug={orgSlug} />
      <div className="grid gap-6 p-6">{children}</div>
    </div>
  )
}
