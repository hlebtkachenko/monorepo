/**
 * The sections of Pro účetní (spec §3: "Zpracování · Měsíční uzávěrka ·
 * Zadávání dat · Úkoly klientovi").
 *
 * ALL FOUR ARE HERE, because all four now exist: Zpracování landed with PR 14,
 * Zadávání dat with PR 18, Úkoly klientovi with PR 19 and Měsíční uzávěrka with
 * PR 26 — each entry added in the PR that added its route, the same "an entry
 * is added only together with its route" rule `app/_nav/beta-nav.ts` states for
 * the rail. Nothing here is a stub.
 *
 * THE ORDER IS SPEC §3'S ("Zpracování · Měsíční uzávěrka · Zadávání dat ·
 * Úkoly klientovi"), not the order the routes were built in — the sidebar is
 * the office's month, and the month runs documents, then close, then the
 * manual residue.
 *
 * A FUNCTION OF `orgSlug` for the same reason the rail is: every route lives
 * under `/[orgSlug]/pro-ucetni/...`, and the hrefs are absolute so the active
 * match is a plain prefix test rather than a relative-path calculation.
 *
 * Labels are i18n KEYS, never literals, matching both the rail's contract and
 * `admin/_nav/admin-nav.ts`'s.
 */
import type { BetaMessageKey } from "@/i18n/messages"

export type ProUcetniNavItem = {
  readonly labelKey: BetaMessageKey
  readonly href: string
}

export function proUcetniNav(orgSlug: string): readonly ProUcetniNavItem[] {
  return [
    {
      labelKey: "ucetni.queueTitle",
      href: `/${orgSlug}/pro-ucetni/zpracovani`,
    },
    {
      labelKey: "uzaverka.title",
      href: `/${orgSlug}/pro-ucetni/uzaverka`,
    },
    {
      labelKey: "zadavani.title",
      href: `/${orgSlug}/pro-ucetni/zadavani`,
    },
    {
      labelKey: "ukoly.title",
      href: `/${orgSlug}/pro-ucetni/ukoly`,
    },
  ]
}

/**
 * The section's first leaf — where `/[orgSlug]/pro-ucetni` sends a visitor and
 * what the rail entry ultimately resolves to.
 *
 * Read off the list rather than written twice, so adding an entry above cannot
 * leave the redirect pointing at a route that has since moved.
 */
export function proUcetniLandingHref(orgSlug: string): string {
  return proUcetniNav(orgSlug)[0]!.href
}

/** Which entry a path belongs to. Exact match or a child of it. */
export function isActiveProUcetniNav(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}
