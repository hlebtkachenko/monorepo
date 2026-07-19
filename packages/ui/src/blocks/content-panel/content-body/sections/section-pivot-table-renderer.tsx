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
  fieldStr,
  type PivotCell,
  type PivotColumnNode,
  type PivotLeafColumn,
  type PivotRow,
} from "./pivot-transform"
import { GridNumberCell } from "./section-grid-cells"
import { buildSelectColumn, type RowOrder } from "./section-grid-select"
import {
  PIVOT_ROW_LABEL_ID,
  type PivotDrillTarget,
  type PivotMeasure,
  type SectionPivotTablePayload,
} from "./section-pivot-table"
import { useSectionGridTable } from "./section-grid-table"
import {
  useSectionColumnMenu,
  useSectionPivotDrill,
} from "./section-table-context"

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
      <span
        className={cn(
          "truncate",
          row.depth === 0 && "font-medium",
          // A per-group "Total …" subtotal row reads bold, like the grand total.
          row.original.isTotal && "font-semibold",
        )}
      >
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

/**
 * One aggregate value cell. When drill-through is wired AND the cell has an
 * underlying value (not empty), it renders as a button that opens the source
 * records; otherwise it's the plain formatted number. `mousedown` is stopped so
 * activating it never also grabs the grid cell's focus ring.
 */
