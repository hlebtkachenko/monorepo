import type { RailMenuEntry } from "@workspace/ui/blocks/app-rail"
import type { BottomNavItem } from "@workspace/ui/blocks/app-shell"
import type {
  SidebarNavEntry,
  SidebarNavPage,
} from "@workspace/ui/blocks/app-sidebar"
import { longestPrefixMatch } from "@workspace/ui/lib/active-path"

/**
 * Workspace-surface nav, single source — the accountant-office hub. There is no
 * slug and no workspace switcher: a user operates one office, so every href is a
 * static `/workspace/...` path (base = `/workspace`). **Companies** is the index
 * (`/workspace`) — the hub of the companies (client books) the office keeps.
 *
 * The RAIL lists the office modules; each module's SIDEBAR tree lives in
 * `WORKSPACE_MODULE_NAV`. The shell resolves the active module from the rail's
 * `activeRailEntry` and looks the key up here. Sidebar leaves point ONLY at
 * routes that exist (no dead links).
 */

const BASE = "/workspace"

/** Rail menu — the office modules. Order, icons, separators are presentation. */
export function workspaceRailNav(): RailMenuEntry[] {
  return [
    { label: "Companies", icon: "Building2", href: BASE },
    {
      label: "Analyse",
      icon: "ChartNoAxesCombined",
      href: `${BASE}/analyse`,
    },
    { label: "Audit", icon: "Award", href: `${BASE}/audit` },
    "separator",
    { label: "Inbox", icon: "Inbox", href: `${BASE}/inbox` },
    { label: "Legislation", icon: "BookOpen", href: `${BASE}/legislation` },
    "separator",
    { label: "Billing", icon: "CreditCard", href: `${BASE}/billing` },
    { label: "Team", icon: "Users", href: `${BASE}/team` },
    { label: "Settings", icon: "Settings", href: `${BASE}/settings` },
  ]
}

/** Mobile bottom-bar subset — 5 items, not the full rail. */
export function workspaceBottomNav(): BottomNavItem[] {
  return [
    { label: "Companies", icon: "Building2", href: BASE },
    { label: "Analyse", icon: "ChartNoAxesCombined", href: `${BASE}/analyse` },
    { label: "Audit", icon: "Award", href: `${BASE}/audit` },
    { label: "Inbox", icon: "Inbox", href: `${BASE}/inbox` },
    { label: "Settings", icon: "Settings", href: `${BASE}/settings` },
  ]
}

// Companies is the index (`/workspace`), so its tree lives here under the `""`
// key — mirrors org-nav's index module. The personal profile page has no rail
// module of its own (reached from the header account menu); like the org tier it
// lives in the index module's sidebar, so the rail stays on Companies while
// you're on it. Every other module key equals the first path segment.
function companiesNav(): SidebarNavEntry[] {
  return [
    { label: "All companies", href: BASE, icon: "Building2" },
    { label: "Your profile", href: `${BASE}/profile`, icon: "User" },
  ]
}

function analyseNav(): SidebarNavEntry[] {
  return [
    { label: "Overview", href: `${BASE}/analyse`, icon: "ChartNoAxesCombined" },
  ]
}

function auditNav(): SidebarNavEntry[] {
  return [{ label: "Overview", href: `${BASE}/audit`, icon: "Award" }]
}

function inboxNav(): SidebarNavEntry[] {
  return [{ label: "All messages", href: `${BASE}/inbox`, icon: "Inbox" }]
}

function legislationNav(): SidebarNavEntry[] {
  return [
    { label: "All obligations", href: `${BASE}/legislation`, icon: "BookOpen" },
  ]
}

function billingNav(): SidebarNavEntry[] {
  return [{ label: "Overview", href: `${BASE}/billing`, icon: "CreditCard" }]
}

function teamNav(): SidebarNavEntry[] {
  return [{ label: "Members", href: `${BASE}/team`, icon: "Users" }]
}

function settingsNav(): SidebarNavEntry[] {
  return [{ label: "General", href: `${BASE}/settings`, icon: "Settings" }]
}

/**
 * module key (first path segment after `/workspace`, "" for the Companies
 * index) → its sidebar tree. The shell resolves the active module via the rail's
 * `activeRailEntry` and looks the key up here.
 */
export const WORKSPACE_MODULE_NAV: Record<string, () => SidebarNavEntry[]> = {
  "": companiesNav,
  analyse: analyseNav,
  audit: auditNav,
  inbox: inboxNav,
  legislation: legislationNav,
  billing: billingNav,
  team: teamNav,
  settings: settingsNav,
}

/** First path segment of a workspace href after `/workspace` ("" for Companies). */
export function moduleKeyFromWorkspaceHref(href: string | undefined): string {
  if (!href) return ""
  const rest = href.startsWith(BASE) ? href.slice(BASE.length) : href
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
export function activeWorkspaceNavTitle(
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
