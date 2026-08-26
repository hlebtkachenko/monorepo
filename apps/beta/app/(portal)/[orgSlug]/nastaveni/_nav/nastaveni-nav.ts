import type { BetaMessageKey } from "@/i18n/messages"

/**
 * Nastavení's own tab row (spec §2.10).
 *
 * Same shape as `dane-nav.ts` and `admin-nav.ts` — a flat list of links inside
 * one section, rendered as tabs rather than through the `@workspace/ui` sidebar
 * panel, which `BetaShell` does not wire up.
 *
 * TWO ENTRIES, NOT THREE. The spec names Společnost, Lidé and Účet; Lidé is
 * PR 22 and is deliberately absent here rather than present-and-disabled. A tab
 * that renders and then 404s is worse than a tab that does not exist yet, and
 * the repo's no-placeholder rule says the same thing: the entry arrives in the
 * PR that ships the page behind it.
 *
 * NASTAVENÍ IS NOT IN THE RAIL. Spec §1: "Nastavení leaves the rail → header
 * gear/avatar menu (route `/[orgSlug]/nastaveni` unchanged)" — the rail is nine
 * entries against a ~650px fold, and settings is not a daily destination. The
 * entry point is `app/_components/account-menu.tsx`.
 */
export type NastaveniNavItem = {
  readonly labelKey: BetaMessageKey
  /** The path segment under `/[orgSlug]/nastaveni/`. */
  readonly slug: string
}

export const NASTAVENI_NAV: readonly NastaveniNavItem[] = [
  { labelKey: "nastaveni.navSpolecnost", slug: "spolecnost" },
  { labelKey: "nastaveni.navUcet", slug: "ucet" },
]

/**
 * The section's own landing target.
 *
 * `/[orgSlug]/nastaveni` itself renders nothing — it redirects here — so the
 * segment lives in one place instead of being spelled out by the page, the
 * account menu and the redirect separately.
 */
export const NASTAVENI_DEFAULT_SLUG = "spolecnost"

export function nastaveniHref(orgSlug: string, slug: string): string {
  return `/${orgSlug}/nastaveni/${slug}`
}

/**
 * Whether `item` is the active tab for `pathname`.
 *
 * Every entry has a real segment (there is no bare-`/nastaveni` tab), so the
 * prefix trap `isActiveDaneNav` documents for Souhrn cannot arise here — but
 * the `startsWith` arm still matters for a future detail route underneath a
 * tab, and matching on the full href keeps `/nastaveni/ucetni-neco` from
 * lighting up `/nastaveni/ucet`.
 */
export function isActiveNastaveniNav(
  item: NastaveniNavItem,
  orgSlug: string,
  pathname: string,
): boolean {
  const href = nastaveniHref(orgSlug, item.slug)
  return pathname === href || pathname.startsWith(`${href}/`)
}
