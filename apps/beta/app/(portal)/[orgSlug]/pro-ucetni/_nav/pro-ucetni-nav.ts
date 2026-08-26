/**
 * The sections of Pro účetní (spec §3: "Zpracování · Měsíční uzávěrka ·
 * Zadávání dat · Úkoly klientovi").
 *
 * TWO OF THE FOUR ARE HERE, because two of the four exist. Zpracování landed
 * with PR 14 and Zadávání dat with PR 18; Měsíční uzávěrka (PR 25) and Úkoly
 * klientovi (PR 19) add their own entry in the PR that adds their route — the
 * same "an entry is added only together with its route" rule `app/_nav/
 * beta-nav.ts` states for the rail. Nothing here is a stub.
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
      labelKey: "zadavani.title",
      href: `/${orgSlug}/pro-ucetni/zadavani`,
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
