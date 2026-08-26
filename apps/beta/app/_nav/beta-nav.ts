import type { RailMenuItem } from "@workspace/ui/blocks/app-rail"

/**
 * Rail nav for the beta portal.
 *
 * Deliberately MINIMAL: exactly the modules whose routes exist today. The
 * nine-module rail from the structure spec lands one module per PR, and an
 * entry is added here only together with its route — the rail never carries a
 * dead link or a "coming soon" stub.
 *
 * Labels are data-defined as i18n KEYS (`nav.*` in `messages/cs.json`), never
 * literal strings; `beta-shell.tsx` resolves them before handing the entries to
 * the `@workspace/ui` rail (which expects already-resolved `label` strings).
 *
 * A FUNCTION OF `orgSlug`, not a static list (PR 09): every route below `/`
 * now lives under `/[orgSlug]/...` (the org layout is the only place the rail
 * mounts — there is no rail on the pre-org root picker, which has no
 * organization to link into). Hrefs are built here rather than left relative
 * so `AppRail`'s longest-prefix active-match keeps working unchanged.
 *
 * `isOwner` (PR 14): "Pro účetní" is spec §5's owner-only rail SECTION — every
 * other role must not even see the entry, not just be refused the route
 * behind it (`requireOwner` answers 404 there regardless; the rail hiding it
 * is the honest reflection of that, not the enforcement of it). It is the
 * one entry gated on the caller's OWN role rather than on which routes exist,
 * which is why it takes a parameter instead of joining the static list above.
 */
type BetaNavLabelKey = "prehled" | "dokumenty" | "dane" | "finance" | "ucetni"

export type BetaRailItem =
  (Omit<RailMenuItem, "label"> & { labelKey: BetaNavLabelKey }) | "separator"

export function betaRailNav(
  orgSlug: string,
  options: { isOwner?: boolean } = {},
): BetaRailItem[] {
  const items: BetaRailItem[] = [
    // The structure spec names LayoutDashboard for Přehled; `IconName` is a
    // closed union and does not carry it yet, so the root uses Home until the
    // real Přehled module lands and extends the icon packs (all packs, parity).
    { labelKey: "prehled", icon: "Home", href: `/${orgSlug}` },
    // Spec §1 names FileText, and every icon pack carries it — no substitute
    // and no pack asymmetry, unlike LayoutDashboard above.
    { labelKey: "dokumenty", icon: "FileText", href: `/${orgSlug}/dokumenty` },
    // The structure spec names Landmark for Daně a podání (§1); same gap as
    // above — Banknote is the closest already-registered icon, used
    // unconditionally rather than only visible to a DPH gate that lives one
    // level down (spec §2.3: the four-family sidebar, not this rail entry).
    { labelKey: "dane", icon: "Banknote", href: `/${orgSlug}/dane` },
    // Finance (spec §2.4). The spec names Wallet; `IconName` does not carry it
    // either, and Banknote is taken by Daně one line up, so CreditCard until
    // the icon packs gain a Wallet (all packs, parity). The href is the MODULE
    // root rather than its one built leaf, so `AppRail`'s longest-prefix match
    // keeps the entry active across every Finance page as the other four
    // sidebar leaves land (PRs 26-28); `finance/page.tsx` redirects to Dluhy a
    // platby, so it is a live route, not a landing stub.
    { labelKey: "finance", icon: "CreditCard", href: `/${orgSlug}/finance` },
  ]

  if (options.isOwner) {
    // Two of spec §3's four sidebar items exist (Zpracování, PR 14; Zadávání
    // dat, PR 18), so the entry points at the SECTION and `pro-ucetni/page.tsx`
    // sends the visitor to the first one — the same "no dead link" rule the
    // module comment above states for the rail as a whole, now that there is
    // more than one leaf for a bare section link to be ambiguous about.
    items.push("separator")
    items.push({
      labelKey: "ucetni",
      icon: "Briefcase",
      href: `/${orgSlug}/pro-ucetni`,
    })
  }

  return items
}
