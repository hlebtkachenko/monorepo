"use client"

import { usePathname } from "next/navigation"
import {
  AppSidebar,
  type SidebarFooterLink,
  type SidebarNavEntry,
} from "@workspace/ui/blocks/sidebar-panel"

/**
 * Org-surface sidebar body — feeds the AppSidebar block the module nav + footer
 * and the live pathname for active state.
 *
 * Reminders and the insight card are ON-CALL: the sidebar never invents them.
 * They render only when a real source pushes them in (server / page data).
 * Until that source is wired, both are omitted and the sections self-hide — no
 * load-then-hide flicker. Pass `reminders` / `insight` (+ `remindersStorageKey`)
 * to `AppSidebar` here once there is real data.
 */
export function OrgSidebar({
  orgSlug,
  nav,
}: {
  orgSlug: string
  nav: SidebarNavEntry[]
}) {
  const pathname = usePathname()
  const base = `/${orgSlug}`

  const footer: SidebarFooterLink[] = [
    { icon: "Settings", label: "Module settings", href: `${base}/settings` },
    { icon: "CircleHelp", label: "Help", href: `${base}/help` },
  ]

  return (
    <AppSidebar currentPath={pathname ?? undefined} nav={nav} footer={footer} />
  )
}
