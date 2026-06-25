import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

/** Directory module sidebar nav. `base` = `/${orgSlug}/directory`. */
export function directoryNav(base: string): SidebarNavEntry[] {
  return [{ label: "Overview", href: base, icon: "BookUser" }]
}
