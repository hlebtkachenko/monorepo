import * as React from "react"
import type { Column, Table } from "@tanstack/react-table"

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

/**
 * Vertical separator for a cell. Three weights, weakest to strongest:
 *   - inner dividers → the faint `/60` hairline (same as the row borders)
 *   - a high-level GROUP boundary (`groupEdge`) → a full-strength single
 *     `border-border-subtle`, so the pivot's high-level groups read as clearly
 *     separated and that line cascades straight down the body — a NORMAL border,
 *     not a double one
 *   - the PIN SEAM — the last left-pinned column's right edge / the first
 *     right-pinned column's left edge, where the frozen group meets the scrolling
 *     area — a deliberate 2px full-weight divider, identical to the summary
 *     (Total) row's top seam so both frozen boundaries read the same.
 */
export function borderClass<TData>(
  column: Column<TData>,
  groupEdge = false,
): string {
  const pinned = column.getIsPinned()
  if (pinned === "left")
    return column.getIsLastColumn("left")
      ? "border-e-2 border-border-subtle"
      : "border-e border-border-subtle/60"
  if (pinned === "right")
    return column.getIsFirstColumn("right")
      ? "border-s-2 border-border-subtle"
      : "border-s border-border-subtle/60"
  if (groupEdge) return "border-e border-border-subtle"
  return "border-e border-border-subtle/60"
}

/**
 * The leaf-column ids AND group-header ids that sit on the right edge of a
 * high-level pivot group (with another group after them) — used to draw the
 * full-strength group separator via {@link borderClass}. A flat table (no column
 * groups) yields an empty set. Value leaves are the leaves under a group; each
 * group's LAST leaf, and the group header cell itself, are edges — except the
 * last group, whose right edge is the table's own edge.
 */
export function groupEdgeIds<TData>(table: Table<TData>): Set<string> {
  const edges = new Set<string>()
  const blocks: { rootId: string; lastLeafId: string }[] = []
  const byRoot = new Map<string, number>()
  for (const leaf of table.getVisibleLeafColumns()) {
    if (!leaf.parent) continue
    let root = leaf
    while (root.parent) root = root.parent
    const at = byRoot.get(root.id)
    if (at === undefined) {
      byRoot.set(root.id, blocks.length)
      blocks.push({ rootId: root.id, lastLeafId: leaf.id })
    } else {
      blocks[at]!.lastLeafId = leaf.id
    }
  }
  // Every block but the LAST contributes a separator (its group header + last leaf).
  for (let i = 0; i < blocks.length - 1; i++) {
    edges.add(blocks[i]!.rootId)
    edges.add(blocks[i]!.lastLeafId)
  }
  return edges
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
