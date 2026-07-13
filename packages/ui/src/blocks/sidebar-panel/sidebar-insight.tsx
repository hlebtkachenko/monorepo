import * as React from "react"

export interface SidebarInsightProps {
  /**
   * Fully dynamic content — drop in an Insight template (`InsightMedia`,
   * `InsightChecklist`, `InsightProgress`) or any custom card. Each template
   * carries its own card chrome, so this section is just the pinned slot.
   */
  children?: React.ReactNode
}

/**
 * Section 4 — the Insight slot. Pins dynamic content directly above the footer
 * (not joined to the nav) and renders nothing when there's nothing to show.
 * Multiple templates may be stacked; they space themselves with `gap-2`.
 */
export function SidebarInsight({ children }: SidebarInsightProps) {
  if (!children) return null
  return (
    <div data-slot="sidebar-insight" className="flex shrink-0 flex-col gap-2">
      {children}
    </div>
  )
}
