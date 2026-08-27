import type { RailMenuItem } from "@workspace/ui/blocks/app-rail"

import { EMPLOYEE_SEAT_HOME } from "@/lib/auth/first-login"

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
 *
 * `isManagement` (PR 31): Mzdy is the SECOND entry gated on the caller's own
 * role rather than on which routes exist, for the reason `mzdy/layout.tsx`
 * states in full — `payrollScope()` already answers `none` for an unlinked
 * guest, so the rail entry hiding for one is the honest reflection of that read,
 * not the enforcement of it (the 404 the layout answers is). `owner`/`admin`/
 * `member` are the management seats spec §5 names.
 *
 * `isEmployeeSeat` (PR 33): the seat REPLACES this whole list rather than
 * filtering it (spec §2.6.1: "renders a narrowed rail: Přehled (personal) ·
 * Dokumenty (own) · Moje mzda"). A replacement rather than a filter for the same
 * reason `MZDY_SEAT_NAV` is a separate list: the seat's Mzdy entry does not point
 * where the management one points, its Přehled is a different page's content,
 * and every module added to the nine-module rail from here on must be a
 * deliberate act to reach a seat rather than a default that has to be
 * remembered. `betaRailNav` returning early is the shape of "this viewer is not
 * a narrowed manager, they are a different kind of user".
 */
export type BetaNavLabelKey =
  | "prehled"
  | "dokumenty"
  | "dane"
  | "finance"
  | "vykazy"
  | "mzdy"
  | "mojeMzda"
  | "majetek"
  | "asistent"
  | "ucetni"

export type BetaRailItem =
  (Omit<RailMenuItem, "label"> & { labelKey: BetaNavLabelKey }) | "separator"

export function betaRailNav(
  orgSlug: string,
  options: {
    isOwner?: boolean
    showAssistant?: boolean
    isManagement?: boolean
    isEmployeeSeat?: boolean
  } = {},
): BetaRailItem[] {
  // FIRST, AND IT RETURNS. Spec §2.6.1's three entries, and no path below this
  // line can add a fourth — which is the property that matters: the rest of this
  // function grows a module per PR, and none of that growth reaches a seat.
  //
  // The three hrefs are all routes the seat can actually open (Přehled renders
  // its personal variant, Dokumenty is narrowed to their own uploads, Moje mzda
  // is theirs alone), so the rail carries no dead link — the module comment's
  // standing rule, which matters more here than anywhere else: every OTHER
  // module answers 404 for this viewer.
  if (options.isEmployeeSeat) {
    return [
      { labelKey: "prehled", icon: "Home", href: `/${orgSlug}` },
      {
        labelKey: "dokumenty",
        icon: "FileText",
        href: `/${orgSlug}/dokumenty`,
      },
      {
        labelKey: "mojeMzda",
        icon: "Users",
        href: `/${orgSlug}${EMPLOYEE_SEAT_HOME}`,
      },
    ]
  }

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
    // Výkazy (spec §2.5), between Finance and Mzdy exactly as §1's rail
    // orders them. The first entry whose spec-named icon EXISTS in `IconName`
    // — BarChart3 is in every pack already, so unlike Přehled / Daně /
    // Finance / Majetek above there is no substitute to explain here. The href
    // is the module root because Rozvaha IS the module root
    // (`vykazy/_nav/vykazy-nav.ts`), so `AppRail`'s longest-prefix match keeps
    // the entry active across all three statements with no redirect hop.
    { labelKey: "vykazy", icon: "BarChart3", href: `/${orgSlug}/vykazy` },
  ]

  if (options.isManagement) {
    // Mzdy (spec §2.6, PR 31), between Výkazy and Majetek exactly as §1's rail
    // orders the nine modules. `Users` is the spec-named icon and already
    // exists in `IconName`, unlike several entries above. The href is the
    // module root (`mzdy/_nav/mzdy-nav.ts`'s Přehled mezd), so `AppRail`'s
    // longest-prefix match keeps the entry active as Zaměstnanci and
    // Výplatnice land under it in the next payroll UI PR.
    items.push({ labelKey: "mzdy", icon: "Users", href: `/${orgSlug}/mzdy` })
  }

  // The structure spec names Package for Majetek. `Box` is the closest
  // existing `IconName` (present in all three packs already), so this entry
  // does not need an icon-pack-parity PR of its own.
  items.push({ labelKey: "majetek", icon: "Box", href: `/${orgSlug}/majetek` })

  // Asistent (spec §2.8, §1 rail position 8), and the first entry gated on
  // something other than the caller's role: `showAssistant` folds TWO facts the
  // server already resolved — `BETA_ASSISTANT_ENABLED` and the §5 visibility
  // rule (never guest, therefore never the employee seat) — into one boolean,
  // because this module is a pure function of its arguments and a client
  // component cannot read either fact for itself. MessageCircle is the icon
  // spec §1 names AND one that every icon pack already carries, so unlike
  // Přehled / Daně / Finance / Majetek above there is no substitute here.
  //
  // Hiding the entry is NOT the enforcement. `assertAssistantAvailable`
  // (`lib/data/assistant.ts`) answers 404 on the route, on every page and on
  // every write regardless of what the rail drew — the same relationship "Pro
  // účetní" has with `requireOwner` below.
  if (options.showAssistant) {
    items.push({
      labelKey: "asistent",
      icon: "MessageCircle",
      href: `/${orgSlug}/asistent`,
    })
  }

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
