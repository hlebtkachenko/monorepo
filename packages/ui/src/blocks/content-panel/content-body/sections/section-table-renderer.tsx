"use client"

import * as React from "react"
import type { ColumnDef, ColumnPinningState } from "@tanstack/react-table"

import { Badge } from "@workspace/ui/components/badge"
import {
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@workspace/ui/components/combobox"
import {
  ComboboxItemCreatable,
  CreatableCombobox,
  isCreatableItem,
  type CreatableItem,
} from "@workspace/ui/components/creatable-combobox"
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

import {
  useSectionCellCommit,
  useSectionColumnMenu,
  useSectionCreateOption,
  useSectionInspectOpener,
} from "./section-table-context"
import { useSectionGridTable } from "./section-grid-table"
import { GridNumberCell } from "./section-grid-cells"
import { buildSelectColumn, type RowOrder } from "./section-grid-select"
import { anchorStructuralPins } from "./section-table"
import type {
  SectionTablePayload,
  TableCellValue,
  TableColumnOption,
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
  // Escape resets the draft and blurs; this flag tells the ensuing blur-commit
  // to cancel rather than persist the reverted draft.
  const cancelRef = React.useRef(false)
  const commit = () => {
    if (cancelRef.current) {
      cancelRef.current = false
      setDraft(String(value ?? ""))
      return
    }
    if (!numeric) {
      // Skip a no-op commit (blur without a change → no server round-trip).
      if (draft === String(value ?? "")) return
      onCommit(draft)
      return
    }
    const trimmed = draft.trim()
    if (trimmed === "") {
      // Empty clears to null — but only if it wasn't already null.
      if (value !== null) onCommit(null)
      return
    }
    const parsed = Number(trimmed)
    // Never commit NaN / Infinity — reject the draft and restore the last value.
    if (!Number.isFinite(parsed)) {
      setDraft(String(value ?? ""))
      return
    }
    if (parsed === value) return
    onCommit(parsed)
  }
  return (
    <Input
      name={name}
      aria-label={ariaLabel}
      value={draft}
      // "decimal" (not "numeric") so negative + fractional amounts are typable.
      inputMode={numeric ? "decimal" : "text"}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur()
        else if (e.key === "Escape") {
          cancelRef.current = true
          e.currentTarget.blur()
        }
      }}
      className={cn(
        // `dark:bg-transparent` overrides the Input's own `dark:bg-input/30` (a
        // `dark:` variant that would otherwise win over a plain `bg-transparent`)
        // — else an inline-editable cell shows a lighter field box behind its
        // text in dark mode. The idle editor inherits the row surface.
        "h-8 rounded-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent",
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
        className="h-8 w-full rounded-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
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
 * An inline CREATABLE select editor (for a `creatable: true` column, e.g. a
 * counterparty picker built around a directory). Same slot as `SelectEditCell`,
 * but backed by `CreatableCombobox`: type to search the existing options, or
 * confirm "Create …" to mint a brand-new value. Picking an option commits it;
 * creating a value commits it AND calls `onCreate` so the renderer adds it to the
 * column's live options (and the page persists it). `options` is the column's
 * CURRENT option set (grows as values are created).
 */
function CreatableSelectEditCell({
  options,
  value,
  ariaLabel,
  onCommit,
  onCreate,
}: {
  options: readonly TableColumnOption[]
  value: TableCellValue
  ariaLabel: string
  onCommit: (value: TableCellValue) => void
  onCreate: (value: string) => void
}) {
  const items = React.useMemo(
    () => options.map((o) => ({ value: o.value, label: o.label })),
    [options],
  )
  const selected = items.find((o) => o.value === String(value ?? "")) ?? null
  return (
    <CreatableCombobox
      items={items}
      value={selected}
      onValueChange={(next) => {
        // A real option OR the creatable item — both carry the underlying value
        // (the creatable item's value is the raw typed text). Commit it either
        // way; `onCreate` (fired on close) then persists a truly-new option.
        const picked = next as { value?: string } | null
        onCommit(picked?.value ?? null)
      }}
      onCreateValue={onCreate}
    >
      <ComboboxInput
        aria-label={ariaLabel}
        placeholder="—"
        showClear={false}
        className="h-8 rounded-none border-0 bg-transparent px-0 shadow-none dark:bg-transparent"
      />
      <ComboboxContent>
        <ComboboxList>
          {(item: { value: string; label: string } | CreatableItem) =>
            isCreatableItem(item) ? (
              <ComboboxItemCreatable key="__create__" value={item} />
            ) : (
              <ComboboxItem key={item.value} value={item}>
                {item.label}
              </ComboboxItem>
            )
          }
        </ComboboxList>
      </ComboboxContent>
    </CreatableCombobox>
  )
}

/**
 * Right-pinned per-row actions (the `rowActions` feature) — the ONE primary
 * action placeholder + overflow menu a surface needs (e.g. Approve on Posting
 * Approval). Handlers land per consumer later — the icons are the slots. The
 * Open-inspector button is NOT here — it lives in the identity column (see
 * `InspectorOpenButton`).
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
 * The Open-inspector affordance, right-aligned in the identity (`role: "id"`)
 * cell and revealed on row hover (idle when not hovered, like the leading select
 * column's number↔checkbox swap). A white boxed icon button: a 22×22 box with
 * the same border as an unselected checkbox (`--grid-checkbox-border`), a
 * `--grid-action-icon` (#646464) `size-3.5` glyph (proportionate to the smaller
 * box — a `size-4` looked oversized), a `--grid-action-hover` (#e5e5e5) hover
 * fill, and an "Open Inspector" tooltip. Its right edge sits at the cell's
 * `px-3` so the gap mirrors the left inset; `mousedown` is stopped so pressing
 * it never grabs the cell's focus ring.
 */
function InspectorOpenButton({ onClick }: { onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="Open inspector"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={onClick}
          className="flex size-[22px] shrink-0 items-center justify-center rounded-md border border-grid-checkbox-border bg-background text-grid-action-icon opacity-0 transition-[opacity,background-color] group-hover/row:opacity-100 hover:bg-grid-action-hover focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Maximize2 className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent>Open Inspector</TooltipContent>
    </Tooltip>
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
  const {
    columns: specs,
    rows,
    rowIdKey,
    features,
    emptyText,
    name,
    persistKey,
  } = props

  // Persist the user's column layout (widths / order / pinning) per page. An
  // explicit `persistKey` wins; otherwise auto-derive from the page path + the
  // section name so most pages persist for free. Client-only (reads
  // `window.location`) and consumed only in effects, so it's SSR-safe — computed
  // once in a lazy initializer to stay stable across re-renders.
  const [persistenceKey] = React.useState<string | undefined>(() => {
    if (persistKey) return `afframe.table.${persistKey}`
    if (typeof window === "undefined") return undefined
    return `afframe.table.auto:${window.location.pathname}:${name ?? "table"}`
  })

  // Header-menu callbacks (Filter → toolbar filter, AI analyze → request) from
  // the bridge; null outside `ArchetypeTable`, so the menu drops both items.
  const columnMenu = useSectionColumnMenu()
  // Row-inspector opener from the bridge; null outside `ArchetypeTable`, so the
  // per-row "Open inspector" button (gated by `features.inspect`) stays inert.
  const openInspect = useSectionInspectOpener()
  // The trailing actions column exists only for `rowActions` — the Open-inspector
  // button lives right-aligned in the identity (`role: "id"`) column instead.
  const hasActionsColumn = features.rowActions
  // The identity column that hosts the Open-inspector button when `inspect` is on
  // (spec §3b: a required `role: "id"` column; fall back to the first column).
  const idColumnId = features.inspect
    ? (specs.find((s) => s.role === "id")?.id ?? specs[0]?.id)
    : undefined
  // Page-supplied persistence for an inline-cell edit; null → edits stay local draft.
  const commitCell = useSectionCellCommit()
  // Page-supplied persistence for a newly-created option (creatable columns).
  const createOptionCommit = useSectionCreateOption()
  // Anchor row index for shift-click range selection (like a normal file list).
  const selectionAnchor = React.useRef<number | null>(null)
  // Current display order + id→index map, refreshed after the table is built
  // below. Declared here so the memoized select-cell closure can capture it.
  const rowOrderRef = React.useRef<RowOrder<TableSectionRow>>({
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

  // Per-cell commit version. A cell can have several edits in flight; only the
  // NEWEST one may ever roll back, and only if the cell still holds that exact
  // optimistic value — so a stale rejection can never overwrite a later
  // confirmed edit (C4: race-safe optimistic writes).
  const cellVersionRef = React.useRef<Map<string, number>>(new Map())
  const updateCell = React.useCallback(
    (rowId: string, columnId: string, value: TableCellValue) => {
      const cellKey = `${rowId}::${columnId}`
      const version = (cellVersionRef.current.get(cellKey) ?? 0) + 1
      cellVersionRef.current.set(cellKey, version)

      // Optimistic local update; capture the prior value (from the state this
      // edit is applied on top of) so a rejected persist can revert this cell.
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
        // Superseded by a newer edit to the same cell → let the newer one own it.
        if (cellVersionRef.current.get(cellKey) !== version) return
        setData((prev) =>
          prev.map((row) => {
            if (String(row[rowIdKey]) !== rowId) return row
            // The cell already moved on to another value → don't clobber it.
            if (row[columnId] !== value) return row
            return { ...row, [columnId]: prevValue }
          }),
        )
      })
    },
    [rowIdKey, commitCell],
  )

  // Live option sets for `creatable` columns, seeded from each spec's `options`
  // and grown when the user creates a value. Column-level (shared across every
  // row's editor) so a value created in one row's cell is immediately checkable
  // in every other row. Non-creatable columns never enter this map.
  const [optionsByColumn, setOptionsByColumn] = React.useState<
    Record<string, readonly TableColumnOption[]>
  >(() => {
    const seed: Record<string, readonly TableColumnOption[]> = {}
    for (const spec of specs)
      if (spec.creatable) seed[spec.id] = spec.options ?? []
    return seed
  })
  // Reseed when the descriptor's specs change (new page data).
  const [prevSpecs, setPrevSpecs] = React.useState(specs)
  if (specs !== prevSpecs) {
    setPrevSpecs(specs)
    const seed: Record<string, readonly TableColumnOption[]> = {}
    for (const spec of specs)
      if (spec.creatable) seed[spec.id] = spec.options ?? []
    setOptionsByColumn(seed)
  }
  const handleCreateOption = React.useCallback(
    (columnId: string, value: string) => {
      const trimmed = value.trim()
      if (trimmed === "") return
      setOptionsByColumn((prev) => {
        const current = prev[columnId] ?? []
        if (current.some((o) => o.value === trimmed)) return prev
        return {
          ...prev,
          [columnId]: [...current, { value: trimmed, label: trimmed }],
        }
      })
      // Persist (append to the directory) — best-effort; the option is already
      // local. A rejection is a page concern (it can toast); we don't roll back
      // the local option, so the user's in-progress edit isn't yanked away.
      if (createOptionCommit)
        void Promise.resolve(
          createOptionCommit({ columnId, value: trimmed }),
        ).catch(() => {})
    },
    [createOptionCommit],
  )

  const columns = React.useMemo<ColumnDef<TableSectionRow>[]>(() => {
    const cols: ColumnDef<TableSectionRow>[] = []

    // The select column is ALWAYS present (leftmost, first) — even in a
    // read-only table (spec §6). Shared with the Pivot section via
    // `buildSelectColumn` so both render an identical select affordance.
    cols.push(
      buildSelectColumn<TableSectionRow>({
        anchorRef: selectionAnchor,
        rowOrderRef,
      }),
    )

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
          // The identity column reserves room for its trailing inspector button
          // (22px box + gap-2 8px = 30) so auto-fit never clips it.
          ...(spec.id === idColumnId ? { trailingWidth: 30 } : {}),
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
          const content =
            inline && spec.kind === "select" && spec.creatable ? (
              <CreatableSelectEditCell
                options={optionsByColumn[spec.id] ?? spec.options ?? []}
                value={value}
                ariaLabel={spec.header}
                onCommit={(v) => updateCell(rowId, spec.id, v)}
                onCreate={(v) => handleCreateOption(spec.id, v)}
              />
            ) : inline && spec.kind === "select" ? (
              <SelectEditCell
                spec={spec}
                value={value}
                name={name ? `${name}[${rowId}][${spec.id}]` : undefined}
                onCommit={(v) => updateCell(rowId, spec.id, v)}
              />
            ) : inline && (spec.kind === "text" || spec.kind === "number") ? (
              <TextEditCell
                value={value}
                numeric={spec.kind === "number"}
                ariaLabel={spec.header}
                name={name ? `${name}[${rowId}][${spec.id}]` : undefined}
                onCommit={(v) => updateCell(rowId, spec.id, v)}
              />
            ) : spec.kind === "badge" ? (
              <Badge variant="secondary">{optionLabel(spec, value)}</Badge>
            ) : spec.kind === "select" ? (
              <span>{optionLabel(spec, value)}</span>
            ) : spec.kind === "number" ? (
              <GridNumberCell>{value == null ? "" : value}</GridNumberCell>
            ) : (
              <span>{String(value ?? "")}</span>
            )
          // The identity column hosts the right-aligned, hover-revealed
          // Open-inspector button next to its value (spec §3b).
          if (spec.id === idColumnId && openInspect) {
            return (
              <div className="flex w-full items-center gap-2">
                <div className="min-w-0 flex-1 truncate">{content}</div>
                <InspectorOpenButton
                  onClick={() => openInspect(row.original)}
                />
              </div>
            )
          }
          return content
        },
      })
    }

    if (hasActionsColumn) {
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
  }, [
    specs,
    features.rowActions,
    hasActionsColumn,
    idColumnId,
    openInspect,
    name,
    rowIdKey,
    updateCell,
    optionsByColumn,
    handleCreateOption,
  ])

  const columnPinning = React.useMemo<ColumnPinningState>(() => {
    // `select` is always present and always first-left.
    const left = ["select"]
    for (const spec of specs) if (spec.pin === "left") left.push(spec.id)
    const right = specs.filter((s) => s.pin === "right").map((s) => s.id)
    if (hasActionsColumn) right.push("actions")
    return { left, right }
  }, [specs, hasActionsColumn])

  // Keep the structural columns anchored on every pinning write (see
  // `anchorStructuralPins`): `select` first-left, `actions` last-right — so a
  // header-menu pin or a within-group drag can never dislodge them.
  const normalizeColumnPinning = React.useCallback(
    (pinning: ColumnPinningState): ColumnPinningState =>
      anchorStructuralPins(pinning, {
        hasSelect: true,
        hasActions: hasActionsColumn,
      }),
    [hasActionsColumn],
  )

  // The mandatory single-page grid scaffold (`useDataTable` config + live-instance
  // registration/signature) is owned by `useSectionGridTable`; only the
  // flat-specific data pieces are supplied here.
  const { table } = useSectionGridTable<TableSectionRow>({
    data,
    columns,
    getRowId: (row) => String(row[rowIdKey]),
    enableGlobalFilter: features.search,
    defaultColumn: { minSize: 56, size: 160, maxSize: 640 },
    normalizeColumnPinning,
    persistenceKey,
    initialState: {
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

  return (
    // Provider for the per-row Open-inspector tooltip; short delay so it doesn't
    // flash while sweeping the mouse across rows.
    <TooltipProvider delayDuration={400}>
      <DataGridView
        table={table}
        className="min-h-0 flex-1"
        emptyMessage={emptyText ?? "No rows."}
        onColumnFilter={columnMenu?.onColumnFilter}
        onColumnAnalyze={columnMenu?.onColumnAnalyze}
      />
    </TooltipProvider>
  )
}
