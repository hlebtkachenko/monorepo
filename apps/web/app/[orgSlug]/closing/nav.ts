import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

/** Closing module sidebar nav. `base` = `/${orgSlug}/closing`. */
export function closingNav(base: string): SidebarNavEntry[] {
  return [{ label: "Overview", href: base, icon: "CalendarClock" }]
}
