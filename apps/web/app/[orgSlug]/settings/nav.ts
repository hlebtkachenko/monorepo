import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

/** Settings module sidebar nav. `base` = `/${orgSlug}/settings`. */
export function settingsNav(base: string): SidebarNavEntry[] {
  return [{ label: "Overview", href: base, icon: "Settings" }]
}
