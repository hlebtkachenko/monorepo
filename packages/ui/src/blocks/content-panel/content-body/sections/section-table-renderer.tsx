"use client"

import * as React from "react"
import type {
  ColumnDef,
  ColumnPinningState,
  Row,
  Table,
} from "@tanstack/react-table"

import { Badge } from "@workspace/ui/components/badge"
import { DataGridView } from "@workspace/ui/components/data-grid-view"
import { Input } from "@workspace/ui/components/input"
import { CircleCheckBig, Ellipsis } from "@workspace/ui/lib/icons"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { useDataTable } from "@workspace/ui/components/data-table"
import { cn } from "@workspace/ui/lib/utils"

import {
  useRegisterSectionTable,
  useSectionCellCommit,
  useSectionColumnMenu,
} from "./section-table-context"
import { GridCheckbox, GridNumberCell } from "./section-grid-cells"
import { anchorStructuralPins } from "./section-table"
import type {
  SectionTablePayload,
  TableCellValue,
  TableColumnSpec,
  TableSectionRow,
} from "./section-table"

/** Look up a `select` / `badge` option label; fall back to the raw value. */
function optionLabel(spec: TableColumnSpec, value: TableCellValue): string {
  const found = spec.options?.find((o) => o.value === String(value ?? ""))
  return found?.label ?? String(value ?? "")
}

/** An inline text/number editor filling its grid cell (spreadsheet-style). */
function TextEditCell({
  value,
  numeric,
  name,
  ariaLabel,
  onCommit,
}: {
  value: TableCellValue
  numeric: boolean
  name?: string
  /** Accessible name for the bare inline input (no visible label in a cell). */
  ariaLabel: string
  onCommit: (value: TableCellValue) => void
}) {
  const [draft, setDraft] = React.useState(String(value ?? ""))
  // Re-sync the draft when the committed value changes (edit applied, or the
  // rows reseeded) — the render-time reset pattern, not an effect.
  const [prevValue, setPrevValue] = React.useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    setDraft(String(value ?? ""))
  }
  return (
    <Input
      name={name}
      aria-label={ariaLabel}
      value={draft}
      inputMode={numeric ? "numeric" : "text"}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() =>
        onCommit(numeric ? (draft === "" ? null : Number(draft)) : draft)
      }
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur()
      }}
      className={cn(
        "h-8 rounded-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0",
        numeric && "text-right tabular-nums",
      )}
    />
  )
}

