import { redirect } from "next/navigation"

/**
 * `/[orgSlug]/finance` — the module root, which is a redirect rather than a
 * page.
 *
 * Spec §2.4 gives Finance five sidebar leaves (Dluhy a platby · Účty a hotovost
 * · Pohledávky a závazky · Partneři · Úvěry a leasingy) and exactly one of them
 * exists so far, so there is nothing for a module landing page to be except a
 * list of things that are not built — which §0.3 forbids. The rail entry points
 * at this route so `AppRail`'s longest-prefix match keeps Finance active across
 * every leaf as the other four land.
 *
 * Tenancy is `[orgSlug]/layout.tsx`'s `requireScope`, which runs before this: a
 * stranger gets a 404 here, not a redirect into one.
 */
export default async function FinanceIndexPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  redirect(`/${orgSlug}/finance/dluhy-a-platby`)
}
