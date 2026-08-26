import type { BetaMessageKey } from "@/i18n/messages"

/**
 * The three §2.2 entries — Vše, Doklady firmy, Stavby — as one nav model,
 * mirroring `dane/_nav/dane-nav.ts`'s shape for the same reason: this is a flat
 * list of links inside one section, not the full `@workspace/ui` sidebar-panel
 * machinery (`AppShell`'s `sidebar` prop is unwired in this app — see
 * `app/_shell/beta-shell.tsx` — and stays that way; Dokumenty's own chrome
 * renders these as a tab row instead of a resizable side panel).
 *
 * UNLIKE `DANE_NAV`, no entry is gated. Every role that can reach `/dokumenty`
 * at all sees all three tabs — the visibility narrowing lives entirely inside
 * `visibleDocuments()` (`lib/data/documents.ts`), which every one of the three
 * reads already applies, so a role that cannot see a given row also cannot see
 * it through Doklady firmy or Stavby; there is no second gate to keep in sync
 * here.
 */
export type DokumentyNavItem = {
  readonly labelKey: BetaMessageKey
  /** The path segment under `/[orgSlug]/dokumenty/`, or `""` for Vše itself. */
  readonly slug: string
}

export const DOKUMENTY_NAV: readonly DokumentyNavItem[] = [
  { labelKey: "dokumenty.navVse", slug: "" },
  { labelKey: "dokumenty.navFirma", slug: "firma" },
  { labelKey: "dokumenty.navStavby", slug: "stavby" },
]

export function dokumentyHref(orgSlug: string, slug: string): string {
  return slug === "" ? `/${orgSlug}/dokumenty` : `/${orgSlug}/dokumenty/${slug}`
}

/**
 * Whether `item` is the active tab for `pathname`.
 *
 * Vše (`slug === ""`) matches ONLY exactly: its href (`/${orgSlug}/dokumenty`)
 * is a strict PREFIX of every other tab's href (`/${orgSlug}/dokumenty/firma`,
 * …), so a plain prefix match would light Vše up on every sibling tab too —
 * the same trap `isActiveDaneNav` and `isActiveAdminNav` both name for their
 * own root entries.
 */
export function isActiveDokumentyNav(
  item: DokumentyNavItem,
  orgSlug: string,
  pathname: string,
): boolean {
  const href = dokumentyHref(orgSlug, item.slug)
  if (item.slug === "") return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}
