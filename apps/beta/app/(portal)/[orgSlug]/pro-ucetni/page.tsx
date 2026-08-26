import { redirect } from "next/navigation"

import { proUcetniLandingHref } from "./_nav/pro-ucetni-nav"

/**
 * `/[orgSlug]/pro-ucetni` — the section root, which is a redirect rather than a
 * page.
 *
 * The rail entry points here (`app/_nav/beta-nav.ts`) instead of at one named
 * leaf, so the entry does not have to be edited every time the section's first
 * item changes. There is deliberately NO landing page: spec §3's Pro účetní is
 * a set of working surfaces, and a hub page listing links the section nav
 * already shows would be chrome with nothing behind it (§0.3 — no placeholders).
 *
 * The owner gate is `layout.tsx`'s, which runs before this: a non-owner gets a
 * 404 here, not a redirect into a 404.
 */
export default async function ProUcetniIndexPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  redirect(proUcetniLandingHref(orgSlug))
}
