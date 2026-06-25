import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

/** Assets module sidebar nav. `base` = `/${orgSlug}/assets`. */
export function assetsNav(base: string): SidebarNavEntry[] {
  return [{ label: "Overview", href: base, icon: "BriefcaseBusiness" }]
}
