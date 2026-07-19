import type { RailMenuEntry } from "@workspace/ui/blocks/app-rail"
import type { BottomNavItem } from "@workspace/ui/blocks/app-shell"
import type { SidebarNavEntry } from "@workspace/ui/blocks/sidebar-panel"

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

// The org index ("Company") has no module folder, so its tree lives here; the
// routes (inbox/tasks/profile/people/services/onboarding) are folders directly
// under `[orgSlug]/`. Every actual module folder owns a co-located
// `<module>/nav.ts`. `base` = `/${orgSlug}`. `tba: true` = not-yet-built.
function companyNav(base: string): SidebarNavEntry[] {
  return [
    { label: "Overview", href: base, icon: "Goal", tba: true },
    // Inbox links to the workspace-tier queue; the local stub route redirects.
    { label: "Inbox", href: `${base}/inbox`, icon: "Inbox", tba: true },
    { label: "Tasks", href: `${base}/tasks`, icon: "ListTodo", tba: true },
    {
      label: "Profile",
      pages: [
        {
          label: "Company card",
          href: `${base}/profile`,
          icon: "Building2",
          tba: true,
        },
        {
          label: "People",
          href: `${base}/people`,
          icon: "Users",
          tba: true,
        },
      ],
    },
    {
      label: "Engagement",
      pages: [
        {
          label: "Services",
          href: `${base}/services`,
          icon: "Blocks",
          tba: true,
        },
        {
          label: "Onboarding",
          href: `${base}/onboarding`,
          icon: "GraduationCap",
          tba: true,
        },
      ],
    },
  ]
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

export { moduleKeyFromHref } from "@workspace/ui/lib/active-path"
