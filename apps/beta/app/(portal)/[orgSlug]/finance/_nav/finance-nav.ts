import type { BetaMessageKey } from "@/i18n/messages"

/**
 * The Finance module's own navigation (spec §2.4's sidebar), as the same flat
 * nav model `dane/_nav/dane-nav.ts` and `vykazy/_nav/vykazy-nav.ts` use — a row
 * of links inside one module, not the `@workspace/ui` sidebar-panel machinery
 * (`BetaShell` passes no `sidebar`, and turning that panel on for one module
 * would give every other one an empty panel and a toggle that does nothing).
 *
 * ONLY THE LEAVES THAT EXIST. §2.4 gives Finance five (Dluhy a platby · Účty a
 * hotovost · Pohledávky a závazky · Partneři · Úvěry a leasingy) and an entry is
 * added here only together with its route, exactly as the rail itself is built
 * (`app/_nav/beta-nav.ts`): the tab row never carries a dead link or a "coming
 * soon" stub, which §0.3 forbids. Partneři is not yet a route and stays absent
 * until it is; the order below is §2.4's own, with the unbuilt leaf simply
 * absent — so a later PR inserts its entry in place rather than appending and
 * re-ordering.
 *
 * DLUHY A PLATBY STAYS AT `finance/dluhy-a-platby` RATHER THAN BECOMING THE
 * MODULE ROOT. `finance/page.tsx` already redirects the rail entry there, that
 * redirect shipped with PR 18, and moving the page to `""` now would break every
 * link the Přehled KPI tile and the deadline list already emit. The tab is
 * matched on its own href like every other one.
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
  { labelKey: "finance.navPartneri", slug: "partneri" },
  { labelKey: "finance.navUvery", slug: "uvery" },
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