/** An inline Select editor filling its grid cell. */
function SelectEditCell({
  spec,
  value,
  name,
  onCommit,
}: {
  spec: TableColumnSpec
  value: TableCellValue
  name?: string
  onCommit: (value: TableCellValue) => void
}) {
  return (
    <Select value={String(value ?? "")} onValueChange={onCommit} name={name}>
      <SelectTrigger
        size="sm"
        aria-label={spec.header}
        className="h-8 w-full rounded-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
      >
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        {spec.options?.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * The leading select-column cell. An idle row shows its 1-based line number
 * (sequential in the CURRENT view — filters renumber 1..N with no gaps); on row
 * hover or when the row is selected, the checkbox takes its place (empty on
 * hover, filled when selected). The number + checkbox are overlaid and swapped
 * purely by the row's `group`/`data-state` — no per-row hover state. The column
 * is never a focusable grid cell (`meta.focusable: false`), so clicking a cell
 * here never gives it the cell focus ring; the checkbox itself still toggles.
 */
/** The current display order + an id→index map, kept in a ref so the memoized
 * select-cell closure always reads the FRESH order (sort/filter change it). */
type RowOrder = {
  rows: Row<TableSectionRow>[]
  indexById: Map<string, number>
}

function SelectCell({
  row,
  table,
  anchorRef,
  rowOrderRef,
}: {
  row: Row<TableSectionRow>
  table: Table<TableSectionRow>
  /** Shared anchor: the last row index toggled by a plain click, for shift-range. */
  anchorRef: React.MutableRefObject<number | null>
  rowOrderRef: React.MutableRefObject<RowOrder>
}) {
  const checked = row.getIsSelected()
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
      <span className="text-xs text-muted-foreground tabular-nums group-hover/row:opacity-0 group-data-[state=selected]/row:opacity-0">
        {lineNumber}
      </span>
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
            if (r) next[r.id] = true
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
    </div>
  )
}

/**
 * Right-pinned per-row actions: ONE primary action placeholder + the overflow
 * menu. The row's default affordances (select checkbox, open-inspector) live in
 * the leading `select` column; this trailing column is for the one or two
 * line-level actions a surface needs (e.g. Approve on Posting Approval). Handlers
 * land per consumer later — the icons are the placeholder slots.
 */
function RowActionsCell() {
  const action =
    "flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
  return (
    <div className="flex items-center justify-center gap-0.5">
      <button type="button" aria-label="Approve" className={action}>
        <CircleCheckBig className="size-4" />
      </button>
      <button type="button" aria-label="More actions" className={action}>
        <Ellipsis className="size-4" />
      </button>
    </div>
  )
}

/**
 * SectionTableRenderer — the CLOSED, `"use client"` renderer for a Table section.
 * It maps the descriptor's pure-data column specs to TanStack `ColumnDef`s
 * (binding OUR shadcn cells + inline editors), mints the live table with the
 * repo's headless `useDataTable`, renders it through `DataGridView` (sort · hide ·
 * resize · reorder · pin · select · cell-focus keyboard nav), and publishes the
 * instance up via `useRegisterSectionTable` so the archetype's toolbar + footer
 * can drive it. Every handler and cell renderer lives here — the descriptor
 * `props` stay pure data.
 */
export function SectionTableRenderer({
  props,
}: {
  props: SectionTablePayload
}) {
  const { columns: specs, rows, rowIdKey, features, emptyText, name } = props

  // Header-menu callbacks (Filter → toolbar filter, AI analyze → request) from
  // the bridge; null outside `ArchetypeTable`, so the menu drops both items.
  const columnMenu = useSectionColumnMenu()
  // Page-supplied persistence for an inline-cell edit; null → edits stay local draft.
  const commitCell = useSectionCellCommit()
  // Anchor row index for shift-click range selection (like a normal file list).
  const selectionAnchor = React.useRef<number | null>(null)
  // Current display order + id→index map, refreshed after the table is built
  // below. Declared here so the memoized select-cell closure can capture it.
  const rowOrderRef = React.useRef<RowOrder>({
    rows: [],
    indexById: new Map(),
  })

  // Rows are held as local draft state so inline edits stick; seeded from the
  // descriptor. A new `rows` reference (fresh data) reseeds it — the render-time
  // reset pattern, not an effect (avoids a cascading re-render).
  const [data, setData] = React.useState<TableSectionRow[]>(() => [...rows])
  const [prevRows, setPrevRows] = React.useState(rows)
  if (rows !== prevRows) {
    setPrevRows(rows)
    setData([...rows])
  }

  const updateCell = React.useCallback(
    (rowId: string, columnId: string, value: TableCellValue) => {
      // Optimistic local update; capture the prior value so a rejected persist
      // can revert exactly this cell.
      let prevValue: TableCellValue = null
      setData((prev) =>
        prev.map((row) => {
          if (String(row[rowIdKey]) !== rowId) return row
          prevValue = row[columnId] ?? null
          return { ...row, [columnId]: value }
        }),
      )
      if (!commitCell) return
      void Promise.resolve(commitCell({ rowId, columnId, value })).catch(() => {
        setData((prev) =>
          prev.map((row) =>
            String(row[rowIdKey]) === rowId
              ? { ...row, [columnId]: prevValue }
              : row,
          ),
        )
      })
    },
    [rowIdKey, commitCell],
  )

  const columns = React.useMemo<ColumnDef<TableSectionRow>[]>(() => {
    const cols: ColumnDef<TableSectionRow>[] = []

    // The select column is ALWAYS present (leftmost, first) — even in a
    // read-only table (spec §6). Width is 2.5x the 16px checkbox (40px); it is a
    // non-focusable, non-sortable, non-resizable anchor.
    const SELECT_WIDTH = 40
    cols.push({
      id: "select",
      size: SELECT_WIDTH,
      minSize: SELECT_WIDTH,
      maxSize: SELECT_WIDTH,
      meta: { align: "center", focusable: false },
      header: ({ table }) => (
        <GridCheckbox
          aria-label="Select all"
          // Binary only: checked when ALL rows are selected, otherwise empty —
          // never an indeterminate dash (spec §13).
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        />
      ),
      cell: ({ row, table }) => (
        <SelectCell
          row={row}
          table={table}
          anchorRef={selectionAnchor}
          rowOrderRef={rowOrderRef}
        />
      ),
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
    })

    for (const spec of specs) {
      const align = spec.align ?? (spec.kind === "number" ? "end" : "start")
      const inline = spec.edit === "inline" || spec.edit === "both"
      cols.push({
        accessorKey: spec.id,
        header: spec.header,
        size: spec.width ?? 160,
        enableSorting: spec.enableSort ?? true,
        enableHiding: spec.enableHide ?? true,
        enableColumnFilter: spec.enableFilter ?? false,
        filterFn: spec.enableFilter
          ? (row, id, value) =>
              !Array.isArray(value) || value.length === 0
                ? true
                : value.includes(String(row.getValue(id)))
          : undefined,
        meta: {
          label: spec.header,
          align,
          editable: inline,
          ...(spec.enableFilter
            ? {
                variant: "multiSelect" as const,
                options: spec.options?.map((o) => ({
                  label: o.label,
                  value: o.value,
                })),
              }
            : {}),
        },
        cell: ({ row, getValue }) => {
          const value = getValue() as TableCellValue
          const rowId = String(row.original[rowIdKey])
          if (inline && spec.kind === "select") {
            return (
              <SelectEditCell
                spec={spec}
                value={value}
                name={name ? `${name}[${rowId}][${spec.id}]` : undefined}
                onCommit={(v) => updateCell(rowId, spec.id, v)}
              />
            )
          }
          if (inline && (spec.kind === "text" || spec.kind === "number")) {
            return (
              <TextEditCell
                value={value}
                numeric={spec.kind === "number"}
                ariaLabel={spec.header}
                name={name ? `${name}[${rowId}][${spec.id}]` : undefined}
                onCommit={(v) => updateCell(rowId, spec.id, v)}
              />
            )
          }
          if (spec.kind === "badge") {
            return <Badge variant="secondary">{optionLabel(spec, value)}</Badge>
          }
          if (spec.kind === "select") {
            return <span>{optionLabel(spec, value)}</span>
          }
          if (spec.kind === "number") {
            return <GridNumberCell>{value == null ? "" : value}</GridNumberCell>
          }
          return <span>{String(value ?? "")}</span>
        },
      })
    }

    if (features.rowActions) {
      cols.push({
        id: "actions",
        size: 76,
        minSize: 76,
        maxSize: 76,
        meta: { align: "center" },
        header: () => null,
        cell: () => <RowActionsCell />,
        enableSorting: false,
        enableHiding: false,
        enableResizing: false,
      })
    }

    return cols
  }, [specs, features.rowActions, name, rowIdKey, updateCell])

  const columnPinning = React.useMemo<ColumnPinningState>(() => {
    // `select` is always present and always first-left.
    const left = ["select"]
    for (const spec of specs) if (spec.pin === "left") left.push(spec.id)
    const right = specs.filter((s) => s.pin === "right").map((s) => s.id)
    if (features.rowActions) right.push("actions")
    return { left, right }
  }, [specs, features.rowActions])

  // Keep the structural columns anchored on every pinning write (see
  // `anchorStructuralPins`): `select` first-left, `actions` last-right — so a
  // header-menu pin or a within-group drag can never dislodge them.
  const normalizeColumnPinning = React.useCallback(
    (pinning: ColumnPinningState): ColumnPinningState =>
      anchorStructuralPins(pinning, {
        hasSelect: true,
        hasActions: features.rowActions,
      }),
    [features.rowActions],
  )

  const { table } = useDataTable<TableSectionRow>({
    data,
    columns,
    getRowId: (row) => String(row[rowIdKey]),
    columnResizeMode: "onChange",
    enableGlobalFilter: features.search,
    globalFilterFn: "includesString",
    defaultColumn: { minSize: 56, size: 160, maxSize: 640 },
    normalizeColumnPinning,
    initialState: {
      // Single-page model: all rows live on one page and `DataGridView`
      // virtualizes them (no page-based pagination anywhere). A very large page
      // size stands in for "unbounded"; the grid windows the DOM so a 1000+ row
      // table stays smooth.
      pagination: { pageIndex: 0, pageSize: 100_000 },
      columnPinning,
    },
  })

  // Refresh the display-order map (id → position in the CURRENT sorted/filtered
  // view) so the select column shows correct line numbers + shift-range even
  // after a sort. Memoized on the row-model array (stable until the view changes).
  const orderedRows = table.getRowModel().rows
  rowOrderRef.current = React.useMemo(() => {
    const indexById = new Map<string, number>()
    orderedRows.forEach((r, i) => indexById.set(r.id, i))
    return { rows: orderedRows, indexById }
  }, [orderedRows])

  // Publish the live instance up so the toolbar (Columns/Sort) + selection footer
  // stay in sync; re-register whenever a tracked slice of grid state changes.
  const state = table.getState()
  const selectionCount = table.getFilteredSelectedRowModel().rows.length
  const stateSignature = JSON.stringify({
    rs: state.rowSelection,
    s: state.sorting,
    v: state.columnVisibility,
    o: state.columnOrder,
    p: state.columnPinning,
    // Filter + global-search state MUST be tracked too: the toolbar's faceted
    // status filter reads its selected value from the live column filter state,
    // so without this the dropdown checkbox + trigger badge stay stale until an
    // unrelated re-render (e.g. closing the popover) refreshes the toolbar.
    f: state.columnFilters,
    g: state.globalFilter,
  })
  useRegisterSectionTable(table as never, selectionCount, stateSignature)

  return (
    <DataGridView
      table={table}
      className="min-h-0 flex-1"
      emptyMessage={emptyText ?? "No rows."}
      onColumnFilter={columnMenu?.onColumnFilter}
      onColumnAnalyze={columnMenu?.onColumnAnalyze}
    />
  )
}
