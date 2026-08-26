import type { ReactNode } from "react"

import { requireOwner } from "@/lib/data/scope"

import { resolveOrgScope } from "../_lib/org-scope"

import { ProUcetniTabs } from "./_components/pro-ucetni-tabs"

/**
 * The owner-only gate for the whole Pro účetní section (spec §3, §5).
 *
 * INSIDE `[orgSlug]`, NOT A SIBLING OF IT — unlike /admin, Pro účetní is still
 * one client's book: it reuses the SAME `BetaShell` the rest of the
 * organization renders (mounted by `app/(portal)/[orgSlug]/layout.tsx`, one
 * level up), just with the owner-only rail entry `beta-nav.ts` adds. This
 * layout's only job is the extra gate on top of the membership `[orgSlug]/
 * layout.tsx` already proved.
 *
 * `resolveOrgScope` is the SAME `cache()`-wrapped call the outer layout
 * already made for this request (same `orgSlug` argument), so `requireOwner`
 * here costs no second database round trip — only the (free) role check.
 *
 * THE GATE IS NOT WHAT STOPS A POST. It is what stops a browser from SEEING
 * this section: a non-owner never gets this far (404, the same code path
 * `assertOwner` uses everywhere else — see `lib/data/scope.ts`). Every
 * Server Action under `_actions/` re-derives its own `OwnerScope` as its
 * first statement, because a Server Action does not run this layout.
 */
export default async function ProUcetniLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const scope = await resolveOrgScope(orgSlug)
  requireOwner(scope)

  return (
    <>
      {/*
        The section's own navigation (spec §3's sidebar), added in PR 18
        because that is when the section gained a SECOND leaf — one link to
        the page you are already on would have been chrome for its own sake.
      */}
      <ProUcetniTabs orgSlug={scope.organizationSlug} />
      {children}
    </>
  )
}
