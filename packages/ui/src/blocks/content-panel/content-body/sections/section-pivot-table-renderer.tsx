"use client"

import * as React from "react"
import {
  type ColumnDef,
  type Row,
  getExpandedRowModel,
} from "@tanstack/react-table"

import {
  DataGridView,
  type DataGridSummaryRow,
} from "@workspace/ui/components/data-grid-view"
import { ChevronRight } from "@workspace/ui/lib/icons"
import { cn } from "@workspace/ui/lib/utils"

import {
  buildPivot,
  type PivotCell,
  type PivotColumnNode,
  type PivotLeafColumn,
  type PivotRow,
} from "./pivot-transform"
import { GridNumberCell } from "./section-grid-cells"
import { buildSelectColumn, type RowOrder } from "./section-grid-select"
import {
  PIVOT_ROW_LABEL_ID,
  type PivotMeasure,
  type SectionPivotTablePayload,
} from "./section-pivot-table"
import { useSectionGridTable } from "./section-grid-table"

/**
 * The row-label cell: an expand/collapse toggle (only when the node has
 * children), depth indentation, and the group label. The grid cell itself is the
 * `role="gridcell"`, so a real `<button>` here is safe (no button-in-button).
 */
function PivotLabelCell({ row }: { row: Row<PivotRow> }) {
  const canExpand = row.getCanExpand()
  const expanded = row.getIsExpanded()
  const label = row.original.label
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
      <span className={cn("truncate", row.depth === 0 && "font-medium")}>
        {label}
      </span>
    </div>
  )
}

/** Render one aggregated cell: a formatted number, blank (empty), or a muted
 *  "mixed currencies" marker — never a fake number. */
function renderPivotCell(
  cell: PivotCell | undefined,
  format: (value: number) => string,
): React.ReactNode {
  if (!cell || cell.kind === "empty") return null
  if (cell.kind === "mixed")
    return (
      <span
        className="text-muted-foreground tabular-nums"
        title="Mixed currencies — not summable"
        aria-label="Mixed currencies — not summable"
      >
        —
      </span>
    )
  return (
    <GridNumberCell negative={cell.value < 0}>
      {format(cell.value)}
    </GridNumberCell>
  )
}

/** Build a display formatter for one measure (per-measure `Intl.NumberFormat`). */
function measureFormatter(measure: PivotMeasure): (value: number) => string {
  const fmt = measure.format
  const isCurrency = fmt?.style === "currency"
  const nf = new Intl.NumberFormat(fmt?.locale, {
    style: fmt?.style ?? "decimal",
    currency: isCurrency ? fmt.currency : undefined,
    // Explicit override wins; a currency keeps its own default fraction digits
    // (2 for CZK/EUR/USD, 0 for JPY); a plain decimal defaults to 2.
    ...(fmt?.maximumFractionDigits !== undefined
      ? { maximumFractionDigits: fmt.maximumFractionDigits }
      : isCurrency
        ? {}
        : { maximumFractionDigits: 2 }),
  })
  return (value: number) => nf.format(value)
}

/**
 * SectionPivotTableRenderer — the interactive Pivot section. It folds the
 * long-format source rows into a hierarchical matrix (`buildPivot`), then drives
 * the SAME `useSectionGridTable` + `DataGridView` primitives as the flat Table —
 * only with TanStack's expanded-row model on for the tree and a summary footer
 * for the grand total. Sorting, resizing, pinning, keyboard nav, virtualization,
 * and a11y all come from `DataGridView`; nothing is re-implemented here.
 */
