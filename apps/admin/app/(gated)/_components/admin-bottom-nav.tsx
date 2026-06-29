"use client"

import {
  AppShellBottomNav,
  type BottomNavItem,
} from "@workspace/ui/blocks/app-shell"

/**
 * Admin mobile bottom bar. Like the rail, its active highlight is driven by the
 * shell-resolved active module (`activeHref`); when the active module isn't in
 * the bottom subset nothing highlights, which is fine.
 */
export function AdminBottomNav({
  items,
  activeHref,
}: {
  items: BottomNavItem[]
  activeHref?: string
}) {
  return <AppShellBottomNav items={items} currentPath={activeHref} />
}
