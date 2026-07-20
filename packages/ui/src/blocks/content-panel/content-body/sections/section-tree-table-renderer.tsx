"use client"

import * as React from "react"
import {
  type ColumnDef,
  type ColumnPinningState,
  type ExpandedState,
  getExpandedRowModel,
} from "@tanstack/react-table"

import { Badge } from "@workspace/ui/components/badge"
import { DataGridView } from "@workspace/ui/components/data-grid-view"
import { TooltipProvider } from "@workspace/ui/components/tooltip"

import {
  useSectionCellCommit,
  useSectionColumnMenu,
  useSectionCreateOption,
  useSectionInspectOpener,
} from "./section-table-context"
import { useSectionGridTable } from "./section-grid-table"
import { GridNumberCell } from "./section-grid-cells"
import { buildSelectColumn, type RowOrder } from "./section-grid-select"
import {
  CreatableSelectEditCell,
  InspectorOpenButton,
  optionLabel,
  RowActionsCell,
  SelectEditCell,
  TextEditCell,
} from "./section-grid-editors"
import { TreeLabelCell } from "./section-grid-tree"
import { anchorStructuralPins } from "./section-table"
import type { TableCellValue, TableColumnOption } from "./section-table"
import type {
  SectionTreeTablePayload,
  TreeTableDefaultExpanded,
  TreeTableRow,
} from "./section-tree-table"

/**
 * Immutably update one node (found by `id`, at any depth) in a tree forest,
 * returning the SAME reference when nothing changed so React skips a re-render.
 */
function updateNode(
  nodes: readonly TreeTableRow[],
  rowId: string,
  updater: (node: TreeTableRow) => TreeTableRow,
): readonly TreeTableRow[] {
  let changed = false
  const next = nodes.map((node) => {
    if (node.id === rowId) {
      changed = true
      return updater(node)
    }
    if (node.subRows && node.subRows.length > 0) {
      const sub = updateNode(node.subRows, rowId, updater)
      if (sub !== node.subRows) {
        changed = true
        return { ...node, subRows: sub }
      }
    }
    return node
  })
  return changed ? next : nodes
}

/** Build the initial TanStack expansion from `defaultExpanded`: `true` = all,
 *  `false` = none, a NUMBER = every expandable node with `depth < n`. */
function initialExpanded(
  rows: readonly TreeTableRow[],
  defaultExpanded: TreeTableDefaultExpanded,
): ExpandedState {
  if (defaultExpanded === true) return true
  if (defaultExpanded === false) return {}
  const acc: Record<string, boolean> = {}
  const walk = (nodes: readonly TreeTableRow[], depth: number) => {
    for (const node of nodes) {
      if (node.subRows && node.subRows.length > 0) {
        if (depth < defaultExpanded) acc[node.id] = true
        walk(node.subRows, depth + 1)
      }
    }
  }
  walk(rows, 0)
  return acc
}

/**
 * SectionTreeTableRenderer — the interactive Tree-table section. It is the flat
 * Table renderer's editable data grid (shared cells + inline editors from
 * `section-grid-editors`, shared select column, `DataGridView` chrome) PLUS a
 * parent/child hierarchy driven by TanStack's expanded-row model (`getSubRows` +
 * `getExpandedRowModel` + `filterFromLeafRows`) — exactly the mechanics the Pivot
 * section proved, but over REAL editable records instead of aggregated cells.
 *
 * The identity (`role: "id"`) column hosts the `TreeLabelCell` (chevron + depth
 * indent + label). A STRUCTURAL tier node (`selectable: false`) renders label-only
 * (its other cells are blank), can never be selected, and its cells are never
 * editable. Sorting sorts children within their parent; filtering keeps ancestors
 * of a matching leaf; selecting a parent selects its descendants — all inherited
 * from TanStack, not re-implemented.
 */
