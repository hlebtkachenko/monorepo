"use client"

import { usePathname } from "next/navigation"

import {
  AppSidebar,
  type SidebarNavPage,
} from "@workspace/ui/blocks/sidebar-panel"

/**
 * Admin sidebar body — the active module's pages, fed the live pathname for
 * active state. No reminders/insight/footer yet (each self-hides when empty);
 * wire them here once a real source pushes them in.
 */
export function AdminSidebarBody({ pages }: { pages: SidebarNavPage[] }) {
  const pathname = usePathname()
  return <AppSidebar currentPath={pathname ?? undefined} nav={pages} />
}
