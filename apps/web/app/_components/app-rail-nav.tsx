"use client"

import { usePathname } from "next/navigation"
import { AppRail } from "@workspace/ui/blocks/app-rail"
import type { RailMenuEntry } from "@workspace/ui/blocks/app-rail"

/**
 * Thin client wrapper that feeds the current pathname into AppRail so it
 * can compute longest-prefix active state. Keeps the `packages/ui` block
 * router-agnostic — `next/navigation` stays in the app layer.
 */
export function AppRailNav({ items }: { items: RailMenuEntry[] }) {
  const pathname = usePathname()
  return <AppRail items={items} currentPath={pathname ?? undefined} />
}
