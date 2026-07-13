"use client"

import { usePathname } from "next/navigation"
import {
  AppSidebar,
  type SidebarFooterLink,
  type SidebarNavEntry,
} from "@workspace/ui/blocks/sidebar-panel"

/**
 * Workspace-surface sidebar body — feeds the AppSidebar block the active
 * module's nav tree + footer and the live pathname for active state. The
 * workspace-tier counterpart to `OrgSidebar`.
 *
 * Reminders + the insight card are ON-CALL (omitted until a real source pushes
 * them). Footer is Settings only — there is no `/workspace/help` route, so
 * (unlike the org sidebar) no Help link is emitted; adding a dead link would
 * 404 on click.
 */
export function WorkspaceSidebar({ nav }: { nav: SidebarNavEntry[] }) {
  const pathname = usePathname()

  const footer: SidebarFooterLink[] = [
    {
      icon: "Settings",
      label: "Workspace settings",
      href: "/workspace/settings",
    },
  ]

  return (
    <AppSidebar currentPath={pathname ?? undefined} nav={nav} footer={footer} />
  )
}
