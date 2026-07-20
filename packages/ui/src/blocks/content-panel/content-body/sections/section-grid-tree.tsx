"use client"

import type { Row } from "@tanstack/react-table"

import { ChevronRight } from "@workspace/ui/lib/icons"
import { cn } from "@workspace/ui/lib/utils"

/**
 * section-grid-tree — the SHARED tree-row label cell for a hierarchical grid
 * section. It renders the expand/collapse toggle (only when the row has
 * children), the depth indentation, and the row label. Generic over any row
 * type `T` (the caller supplies the resolved `label`), so a Tree-table section
 * uses it exactly as the Pivot section uses its own label cell — the SAME
 * chevron/indent affordance, one source. The grid cell itself is the
 * `role="gridcell"`, so a real `<button>` here is safe (no button-in-button).
 */
export function TreeLabelCell<T>({
  row,
  label,
  emphasis = false,
}: {
  row: Row<T>
  /** The already-resolved display label for this row (its identity value). */
  label: string
  /** Render the label bold — used for structural tier nodes (e.g. Class/Group). */
  emphasis?: boolean
}) {
  const canExpand = row.getCanExpand()
  const expanded = row.getIsExpanded()
  return (
    <div
      className="flex w-full items-center gap-1"
      style={{ paddingLeft: row.depth * 16 }}
    >
      {canExpand ? (
        <button
          type="button"
          onClick={row.getToggleExpandedHandler()}
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${label}`}
          className="flex size-4 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <ChevronRight
            className={cn(
              "size-3.5 transition-transform",
              expanded && "rotate-90",
            )}
          />
        </button>
      ) : (
        <span className="size-4 shrink-0" aria-hidden />
      )}
      <span className={cn("truncate", emphasis && "font-medium")}>{label}</span>
    </div>
  )
}
