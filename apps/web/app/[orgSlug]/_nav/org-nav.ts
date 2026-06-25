import type { RailMenuEntry } from "@workspace/ui/blocks/app-rail"
import type { BottomNavItem } from "@workspace/ui/blocks/app-shell"
import type {
  SidebarNavEntry,
  SidebarNavPage,
} from "@workspace/ui/blocks/app-sidebar"
import { longestPrefixMatch } from "@workspace/ui/lib/active-path"

import { accountingNav } from "../accounting/nav"
import { assetsNav } from "../assets/nav"
import { closingNav } from "../closing/nav"
import { directoryNav } from "../directory/nav"
import { documentsNav } from "../documents/nav"
import { financeNav } from "../finance/nav"
import { hrNav } from "../hr/nav"
import { reportsNav } from "../reports/nav"
import { settingsNav } from "../settings/nav"

/**
 * Org-surface nav, single source. The RAIL (modules) + the manual extras (bottom
 * nav, pins, footer) are hand-authored here because they are small, stable, and
 * genuinely cross-module. The per-module SIDEBAR trees are co-located in each
 * `<module>/nav.ts` and registered in `MODULE_NAV` below — adding a page edits
 * the file next to its route folder. `scripts/check-nav.ts` guards both against
 * the route tree (no codegen — see the route-manifest decision in the session
 * notes / the lean design the Advisor ratified).
 */

/** Rail menu — the modules. Order, icons, and separators are presentation. */
export function orgRailNav(orgSlug: string): RailMenuEntry[] {
  return [
    { label: "Company", icon: "Goal", href: `/${orgSlug}` },
    "separator",
    { label: "Accounting", icon: "Calculator", href: `/${orgSlug}/accounting` },
    { label: "Records", icon: "FolderBookmark", href: `/${orgSlug}/documents` },
    { label: "Finance", icon: "ReceiptEuro", href: `/${orgSlug}/finance` },
    { label: "HR", icon: "Users", href: `/${orgSlug}/hr` },
    { label: "Assets", icon: "BriefcaseBusiness", href: `/${orgSlug}/assets` },
    { label: "Closing", icon: "CalendarClock", href: `/${orgSlug}/closing` },
    {
      label: "Reports",
      icon: "ChartNoAxesCombined",
      href: `/${orgSlug}/reports`,
    },
    "separator",
    { label: "Directory", icon: "BookUser", href: `/${orgSlug}/directory` },
    { label: "Settings", icon: "Settings", href: `/${orgSlug}/settings` },
  ]
}

/** Mobile bottom-bar subset — 4-5 items, not the full rail. */
export function orgBottomNav(orgSlug: string): BottomNavItem[] {
  return [
    { label: "Company", icon: "Goal", href: `/${orgSlug}` },
    { label: "Accounting", icon: "Calculator", href: `/${orgSlug}/accounting` },
    { label: "Records", icon: "FolderBookmark", href: `/${orgSlug}/documents` },
    { label: "Finance", icon: "ReceiptEuro", href: `/${orgSlug}/finance` },
    { label: "Settings", icon: "Settings", href: `/${orgSlug}/settings` },
  ]
}

// The org index ("Company") has no module folder, so its trivial tree lives
// here. Every actual module folder owns a co-located `<module>/nav.ts`.
function companyNav(base: string): SidebarNavEntry[] {
  return [{ label: "Overview", href: base, icon: "Goal" }]
}

/**
 * module key (first path segment after the org slug, "" for the index) → its
 * sidebar tree builder. The shell resolves the active module via the rail's
 * `activeRailEntry` and looks the key up here — one active-module source, never
 * drifting from the rail highlight.
 */
export const MODULE_NAV: Record<string, (base: string) => SidebarNavEntry[]> = {
  "": companyNav,
  accounting: accountingNav,
  documents: documentsNav,
  finance: financeNav,
  hr: hrNav,
  closing: closingNav,
  assets: assetsNav,
  reports: reportsNav,
  directory: directoryNav,
  settings: settingsNav,
}

/** First path segment of a rail href after the org slug ("" for the index). */
export function moduleKeyFromHref(
  href: string | undefined,
  orgSlug: string,
): string {
  if (!href) return ""
  const prefix = `/${orgSlug}`
  const rest = href.startsWith(prefix) ? href.slice(prefix.length) : href
  return rest.replace(/^\//, "").split("/")[0] ?? ""
}

/** Flatten a sidebar tree to its `{ href, label }` leaves (pages + subpages). */
function navLeaves(nav: SidebarNavEntry[]): { href: string; label: string }[] {
  const out: { href: string; label: string }[] = []
  for (const entry of nav) {
    const pages: SidebarNavPage[] = "href" in entry ? [entry] : entry.pages
    for (const page of pages) {
      out.push({ href: page.href, label: page.label })
      for (const sub of page.subpages ?? [])
        out.push({ href: sub.href, label: sub.label })
    }
  }
  return out
}

/** Title for the content-panel header: the active page's label (longest-prefix). */
export function activeNavTitle(
  nav: SidebarNavEntry[],
  pathname: string | undefined,
): string | undefined {
  const leaves = navLeaves(nav)
  const best = longestPrefixMatch(
    leaves.map((leaf) => leaf.href),
    pathname,
  )
  return leaves.find((leaf) => leaf.href === best)?.label
}