export function SectionTreeTableRenderer({
  props,
}: {
  props: SectionTreeTablePayload
}) {
  const {
    columns: specs,
    rows,
    features,
    defaultExpanded,
    emptyText,
    name,
    persistKey,
  } = props

  const [persistenceKey] = React.useState<string | undefined>(() => {
    if (persistKey) return `afframe.tree-table.${persistKey}`
    if (typeof window === "undefined") return undefined
    return `afframe.tree-table.auto:${window.location.pathname}:${name ?? "tree-table"}`
  })

  const columnMenu = useSectionColumnMenu()
  const openInspect = useSectionInspectOpener()
  const hasActionsColumn = features.rowActions
  const idColumnId = specs.find((s) => s.role === "id")?.id ?? specs[0]?.id
  const commitCell = useSectionCellCommit()
  const createOptionCommit = useSectionCreateOption()
  const selectionAnchor = React.useRef<number | null>(null)
  const rowOrderRef = React.useRef<RowOrder<TreeTableRow>>({
    rows: [],
    indexById: new Map(),
  })

  // The nested forest is held as local draft state so inline edits stick; a new
  // `rows` reference (fresh page data) reseeds it — the render-time reset pattern.
  const [data, setData] = React.useState<readonly TreeTableRow[]>(() => rows)
  const [prevRows, setPrevRows] = React.useState(rows)
  if (rows !== prevRows) {
    setPrevRows(rows)
    setData(rows)
  }

  // Race-safe optimistic cell edit (same contract as the flat renderer): the
  // newest edit to a cell owns it; a stale rejection can never clobber a later
  // confirmed value.
  const cellVersionRef = React.useRef<Map<string, number>>(new Map())
  const updateCell = React.useCallback(
    (rowId: string, columnId: string, value: TableCellValue) => {
      const cellKey = `${rowId}::${columnId}`
      const version = (cellVersionRef.current.get(cellKey) ?? 0) + 1
      cellVersionRef.current.set(cellKey, version)

      let prevValue: TableCellValue = null
      setData((prev) =>
        updateNode(prev, rowId, (node) => {
          prevValue = node.values[columnId] ?? null
          return { ...node, values: { ...node.values, [columnId]: value } }
        }),
      )
      if (!commitCell) return
      void Promise.resolve(commitCell({ rowId, columnId, value })).catch(() => {
        if (cellVersionRef.current.get(cellKey) !== version) return
        setData((prev) =>
          updateNode(prev, rowId, (node) =>
            node.values[columnId] !== value
              ? node
              : { ...node, values: { ...node.values, [columnId]: prevValue } },
          ),
        )
      })
    },
    [commitCell],
  )

  // Live option sets for `creatable` columns (seeded from each spec, grown on
  // create) — shared across every row's editor. Mirrors the flat renderer.
  const [optionsByColumn, setOptionsByColumn] = React.useState<
    Record<string, readonly TableColumnOption[]>
  >(() => {
    const seed: Record<string, readonly TableColumnOption[]> = {}
    for (const spec of specs)
      if (spec.creatable) seed[spec.id] = spec.options ?? []
    return seed
  })
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
      if (createOptionCommit)
        void Promise.resolve(
          createOptionCommit({ columnId, value: trimmed }),
        ).catch(() => {})
    },
    [createOptionCommit],
  )

  const columns = React.useMemo<ColumnDef<TreeTableRow>[]>(() => {
    const cols: ColumnDef<TreeTableRow>[] = [
      buildSelectColumn<TreeTableRow>({
        anchorRef: selectionAnchor,
        rowOrderRef,
      }),
    ]

    for (const spec of specs) {
      const align = spec.align ?? (spec.kind === "number" ? "end" : "start")
      const columnInline = spec.edit === "inline" || spec.edit === "both"
      const isIdColumn = spec.id === idColumnId
      cols.push({
        id: spec.id,
        accessorFn: (row) => row.values[spec.id] ?? null,
        header: spec.header,
        size: spec.width ?? 160,
        enableSorting: spec.enableSort ?? true,
        enableHiding: isIdColumn ? false : (spec.enableHide ?? true),
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
          editable: columnInline,
          ...(isIdColumn ? { trailingWidth: 30 } : {}),
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
          const original = row.original
          const isTier = original.selectable === false
          const rowEditable = original.editable !== false
          const inline = columnInline && rowEditable

          // The identity column always renders the tree label (chevron + indent),
          // never an editor — the number/label is the row's stable identity.
          if (isIdColumn) {
            const label = (
              <TreeLabelCell
                row={row}
                label={String(value ?? "")}
                emphasis={isTier}
              />
            )
            if (features.inspect && openInspect && !isTier) {
              return (
                <div className="flex w-full items-center gap-2">
                  <div className="min-w-0 flex-1">{label}</div>
                  <InspectorOpenButton onClick={() => openInspect(original)} />
                </div>
              )
            }
            return label
          }

          // A structural tier node is never editable (its `editable` is false, so
          // `inline` is already false) — it falls through to the read-only display
          // below, where its descriptive columns (e.g. name) show and its absent
          // record columns stay blank.
          const rowId = original.id
          if (inline && spec.kind === "select" && spec.creatable)
            return (
              <CreatableSelectEditCell
                options={optionsByColumn[spec.id] ?? spec.options ?? []}
                value={value}
                ariaLabel={spec.header}
                onCommit={(v) => updateCell(rowId, spec.id, v)}
                onCreate={(v) => handleCreateOption(spec.id, v)}
              />
            )
          if (inline && spec.kind === "select")
            return (
              <SelectEditCell
                spec={spec}
                value={value}
                name={name ? `${name}[${rowId}][${spec.id}]` : undefined}
                onCommit={(v) => updateCell(rowId, spec.id, v)}
              />
            )
          if (inline && (spec.kind === "text" || spec.kind === "number"))
            return (
              <TextEditCell
                value={value}
                numeric={spec.kind === "number"}
                ariaLabel={spec.header}
                name={name ? `${name}[${rowId}][${spec.id}]` : undefined}
                onCommit={(v) => updateCell(rowId, spec.id, v)}
              />
            )
          // Read-only display. On a REAL row an unset enum shows an em dash so a
          // nullable flag (e.g. taxRelevant) reads as "not set", never "No"; on a
          // structural tier node the absent record columns stay blank.
          const emptyEnum = isTier ? null : (
            <span className="text-muted-foreground">—</span>
          )
          if (spec.kind === "badge")
            return value == null || value === "" ? (
              emptyEnum
            ) : (
              <Badge variant="secondary">{optionLabel(spec, value)}</Badge>
            )
          if (spec.kind === "select")
            return value == null || value === "" ? (
              emptyEnum
            ) : (
              <span>{optionLabel(spec, value)}</span>
            )
          if (spec.kind === "number")
            return <GridNumberCell>{value == null ? "" : value}</GridNumberCell>
          return <span>{String(value ?? "")}</span>
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
        cell: ({ row }) =>
          row.original.selectable === false ? null : <RowActionsCell />,
        enableSorting: false,
        enableHiding: false,
        enableResizing: false,
      })
    }

    return cols
  }, [
    specs,
    hasActionsColumn,
    idColumnId,
    features.inspect,
    openInspect,
    name,
    updateCell,
    optionsByColumn,
    handleCreateOption,
  ])

  const columnPinning = React.useMemo<ColumnPinningState>(() => {
    const left = ["select"]
    // Pin the tree-label (identity) column so the hierarchy stays visible while
    // scrolling the value columns horizontally (mirrors the Pivot label pin).
    if (idColumnId) left.push(idColumnId)
    for (const spec of specs)
      if (spec.pin === "left" && spec.id !== idColumnId) left.push(spec.id)
    const right = specs.filter((s) => s.pin === "right").map((s) => s.id)
    if (hasActionsColumn) right.push("actions")
    return { left, right }
  }, [specs, idColumnId, hasActionsColumn])

  const normalizeColumnPinning = React.useCallback(
    (pinning: ColumnPinningState): ColumnPinningState =>
      anchorStructuralPins(pinning, {
        hasSelect: true,
        hasActions: hasActionsColumn,
      }),
    [hasActionsColumn],
  )

  const { table } = useSectionGridTable<TreeTableRow>({
    data: data as TreeTableRow[],
    columns,
    getRowId: (row) => row.id,
    getSubRows: (row) => row.subRows as TreeTableRow[] | undefined,
    getExpandedRowModel: getExpandedRowModel(),
    // Structural tier nodes (Class/Group) are never selectable — a select-all or
    // shift-range must skip them so a grouping header is never swept in.
    enableRowSelection: (row) => row.original.selectable !== false,
    autoResetExpanded: false,
    filterFromLeafRows: true,
    enableGlobalFilter: features.search,
    defaultColumn: { minSize: 56, size: 160, maxSize: 640 },
    normalizeColumnPinning,
    persistenceKey,
    initialState: {
      columnPinning,
    },
  })

  const orderedRows = table.getRowModel().rows
  rowOrderRef.current = React.useMemo(() => {
    const indexById = new Map<string, number>()
    orderedRows.forEach((r, i) => indexById.set(r.id, i))
    return { rows: orderedRows, indexById }
  }, [orderedRows])

  // Seed the initial expansion once (uncontrolled, imperative — the same pattern
  // the Pivot section uses; `initialState.expanded` does not survive `useDataTable`).
  // `autoResetExpanded: false` keeps a later user collapse; a fresh `rows`
  // reference (new page data) re-seeds so a period switch re-derives the default.
  const didExpand = React.useRef<readonly TreeTableRow[] | null>(null)
  React.useEffect(() => {
    if (didExpand.current === rows) return
    didExpand.current = rows
    if (defaultExpanded === true) table.toggleAllRowsExpanded(true)
    else if (defaultExpanded === false) table.toggleAllRowsExpanded(false)
    else table.setExpanded(initialExpanded(rows, defaultExpanded))
  }, [table, defaultExpanded, rows])

  return (
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
