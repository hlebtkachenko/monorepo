import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

/** Records (Documents) module sidebar nav. `base` = `/${orgSlug}/documents`. */
export function documentsNav(base: string): SidebarNavEntry[] {
  return [{ label: "Overview", href: base, icon: "FolderBookmark" }]
}
