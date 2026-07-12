import type { RailMenuEntry } from "@workspace/ui/blocks/app-rail"
import type { BottomNavItem } from "@workspace/ui/blocks/app-shell"
import type { SidebarNavPage } from "@workspace/ui/blocks/sidebar-panel"
import type { IconName } from "@workspace/ui/icon-packs"
import { longestPrefixMatch } from "@workspace/ui/lib/active-path"

import { canAccessSection } from "@/lib/capabilities"
import type { StaffRole } from "@/lib/staff-role"

/**
 * Admin-surface navigation, single source.
 *
 * The admin IA is five operator-intent modules. Each becomes one RAIL entry;
 * its pages fill the SIDEBAR when the module is active.
 *
 * Admin modules are NOT path-prefix coherent (e.g. Customers owns both `/orgs`
 * and `/compliance/audit`; Ops owns `/ops/*` plus `/ops/debug`), so the active
 * module can't be derived from a rail-href prefix. `activeAdminModule` resolves
 * it by which module OWNS the longest-prefix page for the current path; the
 * shell feeds the rail that module's href so its highlight matches exactly.
 *
 * Icons are registered `IconName` strings (resolved through the active icon
 * pack), not lucide components — repeats across pages are fine. New pages add
 * here AND in `SECTION_ACCESS` (if non-default access): the layout gate and the
 * sidebar entry travel together.
 */

export interface AdminModule {
  /** Stable id, used only to resolve the active module → rail href. */
  id: string
  /** Rail + sidebar-header label. */
  label: string
  /** Rail icon (registered IconName). */
  icon: IconName
  /** Flat page list shown in the sidebar while this module is active. */
  pages: SidebarNavPage[]
}

export const ADMIN_MODULES: AdminModule[] = [
  {
    id: "now",
    label: "Now",
    icon: "Activity",
    pages: [
      { label: "Home", href: "/", icon: "Home" },
      { label: "My profile", href: "/profile", icon: "User" },
    ],
  },
  {
    id: "customers",
    label: "Customers",
    icon: "Building2",
    pages: [
      { label: "Organizations", href: "/orgs", icon: "Building2" },
      { label: "Workspaces", href: "/workspaces", icon: "Box" },
      { label: "Users", href: "/users", icon: "Users" },
      {
        label: "Impersonation",
        href: "/compliance/impersonation",
        icon: "KeyRound",
      },
      { label: "Audit log", href: "/compliance/audit", icon: "FileText" },
      { label: "Invites & tokens", href: "/invites", icon: "Send" },
    ],
  },
  {
    id: "ops",
    label: "Ops",
    icon: "Shield",
    pages: [
      {
        label: "Critical systems",
        href: "/ops/critical-systems",
        icon: "Shield",
      },
      { label: "Health", href: "/ops/health", icon: "Activity" },
      { label: "Kill switches", href: "/ops/kill-switches", icon: "XCircle" },
      {
        label: "Maintenance",
        href: "/ops/maintenance",
        icon: "AlertTriangle",
      },
      { label: "SQL editor", href: "/ops/sql", icon: "Terminal" },
      { label: "Debug", href: "/ops/debug", icon: "Bug" },
    ],
  },
  {
    id: "platform",
    label: "Platform",
    icon: "Globe",
    pages: [
      { label: "Domains", href: "/platform/domains", icon: "Globe" },
      { label: "TLS certificates", href: "/platform/tls", icon: "Lock" },
      {
        label: "Email deliverability",
        href: "/platform/email-deliverability",
        icon: "Mail",
      },
      { label: "API keys", href: "/platform/api-keys", icon: "KeyRound" },
      { label: "Showcase", href: "/showcase", icon: "Shapes" },
      { label: "Storybook", href: "/storybook", icon: "Box" },
      { label: "Typography", href: "/typography", icon: "BaselineIcon" },
      { label: "Changelog", href: "/changelog", icon: "History" },
    ],
  },
  {
    id: "staff",
    label: "Staff",
    icon: "Code2",
    pages: [
      { label: "Members", href: "/staff/members", icon: "Users" },
      { label: "Roles", href: "/staff/roles", icon: "IdCard" },
    ],
  },
]

/** A module's rail/landing href — its first page (post role-filter). */
function moduleHref(module: AdminModule): string {
  return module.pages[0]?.href ?? "/"
}

/**
 * Hide pages the role can't reach, then drop modules left with no pages.
 * UX only — the server section gate ALSO enforces access, so a DOM edit that
 * forces a hidden page still hits `<AccessDenied />`.
 */
export function filterAdminModules(
  modules: AdminModule[],
  role: StaffRole,
): AdminModule[] {
  return modules
    .map((mod) => ({
      ...mod,
      pages: mod.pages.filter((page) => canAccessSection(role, page.href)),
    }))
    .filter((mod) => mod.pages.length > 0)
}

/** Rail entries (the modules), with a separator before the tooling tier. */
export function adminRailNav(modules: AdminModule[]): RailMenuEntry[] {
  const TOOLING_TIER = new Set(["platform", "staff"])
  const entries: RailMenuEntry[] = []
  let separated = false
  for (const mod of modules) {
    if (!separated && TOOLING_TIER.has(mod.id)) {
      entries.push("separator")
      separated = true
    }
    entries.push({
      label: mod.label,
      icon: mod.icon,
      href: moduleHref(mod),
    })
  }
  return entries
}

/** Mobile bottom-bar subset — all five modules, in rail order. */
const BOTTOM_NAV_IDS = ["now", "customers", "ops", "platform", "staff"]
export function adminBottomNav(modules: AdminModule[]): BottomNavItem[] {
  return modules
    .filter((mod) => BOTTOM_NAV_IDS.includes(mod.id))
    .map((mod) => ({
      label: mod.label,
      icon: mod.icon,
      href: moduleHref(mod),
    }))
}

/**
 * Active module for a path: the module owning the longest-prefix page. Falls
 * back to the first module so the sidebar is never empty. The shell passes the
 * returned module's href to the rail so the rail highlight matches.
 */
export function activeAdminModule(
  modules: AdminModule[],
  pathname: string | undefined,
): AdminModule | undefined {
  if (modules.length === 0) return undefined
  const leaves = modules.flatMap((mod) =>
    mod.pages.map((page) => ({ href: page.href, id: mod.id })),
  )
  const best = longestPrefixMatch(
    leaves.map((leaf) => leaf.href),
    pathname,
  )
  const owner = leaves.find((leaf) => leaf.href === best)
  return modules.find((mod) => mod.id === owner?.id) ?? modules[0]
}

/** Title for the content-panel header: the active page label (longest-prefix). */
export function activeAdminPageTitle(
  mod: AdminModule,
  pathname: string | undefined,
): string | undefined {
  const best = longestPrefixMatch(
    mod.pages.map((page) => page.href),
    pathname,
  )
  return mod.pages.find((page) => page.href === best)?.label
}

export { moduleHref as adminModuleHref }
