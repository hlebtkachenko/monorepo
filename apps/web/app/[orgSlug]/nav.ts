import type { RailMenuEntry } from "@workspace/ui/blocks/app-rail"
import type { BottomNavItem } from "@workspace/ui/blocks/app-shell"

/**
 * Rail menu for the organization surface. Pure data — edit this list to
 * change the org nav. All look/behaviour lives in the AppRail block +
 * `--rail-*` tokens.
 */
export function orgRailNav(orgSlug: string): RailMenuEntry[] {
  return [
    { label: "Company", icon: "Goal", href: `/${orgSlug}` },
    "separator",
    { label: "Accounting", icon: "Calculator", href: `/${orgSlug}/accounting` },
    {
      label: "Records",
      icon: "FolderBookmark",
      href: `/${orgSlug}/documents`,
    },
    {
      label: "Finance",
      icon: "PiggyBank",
      href: `/${orgSlug}/finance`,
      iconSize: 24,
      iconStrokeWidth: 1.5,
    },
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

/**
 * Mobile bottom-bar subset of the org nav — a bottom bar holds 4-5
 * items, not the full rail. Subset choice pending product sign-off
 * (flagged in the PR); icons/hrefs mirror `orgRailNav`.
 */
export function orgBottomNav(orgSlug: string): BottomNavItem[] {
  return [
    { label: "Company", icon: "Goal", href: `/${orgSlug}` },
    { label: "Accounting", icon: "Calculator", href: `/${orgSlug}/accounting` },
    { label: "Records", icon: "FolderBookmark", href: `/${orgSlug}/documents` },
    { label: "Finance", icon: "PiggyBank", href: `/${orgSlug}/finance` },
    { label: "Settings", icon: "Settings", href: `/${orgSlug}/settings` },
  ]
}
