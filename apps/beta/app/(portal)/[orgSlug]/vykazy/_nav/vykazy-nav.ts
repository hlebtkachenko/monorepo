import type { BetaImportDataset } from "@/db/schema"
import type { BetaMessageKey } from "@/i18n/messages"

/**
 * The three §2.5 statements as one nav model — the same flat shape
 * `dane/_nav/dane-nav.ts` uses, for the same reason: this is a row of links
 * inside one module, not the `@workspace/ui` sidebar-panel machinery
 * (`AppShell`'s `sidebar` prop is unwired in this app).
 *
 * EACH ENTRY CARRIES ITS DATASET, and that is the load-bearing field. Every
 * page in this module asks the same three questions of the import spine —
 * which periods are published, which batch is the published one, what are its
 * rows — and they differ only by `dataset`. Carrying it here means the tab
 * list and the read are the same list: a tab cannot exist for a dataset
 * nothing publishes, and a dataset cannot be rendered under the wrong tab.
 *
 * ROZVAHA IS THE MODULE ROOT (`slug: ""`), matching Souhrn in Daně and Vše in
 * Dokumenty: the rail entry points at `/[orgSlug]/vykazy` and lands on the
 * statement a client actually opens the module for, with no redirect hop.
 */
export type VykazyNavItem = {
  readonly labelKey: BetaMessageKey
  /** The path segment under `/[orgSlug]/vykazy/`, or `""` for Rozvaha itself. */
  readonly slug: string
  /** Which import dataset this tab renders. */
  readonly dataset: BetaImportDataset
}

export const VYKAZY_NAV: readonly VykazyNavItem[] = [
  { labelKey: "vykazy.navRozvaha", slug: "", dataset: "rozvaha" },
  { labelKey: "vykazy.navVysledovka", slug: "vzz", dataset: "vzz" },
  { labelKey: "vykazy.navPredvaha", slug: "predvaha", dataset: "predvaha" },
]

export function vykazyHref(orgSlug: string, slug: string): string {
  return slug === "" ? `/${orgSlug}/vykazy` : `/${orgSlug}/vykazy/${slug}`
}

/**
 * Whether `item` is the active tab for `pathname`.
 *
 * Rozvaha (`slug === ""`) matches ONLY exactly: its href is a strict PREFIX of
 * every sibling's, so a plain prefix match would light it up on the Výsledovka
 * page too — the same trap `isActiveDaneNav` and `isActiveAdminNav` name.
 */
export function isActiveVykazyNav(
  item: VykazyNavItem,
  orgSlug: string,
  pathname: string,
): boolean {
  const href = vykazyHref(orgSlug, item.slug)
  if (item.slug === "") return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}
