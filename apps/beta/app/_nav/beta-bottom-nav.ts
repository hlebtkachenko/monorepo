import type { IconName } from "@workspace/ui/icon-packs"

import { betaRailNav, type BetaNavLabelKey } from "./beta-nav"

/**
 * Mobile bottom navigation — spec §1: "Mobile bottom nav is NOT derived from
 * the rail (pattern would produce an unusable 9-entry bar): explicit 5
 * entries — Přehled · Dokumenty · Nahrát (center FAB) · Daně · Více (sheet
 * with the rest)."
 *
 * "Not derived" means the FIXED SLOTS (which three modules get a primary tab,
 * where the FAB sits) are explicit, not a mechanical projection of the rail
 * (unlike `apps/web`'s `orgBottomNav`, which mirrors its rail one-for-one —
 * that pattern is exactly what this spec line rules out for beta's 9-module
 * rail). What every slot's CONTENT resolves to — which hrefs exist, which
 * optional modules (Mzdy/Asistent/Pro účetní) are visible to this viewer —
 * still comes from `betaRailNav`, the single source of truth for "what can
 * this role reach". Two derivations from one source can't drift the way two
 * hand-maintained lists could.
 *
 * `nahrat` and `vice` are label keys that exist ONLY here — no rail entry
 * carries them — hence the separate union rather than widening
 * `BetaNavLabelKey` itself.
 */
type BetaBottomNavLabelKey = BetaNavLabelKey | "nahrat" | "vice"

interface BetaBottomNavLink {
  labelKey: BetaBottomNavLabelKey
  icon: IconName
  href: string
}

export type BetaBottomNavSlot =
  | ({ kind: "tab" } & BetaBottomNavLink)
  | ({ kind: "fab" } & BetaBottomNavLink)
  | {
      kind: "more"
      labelKey: "vice"
      icon: IconName
      items: BetaBottomNavLink[]
    }

export interface BetaBottomNavOptions {
  isOwner?: boolean
  showAssistant?: boolean
  isManagement?: boolean
  isEmployeeSeat?: boolean
  /** Gates the Nahrát FAB — pass `canUploadDocuments(scope)` (spec §5). */
  canUpload?: boolean
}

/** Rail entries always carry `icon`/`href` (see `beta-nav.test.ts`); this
 * narrows the two optional `RailMenuItem` fields for a real entry rather than
 * asserting with `!`. */
function link(entry: {
  labelKey: BetaNavLabelKey
  icon?: IconName
  href?: string
}): BetaBottomNavLink {
  if (!entry.icon || !entry.href) {
    throw new Error(
      `beta-bottom-nav: rail entry "${entry.labelKey}" is missing icon/href`,
    )
  }
  return { labelKey: entry.labelKey, icon: entry.icon, href: entry.href }
}

const PRIMARY_TAB_KEYS = new Set<BetaNavLabelKey>([
  "prehled",
  "dokumenty",
  "dane",
])

export function betaBottomNav(
  orgSlug: string,
  options: BetaBottomNavOptions = {},
): BetaBottomNavSlot[] {
  // FIRST, same as `betaRailNav` — the seat's narrowed rail (spec §2.6.1: three
  // entries, "Přehled (personal) · Dokumenty (own) · Moje mzda") IS its bottom
  // nav, entry for entry. Reading it straight off `betaRailNav`'s own early
  // return (rather than re-deciding "is this a seat" here) is what makes the
  // mirror a structural guarantee instead of a fact two functions could drift
  // on — `beta-bottom-nav.test.ts` pins the mirror as a boundary test.
  if (options.isEmployeeSeat) {
    return betaRailNav(orgSlug, options)
      .filter((entry) => entry !== "separator")
      .map((entry) => ({ kind: "tab" as const, ...link(entry) }))
  }

  const rail = betaRailNav(orgSlug, options).filter(
    (entry) => entry !== "separator",
  )
  const find = (key: BetaNavLabelKey) => {
    const entry = rail.find((item) => item.labelKey === key)
    if (!entry) throw new Error(`beta-bottom-nav: rail is missing "${key}"`)
    return link(entry)
  }

  const slots: BetaBottomNavSlot[] = [
    { kind: "tab", ...find("prehled") },
    { kind: "tab", ...find("dokumenty") },
  ]

  if (options.canUpload) {
    // No dedicated upload route exists — the upload panel lives ON Dokumenty
    // (`dokumenty/page.tsx`), so the FAB points there rather than at a page
    // that doesn't do the thing (the rail's own "no dead link" rule, §1).
    slots.push({
      kind: "fab",
      labelKey: "nahrat",
      icon: "Upload",
      href: find("dokumenty").href,
    })
  }

  slots.push({ kind: "tab", ...find("dane") })

  const more = rail
    .filter((entry) => !PRIMARY_TAB_KEYS.has(entry.labelKey))
    .map(link)
  if (more.length > 0) {
    slots.push({
      kind: "more",
      labelKey: "vice",
      icon: "MoreHorizontal",
      items: more,
    })
  }

  return slots
}
