"use client"

import * as React from "react"
import type {
  ColumnDef,
  ColumnPinningState,
  Row,
  Table,
} from "@tanstack/react-table"

import { Badge } from "@workspace/ui/components/badge"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { DataGridView } from "@workspace/ui/components/data-grid-view"
import { Input } from "@workspace/ui/components/input"
import { CircleCheckBig, Ellipsis, Maximize2 } from "@workspace/ui/lib/icons"
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
  useSectionInspectOpener,
} from "./section-table-context"
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
  onCommit,
}: {
  value: TableCellValue
  numeric: boolean
  name?: string
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

/** Row select checkbox for the leading selection column, plus (when `inspect`)
 * a maximize affordance that opens the row inspector. The maximize icon shows on
 * row hover or when this is the single selected row, and hides while several
 * rows are selected. */
function SelectCell({
  row,
  table,
  inspect,
  onInspect,
}: {
  row: Row<TableSectionRow>
  table: Table<TableSectionRow>
  inspect: boolean
  onInspect?: (row: TableSectionRow) => void
}) {
  const checked = row.getIsSelected()
  const selectedCount = table.getFilteredSelectedRowModel().rows.length
  const multiSelected = selectedCount > 1
  const singleSelected = selectedCount === 1 && checked
  return (
    <div className="flex items-center gap-1">
      <Checkbox
        aria-label="Select row"
        checked={checked}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
      />
      {inspect && !multiSelected ? (
        <button
          type="button"
          aria-label="Open details"
          onClick={() => onInspect?.(row.original)}
          className={cn(
            "flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            singleSelected
              ? "opacity-100"
              : "opacity-0 group-hover/row:opacity-100",
          )}
        >
          <Maximize2 className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}

/** Right-pinned per-row action buttons (placeholder — handlers land later). */
function RowActionsCell() {
  const action =
    "flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
  return (
    <div className="flex items-center justify-center gap-0.5">
      <button type="button" aria-label="Approve" className={action}>
        <CircleCheckBig className="size-4" />
      </button>
      <button type="button" aria-label="Confirm" className={action}>
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

  // Opener published by the archetype's bridge; the maximize affordance calls it
  // with the clicked row. Null (inert) outside `ArchetypeTable`.
  const openInspect = useSectionInspectOpener()

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
      setData((prev) =>
        prev.map((row) =>
          String(row[rowIdKey]) === rowId ? { ...row, [columnId]: value } : row,
        ),
      )
    },
    [rowIdKey],
  )

  const columns = React.useMemo<ColumnDef<TableSectionRow>[]>(() => {
    const cols: ColumnDef<TableSectionRow>[] = []

    if (features.selection === "multi") {
      const selectWidth = features.inspect ? 60 : 32
      cols.push({
        id: "select",
        size: selectWidth,
        minSize: selectWidth,
        maxSize: selectWidth,
        meta: { align: "center" },
        header: ({ table }) => (
          <Checkbox
            aria-label="Select all"
            className="border-primary"
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() ? "indeterminate" : false)
            }
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(!!value)
            }
          />
        ),
        cell: ({ row, table }) => (
          <SelectCell
            row={row}
            table={table}
            inspect={features.inspect}
            onInspect={openInspect ?? undefined}
          />
        ),
        enableSorting: false,
        enableHiding: false,
        enableResizing: false,
      })
    }

    for (const spec of specs) {
      const align = spec.align ?? (spec.kind === "number" ? "end" : "start")
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
          if (spec.editable && spec.kind === "select") {
            return (
              <SelectEditCell
                spec={spec}
                value={value}
                name={name ? `${name}[${rowId}][${spec.id}]` : undefined}
                onCommit={(v) => updateCell(rowId, spec.id, v)}
              />
            )
          }
          if (
            spec.editable &&
            (spec.kind === "text" || spec.kind === "number")
          ) {
            return (
              <TextEditCell
                value={value}
                numeric={spec.kind === "number"}
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
            return (
              <div className="w-full text-right tabular-nums">
                {value == null ? "" : value}
              </div>
            )
          }
          return <span>{String(value ?? "")}</span>
        },
      })
    }

    if (features.rowActions) {
      cols.push({
        id: "actions",
        size: 108,
        minSize: 108,
        maxSize: 108,
        meta: { align: "center" },
        header: () => null,
        cell: () => <RowActionsCell />,
        enableSorting: false,
        enableHiding: false,
        enableResizing: false,
      })
    }

    return cols
  }, [
    specs,
    features.selection,
    features.inspect,
    features.rowActions,
    name,
    rowIdKey,
    updateCell,
    openInspect,
  ])

  const columnPinning = React.useMemo<ColumnPinningState>(() => {
    const left = features.selection === "multi" ? ["select"] : []
    for (const spec of specs) if (spec.pin === "left") left.push(spec.id)
    const right = specs.filter((s) => s.pin === "right").map((s) => s.id)
    if (features.rowActions) right.push("actions")
    return { left, right }
  }, [specs, features.selection, features.rowActions])

  const { table } = useDataTable<TableSectionRow>({
    data,
    columns,
    getRowId: (row) => String(row[rowIdKey]),
    columnResizeMode: "onChange",
    enableGlobalFilter: features.search,
    globalFilterFn: "includesString",
    defaultColumn: { minSize: 56, size: 160, maxSize: 640 },
    initialState: {
      pagination: { pageIndex: 0, pageSize: 50 },
      columnPinning,
    },
  })

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
    />
  )
}
