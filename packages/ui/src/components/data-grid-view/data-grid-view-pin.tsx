import * as React from "react"
import type { Column } from "@tanstack/react-table"

/** Whether the grid is scrolled away from each horizontal edge. */
export interface ScrollEdges {
  left: boolean
  right: boolean
}

/** Sticky positioning for a pinned column (the edge shadow is a separate span). */
export function pinStyle<TData>(column: Column<TData>): React.CSSProperties {
  const pinned = column.getIsPinned()
  if (!pinned) return {}
  return {
    position: "sticky",
    left: pinned === "left" ? `${column.getStart("left")}px` : undefined,
    right: pinned === "right" ? `${column.getAfter("right")}px` : undefined,
    zIndex: 2,
  }
}

/** Vertical separator for a cell — same hairline as the row borders. */
export function borderClass<TData>(column: Column<TData>): string {
  return column.getIsPinned() === "right"
    ? "border-s border-border-subtle/60"
    : "border-e border-border-subtle/60"
}

/**
 * The continuous edge shadow for a pinned column. Rendered as one `inset-y-0`
 * gradient span per cell — because the span has sharp top/bottom edges (no
 * blur), the per-cell spans stack into a single smooth strip down the whole
 * column, instead of a scalloped per-row box-shadow.
 *
 * Only shown when there is actually scrolled-under content on that side — a
 * pinned column sitting over empty space (a narrow table, e.g. with the
 * assistant open) draws no phantom shadow.
 */
export function PinShadow<TData>({
  column,
  edges,
}: {
  column: Column<TData>
  edges: ScrollEdges
}) {
  const pinned = column.getIsPinned()
  if (pinned === "left" && column.getIsLastColumn("left") && edges.left) {
    return (
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 -right-2.5 z-10 w-2.5 bg-gradient-to-r from-black/10 to-transparent dark:from-black/25"
      />
    )
  }
  if (pinned === "right" && column.getIsFirstColumn("right") && edges.right) {
    return (
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 -left-2.5 z-10 w-2.5 bg-gradient-to-l from-black/10 to-transparent dark:from-black/25"
      />
    )
  }
  return null
}
