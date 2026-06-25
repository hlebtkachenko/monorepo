import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

/**
 * Accounting module sidebar nav — co-located with the routes. Add a page here
 * (next to its new route folder) and it appears in the sidebar; the nav-drift
 * guard fails if a folder and its nav entry get out of sync. `base` is
 * `/${orgSlug}/accounting`.
 */
export function accountingNav(base: string): SidebarNavEntry[] {
  return [{ label: "Accounting", href: base, icon: "Calculator" }]
}
