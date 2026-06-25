"use client"

import { AppRail, type RailMenuEntry } from "@workspace/ui/blocks/app-rail"

/**
 * Admin rail. Active state is driven by the shell (which resolves the active
 * MODULE by page ownership, since admin modules aren't path-prefix coherent)
 * and passed in as `activeHref` — the rail's own longest-prefix match then
 * highlights exactly that module. Persists its expanded/icon-only mode under an
 * admin-scoped key so it doesn't share the org rail's preference.
 */
export function AdminRailNav({
  items,
  activeHref,
}: {
  items: RailMenuEntry[]
  activeHref?: string
}) {
  return (
    <AppRail
      items={items}
      currentPath={activeHref}
      storageKey="admin-rail-mode"
    />
  )
}
