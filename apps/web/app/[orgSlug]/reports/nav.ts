import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

/** Reports module sidebar nav. `base` = `/${orgSlug}/reports`. */
export function reportsNav(base: string): SidebarNavEntry[] {
  return [{ label: "Overview", href: base, icon: "ChartNoAxesCombined" }]
}
