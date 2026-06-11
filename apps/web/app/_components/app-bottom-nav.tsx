"use client"

import { usePathname } from "next/navigation"
import { AppShellBottomNav } from "@workspace/ui/blocks/app-shell"
import type { BottomNavItem } from "@workspace/ui/blocks/app-shell"

/**
 * Thin client wrapper that feeds the current pathname into
 * AppShellBottomNav so it can compute longest-prefix active state.
 * Same idiom as AppRailNav — `next/navigation` stays in the app layer.
 */
export function AppBottomNav({ items }: { items: BottomNavItem[] }) {
  const pathname = usePathname()
  return <AppShellBottomNav items={items} currentPath={pathname ?? undefined} />
}
