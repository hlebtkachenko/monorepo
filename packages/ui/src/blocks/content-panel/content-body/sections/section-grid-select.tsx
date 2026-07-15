"use client"

import * as React from "react"
import type { ColumnDef, Row, Table } from "@tanstack/react-table"

import { cn } from "@workspace/ui/lib/utils"

import { GridCheckbox } from "./section-grid-cells"

/**
 * The current display order + an id→index map, kept in a ref so the memoized
 * select-cell closure always reads the FRESH order (sort/filter/expand change
 * it). Both the flat Table and the Pivot section maintain one and hand it to the
 * shared select column below.
 */
export type RowOrder<T> = {
  rows: Row<T>[]
  indexById: Map<string, number>
}

/**
 * The leading select-column cell — the SINGLE source shared by the flat Table
 * (`section-table-renderer`) and the Pivot (`section-pivot-table-renderer`), so
 * the select affordance looks + behaves identically in both. An idle row shows
 * its 1-based line number (sequential in the CURRENT view — filters/expansion
 * renumber 1..N); on row hover or when selected, the checkbox takes its place
 * (empty on hover, filled when selected). The number + checkbox are overlaid and
 * swapped purely by the row's `group`/`data-state` — no per-row hover state. The
 * column opts out of cell focus (`meta.focusable: false`), so clicking here never
 * gives the cell a focus ring; the checkbox itself still toggles.
 */
function SelectCell<T>({
  row,
  table,
  anchorRef,
  rowOrderRef,
}: {
  row: Row<T>
  table: Table<T>
  /** Shared anchor: the last row index toggled by a plain click, for shift-range. */
  anchorRef: React.MutableRefObject<number | null>
  rowOrderRef: React.MutableRefObject<RowOrder<T>>
}) {
  const checked = row.getIsSelected()
  // A non-selectable row (e.g. a pivot subtotal) shows ONLY its line number — no
  // checkbox — so it can never be swept into a group/select-all selection.
  const canSelect = row.getCanSelect()
  // Display index from the id-keyed map (robust when sorting swaps row
  // instances, which breaks `rows.indexOf(row)` → -1 → line number 0).
  const { rows, indexById } = rowOrderRef.current
  const index = indexById.get(row.id) ?? 0
  const lineNumber = index + 1
  // A shift-click is handled as a range in onClick; this flag tells the ensuing
  // onCheckedChange (which Radix still fires) to skip the single-row toggle.
  const rangeHandled = React.useRef(false)
  return (
    <div className="relative flex size-full items-center justify-center">
      <span
        className={cn(
          "text-xs text-muted-foreground tabular-nums",
          // Only swap the number out for the checkbox when the row can select.
          canSelect &&
            "group-hover/row:opacity-0 group-data-[state=selected]/row:opacity-0",
        )}
      >
        {lineNumber}
      </span>
      {canSelect ? (
        <GridCheckbox
          aria-label={`Select row ${lineNumber}`}
          checked={checked}
          onClick={(event) => {
            const doRange = event.shiftKey && anchorRef.current !== null
            rangeHandled.current = doRange
            if (!doRange) return
            const from = Math.min(anchorRef.current as number, index)
            const to = Math.max(anchorRef.current as number, index)
            const next = { ...table.getState().rowSelection }
            for (let i = from; i <= to; i++) {
              const r = rows[i]
              // Honour getCanSelect() like the single-row + select-all paths: a
              // raw setRowSelection does NOT gate on the predicate, so a range
              // spanning a non-selectable pivot subtotal must skip it (else the
              // subtotal is marked selected and inflates the count / any sum).
              if (r && r.getCanSelect()) next[r.id] = true
            }
            table.setRowSelection(next)
          }}
          onCheckedChange={(value) => {
            if (rangeHandled.current) {
              rangeHandled.current = false
              return
            }
            row.toggleSelected(!!value)
            anchorRef.current = index
          }}
          className="absolute opacity-0 group-hover/row:opacity-100 group-data-[state=selected]/row:opacity-100"
        />
      ) : null}
    </div>
  )
}

/** Width of the select column — 2.5× the 16px checkbox. */
const SELECT_WIDTH = 40

/**
 * Build the ALWAYS-present leading select column (leftmost, first) — a
 * non-focusable, non-sortable, non-resizable, non-hideable anchor with the
 * binary header checkbox (checked = all rows, else empty; never an indeterminate
 * dash) and the shared {@link SelectCell}. Generic over any row `T` with a string
 * id; the caller keeps `anchorRef` + `rowOrderRef` fresh.
 */
export function buildSelectColumn<T>({
  anchorRef,
  rowOrderRef,
}: {
  anchorRef: React.MutableRefObject<number | null>
  rowOrderRef: React.MutableRefObject<RowOrder<T>>
}): ColumnDef<T> {
  return {
    id: "select",
    size: SELECT_WIDTH,
    minSize: SELECT_WIDTH,
    maxSize: SELECT_WIDTH,
    meta: { align: "center", focusable: false },
    header: ({ table }) => (
      <GridCheckbox
        aria-label="Select all"
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
      />
    ),
    cell: ({ row, table }) => (
      <SelectCell
        row={row}
        table={table}
        anchorRef={anchorRef}
        rowOrderRef={rowOrderRef}
      />
    ),
    enableSorting: false,
    enableHiding: false,
    enableResizing: false,
  }
}
