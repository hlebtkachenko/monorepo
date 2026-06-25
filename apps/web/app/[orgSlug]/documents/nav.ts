import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

/** Records (Documents) module sidebar nav. `base` = `/${orgSlug}/documents`. */
export function documentsNav(base: string): SidebarNavEntry[] {
  return [
    { label: "Overview", href: base, icon: "FolderBookmark" },
    {
      label: "Invoices received",
      href: `${base}/invoices-received`,
      icon: "Download",
    },
    {
      label: "Invoices issued",
      href: `${base}/invoices-issued`,
      icon: "Upload",
    },
  ]
}
