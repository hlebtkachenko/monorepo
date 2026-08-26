import type { BetaFilingFamily } from "@/db/schema"
import type { BetaMessageKey } from "@/i18n/messages"

/**
 * The five §2.3 entries — Souhrn plus the four families — as one nav model,
 * mirroring `app/admin/_nav/admin-nav.ts`'s shape for the same reason: this is
 * a flat list of links inside one section, not the full `@workspace/ui`
 * sidebar-panel machinery (`AppShell`'s `sidebar` prop is unwired in this app
 * — see `app/_shell/beta-shell.tsx` — and stays that way; Daně a podání's own
 * chrome renders these as a tab row instead of a resizable side panel).
 *
 * `family: null` marks Souhrn: it is the cross-family rollup, not a bucket a
 * filing belongs to (spec §2.3, `db/schema/_enums.ts`'s note on
 * `beta_filing_family`), so it is never checked against
 * `visibleFilingFamiliesForScope` — every other entry is.
 */
export type DaneNavItem = {
  readonly labelKey: BetaMessageKey
  /** The path segment under `/[orgSlug]/dane/`, or `""` for Souhrn itself. */
  readonly slug: string
  readonly family: BetaFilingFamily | null
}

export const DANE_NAV: readonly DaneNavItem[] = [
  { labelKey: "dane.navSouhrn", slug: "", family: null },
  { labelKey: "dane.navDph", slug: "dph", family: "dph" },
  {
    labelKey: "dane.navDanZPrijmu",
    slug: "dan-z-prijmu",
    family: "dan_z_prijmu",
  },
  {
    labelKey: "dane.navMzdoveOdvody",
    slug: "mzdove-odvody",
    family: "mzdove_odvody",
  },
  { labelKey: "dane.navOstatni", slug: "ostatni", family: "ostatni" },
]

export function daneHref(orgSlug: string, slug: string): string {
  return slug === "" ? `/${orgSlug}/dane` : `/${orgSlug}/dane/${slug}`
}

/**
 * Whether `item` is the active tab for `pathname`.
 *
 * Souhrn (`slug === ""`) matches ONLY exactly: its href
 * (`/${orgSlug}/dane`) is a strict PREFIX of every family href
 * (`/${orgSlug}/dane/dph`, …), so a plain prefix match would light Souhrn up
 * on every family page too — the same trap `isActiveAdminNav` names for
 * `/admin` itself.
 */
export function isActiveDaneNav(
  item: DaneNavItem,
  orgSlug: string,
  pathname: string,
): boolean {
  const href = daneHref(orgSlug, item.slug)
  if (item.slug === "") return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}
