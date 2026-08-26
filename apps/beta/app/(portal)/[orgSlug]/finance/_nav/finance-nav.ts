import type { BetaMessageKey } from "@/i18n/messages"

/**
 * The Finance module's own navigation (spec §2.4's sidebar), as the same flat
 * nav model `vykazy/_nav/vykazy-nav.ts` and `dane/_nav/dane-nav.ts` use — a row
 * of links inside one module, not the `@workspace/ui` sidebar-panel machinery
 * (`BetaShell` passes no `sidebar`, and turning that panel on for one module
 * would give every other one an empty panel and a toggle that does nothing).
 *
 * §2.4 NAMES FIVE LEAVES; THIS LIST CARRIES THE ONES THAT EXIST. Dluhy a platby
 * (PR 18), Účty a hotovost (PR 27) and Pohledávky a závazky (PR 28) are routes;
 * Partneři and Úvěry a leasingy are not, and spec §0.3 forbids a placeholder for
 * them. Each arrives as ONE MORE ENTRY in this array together with its page —
 * the same rule `app/_nav/beta-nav.ts` states for the rail as a whole.
 *
 * DLUHY A PLATBY IS THE FIRST LEAF BUT NOT THE MODULE ROOT. Unlike Výkazy —
 * where Rozvaha lives at `/[orgSlug]/vykazy` itself — `finance/page.tsx`
 * redirects, because §2.4's first leaf was built before the module had a second
 * one and the route the client's bookmarks already carry is
 * `/finance/dluhy-a-platby`. So every entry here has a real, non-empty slug and
 * the active match needs no exact-match special case.
 */
export type FinanceNavItem = {
  readonly labelKey: BetaMessageKey
  /** The path segment under `/[orgSlug]/finance/`. Never empty — see above. */
  readonly slug: string
}

export const FINANCE_NAV: readonly FinanceNavItem[] = [
  { labelKey: "finance.navDluhy", slug: "dluhy-a-platby" },
  { labelKey: "finance.navUcty", slug: "ucty-a-hotovost" },
  { labelKey: "finance.navPohledavky", slug: "pohledavky-a-zavazky" },
]

export function financeHref(orgSlug: string, slug: string): string {
  return `/${orgSlug}/finance/${slug}`
}

/**
 * Whether `item` is the active tab for `pathname`.
 *
 * A prefix match is safe here only because no slug is a prefix of another one
 * (`isActiveVykazyNav` needs an exact-match branch precisely because Rozvaha's
 * href is a prefix of every sibling's). The sibling test asserts that property
 * rather than trusting it, so a leaf added later cannot quietly break it.
 */
export function isActiveFinanceNav(
  item: FinanceNavItem,
  orgSlug: string,
  pathname: string,
): boolean {
  const href = financeHref(orgSlug, item.slug)
  return pathname === href || pathname.startsWith(`${href}/`)
}
