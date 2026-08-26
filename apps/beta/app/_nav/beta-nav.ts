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
 */
type BetaNavLabelKey = "prehled"

export type BetaRailItem = Omit<RailMenuItem, "label"> & {
  labelKey: BetaNavLabelKey
}

export const betaRailNav: BetaRailItem[] = [
  // The structure spec names LayoutDashboard for Přehled; `IconName` is a
  // closed union and does not carry it yet, so the root uses Home until the
  // real Přehled module lands and extends the icon packs (all packs, parity).
  { labelKey: "prehled", icon: "Home", href: "/" },
]
