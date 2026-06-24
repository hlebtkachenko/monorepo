"use client"

import { usePathname } from "next/navigation"
import {
  activeRailEntry,
  type RailMenuEntry,
} from "@workspace/ui/blocks/app-rail"
import { Heading } from "@workspace/ui/components/heading"

/**
 * The active Module's name — the primary heading of the org surface, so a
 * semantic `<h2>`, rendered at the `"sidebar-xl"` size token from the
 * typography system. Takes the SAME rail entries the rail renders (built once
 * by the page) and reuses the rail's longest-prefix active match
 * (`activeRailEntry`), so the title can never drift from the highlighted item.
 */
export function SidebarModuleTitle({ items }: { items: RailMenuEntry[] }) {
  const pathname = usePathname()
  const active = activeRailEntry(items, pathname ?? undefined)
  return (
    <Heading level={2} size="sidebar-xl">
      {active?.label ?? ""}
    </Heading>
  )
}
