import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

/** Finance module sidebar nav. `base` = `/${orgSlug}/finance`. */
export function financeNav(base: string): SidebarNavEntry[] {
  return [{ label: "Finance", href: base, icon: "ReceiptEuro" }]
}