function PivotValueCell({
  cell,
  format,
  onDrill,
}: {
  cell: PivotCell | undefined
  format: (value: number) => string
  onDrill?: () => void
}) {
  const content = renderPivotCell(cell, format)
  if (!onDrill || !cell || cell.kind === "empty") return content
  return (
    <button
      type="button"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={onDrill}
      title="Show underlying records"
      className="w-full cursor-pointer text-right underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
    >
      {content}
    </button>
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
    subtotalRows = false,
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
        subtotalRows,
      }),
    [
      rows,
      rowDimensions,
      columnDimensions,
      measures,
      columnOrder,
      subtotalRows,
    ],
  )

  // One display formatter per measure id.
  const formatByMeasure = React.useMemo(() => {
    const map = new Map<string, (value: number) => string>()
    for (const measure of measures)
      map.set(measure.id, measureFormatter(measure))
    return map
  }, [measures])

  // Header-menu callbacks from the bridge (AI analyze; Filter is inline for value
  // columns). Null outside `ArchetypeTable` → the AI item just drops.
  const columnMenu = useSectionColumnMenu()
  // Drill-through: page handler (null → cells are inert, non-clickable). The
  // target is computed lazily on click, so no per-render row scan.
  const drill = useSectionPivotDrill()
  const buildDrillTarget = React.useCallback(
    (
      rowValues: Readonly<Record<string, string>>,
      leaf: PivotLeafColumn,
    ): PivotDrillTarget => {
      // The source rows behind this cell: every row-dimension value on the node's
      // path AND every column-dimension value above the leaf must match — the
      // exact bucket predicate `buildPivot` folded (via the shared `fieldStr`).
      const matching = rows.filter(
        (row) =>
          Object.entries(rowValues).every(
            ([field, value]) => fieldStr(row, field) === value,
          ) &&
          columnDimensions.every(
            (dim, i) => fieldStr(row, dim.field) === leaf.columnPath[i],
          ),
      )
      const coords = [...Object.values(rowValues), ...leaf.columnPath].filter(
        Boolean,
      )
      return {
        rowValues,
        columnPath: leaf.columnPath,
        measureId: leaf.measureId,
        label: `${coords.join(" · ") || "Total"} — ${leaf.label}`,
        rows: matching,
      }
    },
    [rows, columnDimensions],
  )

  // Shift-range anchor + current display order (id → position in the CURRENT
  // expanded/filtered view), kept fresh in refs for the shared select column.
  const selectionAnchor = React.useRef<number | null>(null)
  const rowOrderRef = React.useRef<RowOrder<PivotRow>>({
    rows: [],
    indexById: new Map(),
  })

  // measureId → its source field (if any), so a value column routes its "Filter"
  // to the toolbar filter for that measure field — the SAME filter for that
  // measure across every group.
  const fieldByMeasure = React.useMemo(() => {
    const map = new Map<string, string | undefined>()
    for (const measure of measures) map.set(measure.id, measure.field)
    return map
  }, [measures])

  const columns = React.useMemo<ColumnDef<PivotRow>[]>(() => {
    const leafById = new Map(pivot.leafColumns.map((l) => [l.id, l]))

    // One leaf value column (measure-per-column-path). Sortable by value (empties
    // last), never reorderable (its place in the header hierarchy is structural).
    const buildValueColumn = (leaf: PivotLeafColumn): ColumnDef<PivotRow> => {
      const format = formatByMeasure.get(leaf.measureId) ?? String
      const field = fieldByMeasure.get(leaf.measureId)
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
        // Value columns ARE drag-reorderable, but only WITHIN their group (the
        // grid scopes each group's SortableContext) — so `disableReorder` is off
        // here; the header-menu Move is off for grouped columns (see the header).
        // Their "Filter" routes to the toolbar filter for the measure's FIELD, so
        // every same-measure column across groups opens ONE filter (never inline).
        meta: {
          label: leaf.label,
          align: "end",
          ...(field ? { filterColumnId: field } : {}),
        },
        cell: ({ row }) => {
          // With subtotal rows on, an EXPANDED group's own value cells are blank
          // — its aggregate shows in the trailing "Total …" row instead, so the
          // number isn't repeated. Collapsed, the group keeps its preview values.
          if (subtotalRows && row.getCanExpand() && row.getIsExpanded())
            return null
          return (
            <PivotValueCell
              cell={row.original.values[leaf.id]}
              format={format}
              onDrill={
                drill
                  ? () => drill(buildDrillTarget(row.original.rowValues, leaf))
                  : undefined
              }
            />
          )
        },
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
        // A group header is a FIRST-CLASS header cell, not a hardcoded label:
        // `enableHiding` makes it interactive, so it renders through the same
        // `DataGridViewColumnHeader` (dropdown + pin + hide + resize handle,
        // identical design) as any other column. It can't sort (spans several
        // value columns) or drag (its place in the tier is structural), but
        // hiding/pinning it cascades to its children. Its "Filter" routes to the
        // toolbar filter for the group's column DIMENSION (`filterColumnId`), so
        // a group header filters that whole dimension (e.g. Channel).
        enableSorting: false,
        enableHiding: true,
        meta: {
          label: node.label,
          align: "center",
          disableReorder: true,
          ...(node.dimField ? { filterColumnId: node.dimField } : {}),
        },
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
        // `label` feeds the CSV/clipboard export header (and column manager); without
        // it the export falls back to the internal id `__rowlabel`.
        meta: { disableReorder: true, label: rowLabelHeader },
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
    fieldByMeasure,
    drill,
    buildDrillTarget,
    subtotalRows,
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
      // The grand total drills to ALL source rows under the leaf's column path
      // (no row-dimension constraint → `rowValues: {}`).
      cells[leaf.id] = (
        <PivotValueCell
          cell={pivot.grandTotals[leaf.id]}
          format={format}
          onDrill={drill ? () => drill(buildDrillTarget({}, leaf)) : undefined}
        />
      )
    }
    return { cells, ariaLabel: "Grand total" }
  }, [
    pivot.rows.length,
    pivot.leafColumns,
    pivot.grandTotals,
    formatByMeasure,
    drill,
    buildDrillTarget,
  ])

  const { table } = useSectionGridTable<PivotRow>({
    data: pivot.rows as PivotRow[],
    columns,
    getRowId: (row) => row.id,
    getSubRows: (row) => row.subRows as PivotRow[] | undefined,
    getExpandedRowModel: getExpandedRowModel(),
    // A synthetic per-group subtotal ("Total …") row is NOT selectable: selecting
    // a group must not also select its calculated total, else a sum over the
    // selection double-counts (the leaf rows AND their total).
    enableRowSelection: (row) => !row.original.isTotal,
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
      onColumnFilter={columnMenu?.onColumnFilter}
      onColumnAnalyze={columnMenu?.onColumnAnalyze}
    />
  )
}