export function SectionPivotTableRenderer({
  props,
}: {
  props: SectionPivotTablePayload
}) {
  const {
    rows,
    rowDimensions,
    columnDimensions,
    measures,
    columnOrder,
    rowLabelHeader = "Name",
    labelWidth = 260,
    valueWidth = 150,
    defaultExpanded = true,
    search = true,
    state = "ready",
    errorText,
    emptyText,
  } = props

  const pivot = React.useMemo(
    () =>
      buildPivot({
        rows,
        rowDimensions,
        columnDimensions,
        measures,
        columnOrder,
      }),
    [rows, rowDimensions, columnDimensions, measures, columnOrder],
  )

  // One display formatter per measure id.
  const formatByMeasure = React.useMemo(() => {
    const map = new Map<string, (value: number) => string>()
    for (const measure of measures)
      map.set(measure.id, measureFormatter(measure))
    return map
  }, [measures])

  // Shift-range anchor + current display order (id → position in the CURRENT
  // expanded/filtered view), kept fresh in refs for the shared select column.
  const selectionAnchor = React.useRef<number | null>(null)
  const rowOrderRef = React.useRef<RowOrder<PivotRow>>({
    rows: [],
    indexById: new Map(),
  })

  const columns = React.useMemo<ColumnDef<PivotRow>[]>(() => {
    const leafById = new Map(pivot.leafColumns.map((l) => [l.id, l]))

    // One leaf value column (measure-per-column-path). Sortable by value (empties
    // last), never reorderable (its place in the header hierarchy is structural).
    const buildValueColumn = (leaf: PivotLeafColumn): ColumnDef<PivotRow> => {
      const format = formatByMeasure.get(leaf.measureId) ?? String
      return {
        id: leaf.id,
        header: leaf.label,
        accessorFn: (row) => {
          const cell = row.values[leaf.id]
          return cell?.kind === "value" ? cell.value : undefined
        },
        sortUndefined: "last",
        size: valueWidth,
        enableGlobalFilter: false,
        meta: { label: leaf.label, align: "end", disableReorder: true },
        cell: ({ row }) =>
          renderPivotCell(row.original.values[leaf.id], format),
      }
    }

    // Walk the column tree → TanStack column defs. A leaf node becomes a value
    // column; a group node becomes a header-group column spanning its children —
    // so `columnDimensions` render as hierarchical (banded) header tiers. With no
    // column dimensions the tree is a flat list of measure leaves (one header row).
    const buildColumnDef = (node: PivotColumnNode): ColumnDef<PivotRow> => {
      if (node.leafId) {
        const leaf = leafById.get(node.leafId)
        if (leaf) return buildValueColumn(leaf)
      }
      return {
        id: node.id,
        header: node.label,
        enableSorting: false,
        enableHiding: false,
        meta: { label: node.label, align: "center", disableReorder: true },
        columns: (node.children ?? []).map(buildColumnDef),
      }
    }

    return [
      // The ALWAYS-present leading select column (shared with the flat Table),
      // then the pinned row-label (hierarchy) column, then the value columns.
      buildSelectColumn<PivotRow>({ anchorRef: selectionAnchor, rowOrderRef }),
      {
        id: PIVOT_ROW_LABEL_ID,
        header: rowLabelHeader,
        accessorFn: (row) => row.label,
        size: labelWidth,
        minSize: 160,
        enableHiding: false,
        meta: { disableReorder: true },
        cell: ({ row }) => <PivotLabelCell row={row} />,
      },
      ...pivot.columnTree.map(buildColumnDef),
    ]
  }, [
    pivot.columnTree,
    pivot.leafColumns,
    rowLabelHeader,
    labelWidth,
    valueWidth,
    formatByMeasure,
  ])

  // The grand total is a SEPARATE, stable summary row (a pinned footer OUTSIDE
  // the sortable/filterable/selectable body model), so it always stays last +
  // visible, is never sorted/searched/selected, and is omitted for an empty pivot.
  const summaryRow = React.useMemo<DataGridSummaryRow | null>(() => {
    if (pivot.rows.length === 0) return null
    const cells: Record<string, React.ReactNode> = {
      [PIVOT_ROW_LABEL_ID]: (
        <div className="flex w-full items-center gap-1">
          <span className="size-4 shrink-0" aria-hidden />
          <span className="truncate font-semibold">Total</span>
        </div>
      ),
    }
    for (const leaf of pivot.leafColumns) {
      const format = formatByMeasure.get(leaf.measureId) ?? String
      cells[leaf.id] = renderPivotCell(pivot.grandTotals[leaf.id], format)
    }
    return { cells, ariaLabel: "Grand total" }
  }, [pivot.rows.length, pivot.leafColumns, pivot.grandTotals, formatByMeasure])

  const { table } = useSectionGridTable<PivotRow>({
    data: pivot.rows as PivotRow[],
    columns,
    getRowId: (row) => row.id,
    getSubRows: (row) => row.subRows as PivotRow[] | undefined,
    getExpandedRowModel: getExpandedRowModel(),
    autoResetExpanded: false,
    filterFromLeafRows: true,
    enableGlobalFilter: search,
    defaultColumn: { minSize: 80, size: valueWidth, maxSize: 640 },
    initialState: {
      columnPinning: { left: ["select", PIVOT_ROW_LABEL_ID] },
    },
  })

  // Refresh the display-order map (id → position in the CURRENT expanded/filtered
  // view) so the select column shows correct line numbers + shift-range as groups
  // expand/collapse. Memoized on the row-model array (stable until the view changes).
  const orderedRows = table.getRowModel().rows
  rowOrderRef.current = React.useMemo(() => {
    const indexById = new Map<string, number>()
    orderedRows.forEach((r, i) => indexById.set(r.id, i))
    return { rows: orderedRows, indexById }
  }, [orderedRows])

  // Expand every group once on first render (preserve later user collapse).
  const didExpand = React.useRef(false)
  React.useEffect(() => {
    if (defaultExpanded && !didExpand.current) {
      didExpand.current = true
      table.toggleAllRowsExpanded(true)
    }
  }, [defaultExpanded, table])

  if (state === "loading")
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  if (state === "error")
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
        {errorText ?? "Could not load the pivot."}
      </div>
    )

  return (
    <DataGridView
      table={table}
      className="min-h-0 flex-1"
      emptyMessage={emptyText ?? "No rows."}
      summaryRow={summaryRow}
    />
  )
}
