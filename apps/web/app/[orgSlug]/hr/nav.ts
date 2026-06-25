import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

/** HR module sidebar nav. `base` = `/${orgSlug}/hr`. */
export function hrNav(base: string): SidebarNavEntry[] {
  return [{ label: "HR", href: base, icon: "Users" }]
}
