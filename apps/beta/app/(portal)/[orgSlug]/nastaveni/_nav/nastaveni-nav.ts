import type { BetaOrgRole } from "@/db/schema"
import type { BetaMessageKey } from "@/i18n/messages"
import { managesPeople } from "@/lib/auth/invite-policy"

/**
 * Nastavení's own tab row (spec §2.10).
 *
 * Same shape as `dane-nav.ts` and `admin-nav.ts` — a flat list of links inside
 * one section, rendered as tabs rather than through the `@workspace/ui` sidebar
 * panel, which `BetaShell` does not wire up.
 *
 * THREE ENTRIES, ONE OF THEM ROLE-GATED (PR 22). Společnost and Účet are
 * everyone's: the first is "owner edit; others view", the second is about the
 * viewer's own account. LIDÉ IS NOT. Spec §5 gives people management to owner
 * and admin only, and `managesPeople` is the predicate that already decides
 * every individual act on that page — so the tab is derived from it rather than
 * from a second list of roles, and "can see the tab" cannot drift from "can do
 * anything on it". A `member` who types the URL gets a 404 from
 * `peopleForScope`, not a rendered-but-empty page.
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
  /** `true` when the tab is only for roles that administer people (§5). */
  readonly peopleManagement?: true
  /**
   * `true` when the tab shows the COMPANY rather than the viewer (PR 33). Spec
   * §2.6.1 keeps company data away from the employee seat, and the identity card
   * — IČO, sídlo, bank account, datová schránka, spisová značka — is company
   * data even though it is not a financial statement.
   */
  readonly company?: true
}

export const NASTAVENI_NAV: readonly NastaveniNavItem[] = [
  { labelKey: "nastaveni.navSpolecnost", slug: "spolecnost", company: true },
  { labelKey: "nastaveni.navLide", slug: "lide", peopleManagement: true },
  { labelKey: "nastaveni.navUcet", slug: "ucet" },
]

/**
 * The tabs THIS viewer may see.
 *
 * Called from the layout (a Server Component, which has the resolved scope) and
 * the result is handed to the client tab strip as data. The role never crosses
 * to the browser and the filter never runs there — a client-side filter would
 * be a hint, and this is a visibility rule.
 */
/**
 * The viewer's facts, as the caller's resolved scope already carries them.
 *
 * PLAIN FACTS, NOT AN `OrgScope`, and that is load-bearing rather than a style
 * choice: this module is imported by `NastaveniNavTabs`, a CLIENT component, so
 * anything it imports is bundled for the browser. `lib/data/scope.ts` is
 * `server-only` and pulls in the database client — taking a scope here would
 * either break the build or, worse, ship the data layer to the browser. It also
 * keeps the module PURE, so `nastaveni-nav.test.ts` can assert the matrix
 * without minting a branded handle it deliberately cannot construct.
 */
export type NastaveniViewer = {
  readonly role: BetaOrgRole
  /** `isEmployeeSeat(scope)`, resolved by the caller (spec §2.6.1). */
  readonly employeeSeat: boolean
}

export function nastaveniNavFor(
  viewer: NastaveniViewer,
): readonly NastaveniNavItem[] {
  const manages = managesPeople({ kind: "organization", role: viewer.role })
  return NASTAVENI_NAV.filter(
    (item) =>
      (!item.peopleManagement || manages) &&
      (!item.company || !viewer.employeeSeat),
  )
}

/**
 * The section's own landing target.
 *
 * `/[orgSlug]/nastaveni` itself renders nothing — it redirects here — so the
 * segment lives in one place instead of being spelled out by the page, the
 * account menu and the redirect separately.
 */
export const NASTAVENI_DEFAULT_SLUG = "spolecnost"

/**
 * Where the employee seat lands instead: their own account (PR 33).
 *
 * MODULE-PRIVATE. `nastaveniDefaultSlug` is the only thing that ever needs it,
 * and an exported constant nobody imports is a second way to spell a decision —
 * a caller could reach for the slug and skip the function that decides WHEN it
 * applies. (knip enforces this: an unused export fails the build.)
 */
const NASTAVENI_SEAT_DEFAULT_SLUG = "ucet"

/**
 * The landing target for THIS viewer.
 *
 * THE SEAT KEEPS NASTAVENÍ, and that is a deliberate, narrow departure from
 * §2.6.1's "Everything else 404". Účet is the page where an account changes its
 * own password and enrols a second factor; an account with no way to reach it is
 * an account its holder cannot secure, and it contains no company data at all —
 * it is about the viewer. Společnost, which IS company data, is filtered out of
 * the tab row above and refused by its own page. Lidé already 404s for any guest
 * through `peopleForScope`.
 */
export function nastaveniDefaultSlug(viewer: NastaveniViewer): string {
  return viewer.employeeSeat
    ? NASTAVENI_SEAT_DEFAULT_SLUG
    : NASTAVENI_DEFAULT_SLUG
}

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
