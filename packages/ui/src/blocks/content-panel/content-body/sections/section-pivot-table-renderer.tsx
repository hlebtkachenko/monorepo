"use client"

import * as React from "react"
import {
  type ColumnDef,
  type Row,
  getExpandedRowModel,
} from "@tanstack/react-table"

import { DataGridView } from "@workspace/ui/components/data-grid-view"
import { useDataTable } from "@workspace/ui/components/data-table"
import { ChevronRight } from "@workspace/ui/lib/icons"
import { cn } from "@workspace/ui/lib/utils"

import { buildPivot, type PivotRow } from "./pivot-transform"
import { GridNumberCell } from "./section-grid-cells"
import type { SectionPivotTablePayload } from "./section-pivot-table"
import { useRegisterSectionTable } from "./section-table-context"

/** The pinned leading column id — the row-label hierarchy tree. */
const LABEL_COLUMN_ID = "__label"

/** The synthetic id of the appended grand-total row. */
const TOTAL_ROW_ID = "__total"

/**
 * The row-label cell: an expand/collapse toggle (only when the node has
 * children), depth indentation, and the group label. Kept a plain flex row — the
 * grid cell itself is the `role="gridcell"`, so nesting a real `<button>` here is
 * safe (no button-in-button).
 */
function PivotLabelCell({ row }: { row: Row<PivotRow> }) {
  const canExpand = row.getCanExpand()
  const expanded = row.getIsExpanded()
  const label = row.original.label
  const isTotal = row.original.id === TOTAL_ROW_ID
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
      {/* Every depth-0 label already reads bold; the grand-total row gets one
          step heavier so it stands out from a regular top-level group row. */}
      <span
        className={cn(
          "truncate",
          row.depth === 0 && "font-medium",
          isTotal && "font-semibold",
        )}
      >
        {label}
      </span>
    </div>
  )
}

/**
 * SectionPivotTableRenderer — the interactive Pivot-table section. It pivots the
 * long-format source rows into a hierarchical matrix (`buildPivot`), then drives
 * the SAME `useDataTable` + `DataGridView` primitives as the flat Table section,
 * only with TanStack's expanded-row model turned on for the tree. Because the
 * grid rendering, pinning, column drag, resize, keyboard nav, and a11y all live
 * in `DataGridView`, a design change there (or a new mandatory pin convention in
 * `useDataTable`) reaches the pivot with no extra work.
 */
export function SectionPivotTableRenderer({
  props,
}: {
  props: SectionPivotTablePayload
}) {
  const {
    rows,
    rowGroups,
    pivotColumn,
    valueField,
    aggregate,
    pivotColumnOrder,
    labelHeader = "Name",
    labelWidth = 260,
    valueWidth = 150,
    valueFormat,
    defaultExpanded = true,
    search = true,
    emptyText,
  } = props

  const pivot = React.useMemo(
    () =>
      buildPivot({
        rows,
        rowGroups,
        pivotColumn,
        valueField,
        aggregate,
        pivotColumnOrder,
      }),
    [rows, rowGroups, pivotColumn, valueField, aggregate, pivotColumnOrder],
  )

  // v1: the grand-total row is a plain top-level PivotRow appended to the
  // table's data array rather than a separate footer row model, so it sorts
  // and filters like any other row (e.g. sorting a value column can move it
  // out of the last position). Acceptable for now — a sort-exempt, pinned
  // footer row needs its own TanStack row model. Skipped entirely when there
  // are no pivot rows, so an empty pivot still shows `emptyMessage` instead of
  // a lone "Total" row with nothing under it.
  const dataWithTotal = React.useMemo<PivotRow[]>(() => {
    if (pivot.rows.length === 0) return pivot.rows as PivotRow[]
    return [
      ...pivot.rows,
      {
        id: TOTAL_ROW_ID,
        label: "Total",
        depth: 0,
        values: pivot.grandTotals,
        leafCount: rows.length,
        subRows: undefined,
      },
    ]
  }, [pivot.rows, pivot.grandTotals, rows.length])

  const format = React.useMemo(() => {
    const fmt = new Intl.NumberFormat(valueFormat?.locale, {
      style: valueFormat?.style ?? "decimal",
      currency:
        valueFormat?.style === "currency" ? valueFormat.currency : undefined,
      maximumFractionDigits: valueFormat?.maximumFractionDigits ?? 2,
    })
    return (value: number) => fmt.format(value)
  }, [valueFormat])

  const columns = React.useMemo<ColumnDef<PivotRow>[]>(() => {
    const cols: ColumnDef<PivotRow>[] = [
      {
        id: LABEL_COLUMN_ID,
        header: labelHeader,
        // Accessor drives the global search; the cell renders the tree affordance.
        accessorFn: (row) => row.label,
        size: labelWidth,
        minSize: 160,
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => <PivotLabelCell row={row} />,
      },
    ]
    for (const col of pivot.columns) {
      cols.push({
        id: col.id,
        header: col.header,
        accessorFn: (row) => row.values[col.id] ?? null,
        size: valueWidth,
        enableGlobalFilter: false,
        meta: { label: col.header, align: "end" },
        cell: ({ getValue }) => {
          const value = getValue() as number | null
          if (value == null) return null
          return (
            <GridNumberCell negative={value < 0}>
              {format(value)}
            </GridNumberCell>
          )
        },
      })
    }
    return cols
  }, [pivot.columns, labelHeader, labelWidth, valueWidth, format])

  const { table } = useDataTable<PivotRow>({
    data: dataWithTotal,
    columns,
    getRowId: (row) => row.id,
    getSubRows: (row) => row.subRows as PivotRow[] | undefined,
    getExpandedRowModel: getExpandedRowModel(),
    autoResetExpanded: false,
    filterFromLeafRows: true,
    columnResizeMode: "onChange",
    enableGlobalFilter: search,
    globalFilterFn: "includesString",
    defaultColumn: { minSize: 80, size: valueWidth, maxSize: 640 },
    initialState: {
      // Big page so an expanded tree isn't paginated; the label column is frozen
      // at the left edge (the one structural pin the pivot owns).
      pagination: { pageIndex: 0, pageSize: 500 },
      columnPinning: { left: [LABEL_COLUMN_ID] },
    },
  })

  // Expand the whole tree once on mount (useDataTable doesn't thread the
  // `expanded` initial state, so seed it imperatively). Runs once — later
  // user collapse/expand is preserved.
  const didExpand = React.useRef(false)
  React.useEffect(() => {
    if (defaultExpanded && !didExpand.current) {
      didExpand.current = true
      table.toggleAllRowsExpanded(true)
    }
  }, [defaultExpanded, table])

  // Publish the live instance up so the archetype toolbar (Columns/Sort) +
  // universal search drive this grid too. Inert outside `ArchetypeTable`.
  const state = table.getState()
  const stateSignature = JSON.stringify({
    s: state.sorting,
    v: state.columnVisibility,
    o: state.columnOrder,
    p: state.columnPinning,
    e: state.expanded,
    g: state.globalFilter,
  })
  useRegisterSectionTable(table as never, 0, stateSignature)

  return (
    <DataGridView
      table={table}
      className="min-h-0 flex-1"
      emptyMessage={emptyText ?? "No data."}
    />
  )
}
