import type { BetaMessageKey } from "@/i18n/messages"

/**
 * The Mzdy tab row (spec §2.6: "Přehled mezd · Platby a termíny · Podklady ·
 * Zaměstnanci · Výplatnice"), the same flat shape `vykazy-nav.ts` and
 * `dane-nav.ts` use — a row of links inside one module, not the
 * `@workspace/ui` sidebar-panel machinery (`BetaShell` passes no `sidebar`).
 *
 * ALL FIVE LEAVES NOW LAND TOGETHER with their routes — the module-build
 * comment on `beta-nav.ts` states the rule this file follows: a tab exists
 * together with its route, never as a dead link ahead of it. Zaměstnanci and
 * Výplatnice were the two the first Mzdy UI PR routed forward; this PR builds
 * both routes and adds their tabs in the same change.
 *
 * PŘEHLED MEZD IS THE MODULE ROOT (`slug: ""`), matching Rozvaha in Výkazy and
 * Souhrn in Daně: the rail entry points at `/[orgSlug]/mzdy` and lands on the
 * page a client actually opens the module for.
 */
export type MzdyNavItem = {
  readonly labelKey: BetaMessageKey
  /** The path segment under `/[orgSlug]/mzdy/`, or `""` for Přehled mezd itself. */
  readonly slug: string
}

export const MZDY_NAV: readonly MzdyNavItem[] = [
  { labelKey: "mzdy.navPrehled", slug: "" },
  { labelKey: "mzdy.navPlatby", slug: "platby-a-terminy" },
  { labelKey: "mzdy.navPodklady", slug: "podklady" },
  { labelKey: "mzdy.navZamestnanci", slug: "zamestnanci" },
  { labelKey: "mzdy.navVyplatnice", slug: "vyplatnice" },
]

/**
 * The EMPLOYEE SEAT's Mzdy nav (spec §2.6.1) — one entry, and not one of the
 * five above.
 *
 * A SEPARATE LIST RATHER THAN A FILTER over `MZDY_NAV`. The seat's page is not a
 * management page it is allowed a subset of; it is a different page
 * (`moje-mzda`) that only the seat has, showing only that person's rows. A
 * filtered list would imply the two navs are the same list seen from two angles,
 * and the next tab added to `MZDY_NAV` would silently have to be considered for
 * the seat. Two lists means adding a management tab is a management-only act.
 *
 * IT IS STILL NOT THE GATE. `mzdy/layout.tsx` and `moje-mzda/page.tsx` both
 * answer 404 on their own; this decides what is advertised.
 */
export const MZDY_SEAT_NAV: readonly MzdyNavItem[] = [
  { labelKey: "mzdy.mojeMzdaTitle", slug: "moje-mzda" },
]

export function mzdyHref(orgSlug: string, slug: string): string {
  return slug === "" ? `/${orgSlug}/mzdy` : `/${orgSlug}/mzdy/${slug}`
}

/**
 * Whether `item` is the active tab for `pathname`.
 *
 * Přehled mezd (`slug === ""`) matches ONLY exactly: its href is a strict
 * PREFIX of every sibling's, so a plain prefix match would light it up on
 * Podklady too — the same trap `isActiveVykazyNav` and `isActiveDaneNav` name.
 */
export function isActiveMzdyNav(
  item: MzdyNavItem,
  orgSlug: string,
  pathname: string,
): boolean {
  const href = mzdyHref(orgSlug, item.slug)
  if (item.slug === "") return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}
