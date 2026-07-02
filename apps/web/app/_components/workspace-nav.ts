import type { RailMenuEntry } from "@workspace/ui/blocks/app-rail"
import type { BottomNavItem } from "@workspace/ui/blocks/app-shell"
import type {
  SidebarNavEntry,
  SidebarNavPage,
} from "@workspace/ui/blocks/app-sidebar"
import { longestPrefixMatch } from "@workspace/ui/lib/active-path"

/**
 * Workspace-surface nav, single source — the accountant-office counterpart to
 * `[orgSlug]/_nav/org-nav.ts`. There is no slug: the workspace tier is the firm
 * itself, so every href is a static `/workspace/...` path (base = `/workspace`).
 *
 * The RAIL lists the office modules; each module's SIDEBAR tree lives in
 * `WORKSPACE_MODULE_NAV`. The shell resolves the active module from the rail's
 * `activeRailEntry` and looks the key up here — one active-module source that
 * can't drift from the rail highlight. Sidebar leaves point ONLY at routes that
 * exist (no dead links; `scripts/check-nav.ts` does not walk this tree, so
 * correctness is by construction, not by guard).
 */

const BASE = "/workspace"

/** Rail menu — the office modules. Order, icons, separators are presentation. */
export function workspaceRailNav(): RailMenuEntry[] {
  return [
    { label: "Home", icon: "Home", href: BASE },
    "separator",
    { label: "Clients", icon: "BookUser", href: `${BASE}/clients` },
    { label: "Deadlines", icon: "CalendarClock", href: `${BASE}/deadlines` },
    { label: "Agents", icon: "Sparkles", href: `${BASE}/agents` },
    "separator",
    { label: "Team", icon: "Users", href: `${BASE}/team` },
    { label: "Inbox", icon: "Inbox", href: `${BASE}/inbox` },
    "separator",
    { label: "Billing", icon: "CreditCard", href: `${BASE}/billing` },
    { label: "Settings", icon: "Settings", href: `${BASE}/settings` },
  ]
}

/** Mobile bottom-bar subset — 5 items, not the full rail. */
export function workspaceBottomNav(): BottomNavItem[] {
  return [
    { label: "Home", icon: "Home", href: BASE },
    { label: "Clients", icon: "BookUser", href: `${BASE}/clients` },
    { label: "Deadlines", icon: "CalendarClock", href: `${BASE}/deadlines` },
    { label: "Inbox", icon: "Inbox", href: `${BASE}/inbox` },
    { label: "Settings", icon: "Settings", href: `${BASE}/settings` },
  ]
}

// The Home module has no folder (it is the `/workspace` index), so its tree
// lives here under the `""` key — mirrors org-nav's `companyNav`. Every module
// key below equals the first path segment after `/workspace`.
function homeNav(): SidebarNavEntry[] {
  return [
    { label: "Overview", href: BASE, icon: "Home" },
    // The account/profile page has no rail module of its own (it's reached from
    // the header account menu). Like the org tier — where the personal pages
    // live in the index module's `companyNav` — it belongs to the Home module,
    // so the rail keeps Home active and the sidebar shows it while you're on it.
    { label: "Your profile", href: `${BASE}/profile`, icon: "User" },
  ]
}

function clientsNav(): SidebarNavEntry[] {
  return [{ label: "All clients", href: `${BASE}/clients`, icon: "BookUser" }]
}

function deadlinesNav(): SidebarNavEntry[] {
  return [
    {
      label: "All deadlines",
      href: `${BASE}/deadlines`,
      icon: "CalendarClock",
    },
  ]
}

function agentsNav(): SidebarNavEntry[] {
  return [{ label: "Overview", href: `${BASE}/agents`, icon: "Sparkles" }]
}

function teamNav(): SidebarNavEntry[] {
  return [{ label: "Members", href: `${BASE}/team`, icon: "Users" }]
}

function inboxNav(): SidebarNavEntry[] {
  return [{ label: "All messages", href: `${BASE}/inbox`, icon: "Inbox" }]
}

function billingNav(): SidebarNavEntry[] {
  return [{ label: "Overview", href: `${BASE}/billing`, icon: "CreditCard" }]
}

function settingsNav(): SidebarNavEntry[] {
  return [{ label: "General", href: `${BASE}/settings`, icon: "Settings" }]
}

/**
 * module key (first path segment after `/workspace`, "" for the Home index) →
 * its sidebar tree. The shell resolves the active module via the rail's
 * `activeRailEntry` and looks the key up here.
 */
export const WORKSPACE_MODULE_NAV: Record<string, () => SidebarNavEntry[]> = {
  "": homeNav,
  clients: clientsNav,
  deadlines: deadlinesNav,
  agents: agentsNav,
  team: teamNav,
  inbox: inboxNav,
  billing: billingNav,
  settings: settingsNav,
}

/** First path segment of a workspace href after `/workspace` ("" for Home). */
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
