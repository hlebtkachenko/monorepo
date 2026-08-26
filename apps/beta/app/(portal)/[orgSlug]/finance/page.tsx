import { redirect } from "next/navigation"

/**
 * `/[orgSlug]/finance` — the module root, which is a redirect rather than a
 * page.
 *
 * Spec §2.4 gives Finance five sidebar leaves (Dluhy a platby · Účty a hotovost
 * · Pohledávky a závazky · Partneři · Úvěry a leasingy). Two of them exist, and
 * the module root stays a redirect rather than becoming a landing page: a
 * landing page here would be a list of things that are not built, which §0.3
 * forbids, and the leaves are now reachable from the tab row in `layout.tsx`.
 * The rail entry points at this route so `AppRail`'s longest-prefix match keeps
 * Finance active across every leaf as the other three land.
 *
 * DLUHY A PLATBY IS THE TARGET, unchanged: it is the leaf a client opens the
 * module for, and it is the URL their bookmarks already carry.
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
