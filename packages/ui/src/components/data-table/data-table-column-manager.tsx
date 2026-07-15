"use client"

import type { Column, Table } from "@tanstack/react-table"
import * as React from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Separator } from "@workspace/ui/components/separator"
import {
  CheckIcon,
  Columns3,
  GripVertical,
  RotateCcw,
} from "@workspace/ui/lib/icons"
import { cn } from "@workspace/ui/lib/utils"

import {
  commitCenter,
  getCenterIds,
} from "../data-grid-view/data-grid-view-column-header"
import { getColumnLabel } from "./data-table-utils"

/**
 * Move `sourceId` before/after `targetId` within the non-pinned centre group,
 * leaving the left/right pinned groups in place. The centre-extract + pin-edge
 * reassembly is the SAME invariant the grid's own header drag uses, so it reuses
 * the exported `getCenterIds` / `commitCenter` rather than a private second copy.
 */
function reorderColumn<TData>(
  table: Table<TData>,
  sourceId: string,
  targetId: string,
  edge: "top" | "bottom",
) {
  if (sourceId === targetId) return
  const center = getCenterIds(table)
  const from = center.indexOf(sourceId)
  if (from < 0) return
  const next = [...center]
  const [moved] = next.splice(from, 1)
  if (moved == null) return
  const to = next.indexOf(targetId)
  if (to < 0) return
  next.splice(edge === "top" ? to : to + 1, 0, moved)
  commitCenter(table, next)
}

/** The top-level (root) ancestor of a column — the pivot high-level group a value
 *  leaf sits under. A root column returns itself. */
function rootColumn<TData>(column: Column<TData>): Column<TData> {
  let c = column
  while (c.parent) c = c.parent
  return c
}

/** The value-leaf blocks (one per high-level group), in current display order.
 *  Value leaves are the VISIBLE leaves that sit under a group (`parent` set). */
function groupBlocks<TData>(
  table: Table<TData>,
): { id: string; leafIds: string[] }[] {
  const blocks: { id: string; leafIds: string[] }[] = []
  const byId = new Map<string, { id: string; leafIds: string[] }>()
  for (const leaf of table.getVisibleLeafColumns()) {
    if (!leaf.parent) continue
    const id = rootColumn(leaf).id
    let block = byId.get(id)
    if (!block) {
      block = { id, leafIds: [] }
      byId.set(id, block)
      blocks.push(block)
    }
    block.leafIds.push(leaf.id)
  }
  return blocks
}

/**
 * Re-emit `columnOrder` from reordered value blocks: the non-value leaves
 * (select / row-label) stay leading in their current order, then each group
 * block's visible leaves. A HIDDEN value leaf (a hidden measure's per-group leaf)
 * is re-inserted RIGHT AFTER its own group's block — never dumped in a global
 * tail — so re-showing it lands it back inside its group and the banded header
 * can't split into two cells. Leaves of a fully-hidden group (no surviving block)
 * stay mutually contiguous at the tail (re-showing them can't split a header
 * either). With nothing hidden this is byte-identical to `[leading, ...blocks]`.
 */
function commitBlocks<TData>(
  table: Table<TData>,
  blocks: { id: string; leafIds: string[] }[],
): void {
  const valueOrder = blocks.flatMap((b) => b.leafIds)
  const valueSet = new Set(valueOrder)
  const leading = table
    .getVisibleLeafColumns()
    .map((l) => l.id)
    .filter((id) => !valueSet.has(id))
  const leadingSet = new Set(leading)
  const blockIds = new Set(blocks.map((b) => b.id))
  const hiddenByGroup = new Map<string, string[]>()
  const orphanHidden: string[] = []
  for (const leaf of table.getAllLeafColumns()) {
    if (valueSet.has(leaf.id) || leadingSet.has(leaf.id)) continue
    const rootId = leaf.parent ? rootColumn(leaf).id : leaf.id
    if (leaf.parent && blockIds.has(rootId)) {
      const list = hiddenByGroup.get(rootId)
      if (list) list.push(leaf.id)
      else hiddenByGroup.set(rootId, [leaf.id])
    } else {
      orphanHidden.push(leaf.id)
    }
  }
  const order = [...leading]
  for (const block of blocks) {
    order.push(...block.leafIds, ...(hiddenByGroup.get(block.id) ?? []))
  }
  order.push(...orphanHidden)
  table.setColumnOrder(order)
}

/** Move high-level group `sourceId` before/after `targetId` among the groups. */
function reorderGroups<TData>(
  table: Table<TData>,
  sourceId: string,
  targetId: string,
  edge: "top" | "bottom",
): void {
  if (sourceId === targetId) return
  const blocks = groupBlocks(table)
  const from = blocks.findIndex((b) => b.id === sourceId)
  if (from < 0) return
  const next = [...blocks]
  const [moved] = next.splice(from, 1)
  if (!moved) return
  const to = next.findIndex((b) => b.id === targetId)
  if (to < 0) return
  next.splice(edge === "top" ? to : to + 1, 0, moved)
  commitBlocks(table, next)
}

/**
 * Move measure `sourceLabel` before/after `targetLabel` WITHIN EVERY group, so
 * the same measure order applies across ALL high-level groups — the "drag one
 * Orders switch, it moves Orders under every group" behaviour.
 */
function reorderMeasures<TData>(
  table: Table<TData>,
  sourceLabel: string,
  targetLabel: string,
  edge: "top" | "bottom",
): void {
  if (sourceLabel === targetLabel) return
  const next = groupBlocks(table).map((block) => {
    const labeled = block.leafIds.map((id) => ({
      id,
      label: getColumnLabel(table.getColumn(id)),
    }))
    const from = labeled.findIndex((l) => l.label === sourceLabel)
    if (from < 0) return block
    const arr = [...labeled]
    const [moved] = arr.splice(from, 1)
    if (!moved) return block
    const to = arr.findIndex((l) => l.label === targetLabel)
    if (to < 0) return block
    arr.splice(edge === "top" ? to : to + 1, 0, moved)
    return { ...block, leafIds: arr.map((l) => l.id) }
  })
  commitBlocks(table, next)
}

/**
 * The column manager body — pinned + unpinned sections (divider between), each
 * row a grey grip handle (drag to reorder), a black column label, and a
 * right-edge Checkbox that toggles visibility. Unpinned rows reorder via drag
 * (writing the table's `columnOrder`); pinned rows stay in their pinned area
 * (grip is decorative there). Generic over any TanStack `Table<TData>` — reads
 * only `getCanHide` / `getIsVisible` / `getIsPinned` / column order.
 *
 * Render it inside any surface — the toolbar "Columns" popover (see
 * `DataTableColumnManager`) or a grid's "+ Add column" trigger.
 */
/**
 * Toggle a column's visibility. For a GROUP column (a pivot high-level header
 * that spans several value columns) TanStack's own `toggleVisibility` does NOT
 * cascade — hiding the group id leaves the leaves visible. So cascade to the
 * group's leaf columns; a plain leaf's `getLeafColumns()` is just itself, so the
 * same call handles both.
 */
function setColumnVisibility<TData>(
  column: Column<TData>,
  visible: boolean,
): void {
  const leaves = column.getLeafColumns()
  const isGroup = !(leaves.length === 1 && leaves[0]?.id === column.id)
  if (!isGroup) {
    column.toggleVisibility(visible)
    return
  }
  for (const leaf of leaves)
    if (leaf.getCanHide()) leaf.toggleVisibility(visible)
}

/** What a manager row reorders when dragged: a flat centre column, a pivot
 *  high-level group, or a deduped pivot measure (applied across every group). */
type DragKind = "column" | "group" | "measure"

export function ColumnManagerMenuContent<TData>({
  table,
}: {
  table: Table<TData>
}) {
  // Drag carries its KIND so a group drag only lands on group rows, a measure
  // drag only on measure rows, etc. `id` is the column id (column/group) or the
  // measure label (measure).
  const [drag, setDrag] = React.useState<{ id: string; kind: DragKind } | null>(
    null,
  )
  const [dropTarget, setDropTarget] = React.useState<{
    id: string
    edge: "top" | "bottom"
  } | null>(null)

  // Pinned groups render in TanStack's own pinning order (`columnPinning.left`
  // / `.right`) — dragging a pinned header writes those arrays, not
  // `columnOrder`, so the manager must read the same source to stay in sync.
  // The unpinned centre group still follows `columnOrder`, falling back to
  // definition order (via the stable sort) for ids it doesn't mention.
  const { left: pinnedLeftIds = [], right: pinnedRightIds = [] } =
    table.getState().columnPinning
  const orderIds = table.getState().columnOrder
  const orderIndex = (id: string) => {
    const index = orderIds.indexOf(id)
    return index === -1 ? Number.MAX_SAFE_INTEGER : index
  }
  const columns = table.getAllColumns().filter((column) => column.getCanHide())
  const columnById = new Map(columns.map((column) => [column.id, column]))

  const pinnedLeft = pinnedLeftIds
    .map((id) => columnById.get(id))
    .filter((column): column is NonNullable<typeof column> => column != null)
  const pinnedRight = pinnedRightIds
    .map((id) => columnById.get(id))
    .filter((column): column is NonNullable<typeof column> => column != null)
  const pinnedIds = new Set([...pinnedLeftIds, ...pinnedRightIds])
  const unpinned = columns
    .filter((column) => !pinnedIds.has(column.id))
    .sort((a, b) => orderIndex(a.id) - orderIndex(b.id))

  // Pivot (grouped columns): the top-level rows ARE the high-level group headers;
  // the value columns are their leaves, deduped by label into ONE low-level entry
  // per measure — so an "Orders" toggle hides Orders under EVERY group.
  const hasGroups = columns.some((column) => (column.columns?.length ?? 0) > 0)
  const measureEntries: { label: string; cols: Column<TData>[] }[] = []
  if (hasGroups) {
    const byLabel = new Map<string, Column<TData>[]>()
    for (const leaf of table.getAllLeafColumns()) {
      if (!leaf.parent || !leaf.getCanHide()) continue
      const label = getColumnLabel(leaf)
      const list = byLabel.get(label)
      if (list) list.push(leaf)
      else byLabel.set(label, [leaf])
    }
    for (const [label, cols] of byLabel) measureEntries.push({ label, cols })
  }

  /** A deduped low-level (measure) row: one switch that toggles that measure's
   *  column under every group at once, and a grip that DRAGS the measure to a new
   *  position across EVERY group (`reorderMeasures`). Keyed by the measure label. */
  const renderMeasureRow = ({
    label,
    cols,
  }: {
    label: string
    cols: Column<TData>[]
  }) => {
    const visible = cols.some((c) => c.getIsVisible())
    const toggle = () => cols.forEach((c) => c.toggleVisibility(!visible))
    const over = dropTarget?.id === label
    return (
      <div key={`measure:${label}`} className="relative">
        {over && dropTarget.edge === "top" ? (
          <span className="pointer-events-none absolute inset-x-1 top-0 z-10 h-0.5 -translate-y-1/2 rounded-full bg-foreground" />
        ) : null}
        <div
          onDragOver={(event) => {
            if (!drag || drag.kind !== "measure" || drag.id === label) return
            event.preventDefault()
            event.stopPropagation()
            event.dataTransfer.dropEffect = "move"
            const rect = event.currentTarget.getBoundingClientRect()
            const edge =
              event.clientY < rect.top + rect.height / 2 ? "top" : "bottom"
            setDropTarget({ id: label, edge })
          }}
          onDrop={(event) => {
            event.preventDefault()
            event.stopPropagation()
            if (drag && drag.kind === "measure")
              reorderMeasures(table, drag.id, label, dropTarget?.edge ?? "top")
            setDrag(null)
            setDropTarget(null)
          }}
          className={cn(
            "group/col flex items-center rounded-sm hover:bg-accent",
            drag?.kind === "measure" && drag.id === label && "opacity-40",
          )}
        >
          <span
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move"
              event.dataTransfer.setData("text/plain", label)
              setDrag({ id: label, kind: "measure" })
            }}
            onDragEnd={() => {
              setDrag(null)
              setDropTarget(null)
            }}
            className="flex h-8 w-6 shrink-0 cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing"
          >
            <GripVertical className="size-4" />
          </span>
          <div
            role="button"
            tabIndex={0}
            onClick={toggle}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                toggle()
              }
            }}
            aria-label={visible ? `Hide ${label}` : `Show ${label}`}
            aria-pressed={visible}
            className="flex h-8 flex-1 cursor-pointer items-center gap-2 rounded-sm pr-2.5 text-left text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <span className="flex-1 truncate text-foreground">{label}</span>
            <span
              aria-hidden
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
                visible
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input",
              )}
            >
              {visible ? <CheckIcon className="size-3.5" /> : null}
            </span>
          </div>
        </div>
        {over && dropTarget.edge === "bottom" ? (
          <span className="pointer-events-none absolute inset-x-1 bottom-0 z-10 h-0.5 translate-y-1/2 rounded-full bg-foreground" />
        ) : null}
      </div>
    )
  }

  const renderRow = (column: (typeof columns)[number], kind?: DragKind) => {
    const draggable = kind !== undefined
    const visible = column.getIsVisible()
    const label = getColumnLabel(column)
    const over = dropTarget?.id === column.id
    return (
      <div key={column.id} className="relative">
        {over && dropTarget.edge === "top" ? (
          <span className="pointer-events-none absolute inset-x-1 top-0 z-10 h-0.5 -translate-y-1/2 rounded-full bg-foreground" />
        ) : null}
        {/* The whole row is one toggle target (like a menu checkbox item); the
            grip is the only drag handle so a click anywhere else flips
            visibility. Checkbox is a trailing state indicator, not its own hit
            target. */}
        <div
          onDragOver={(event) => {
            if (!drag || drag.kind !== kind || drag.id === column.id) return
            event.preventDefault()
            event.stopPropagation()
            event.dataTransfer.dropEffect = "move"
            const rect = event.currentTarget.getBoundingClientRect()
            const edge =
              event.clientY < rect.top + rect.height / 2 ? "top" : "bottom"
            setDropTarget({ id: column.id, edge })
          }}
          onDrop={(event) => {
            event.preventDefault()
            event.stopPropagation()
            if (drag && drag.kind === kind) {
              const edge = dropTarget?.edge ?? "top"
              if (kind === "group")
                reorderGroups(table, drag.id, column.id, edge)
              else reorderColumn(table, drag.id, column.id, edge)
            }
            setDrag(null)
            setDropTarget(null)
          }}
          className={cn(
            "group/col flex items-center rounded-sm hover:bg-accent",
            drag?.id === column.id && "opacity-40",
          )}
        >
          <span
            draggable={draggable}
            onDragStart={
              kind !== undefined
                ? (event) => {
                    event.dataTransfer.effectAllowed = "move"
                    event.dataTransfer.setData("text/plain", column.id)
                    setDrag({ id: column.id, kind })
                  }
                : undefined
            }
            onDragEnd={() => {
              setDrag(null)
              setDropTarget(null)
            }}
            className={cn(
              "flex h-8 w-6 shrink-0 items-center justify-center text-muted-foreground",
              draggable ? "cursor-grab active:cursor-grabbing" : "opacity-40",
            )}
          >
            <GripVertical className="size-4" />
          </span>
          {/* role="button" on a div, NOT a real <button>: the trailing Checkbox
              is a Radix <button role="checkbox"> and a button can't nest a
              button (invalid HTML + hydration error). The checkbox is a
              decorative, aria-hidden state indicator; the row div owns the
              toggle semantics (aria-pressed) + keyboard. */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => setColumnVisibility(column, !visible)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                setColumnVisibility(column, !visible)
              }
            }}
            aria-label={visible ? `Hide ${label}` : `Show ${label}`}
            aria-pressed={visible}
            className="flex h-8 flex-1 cursor-pointer items-center gap-2 rounded-sm pr-2.5 text-left text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <span className="flex-1 truncate text-foreground">{label}</span>
            {/* Non-interactive state indicator mirroring the Checkbox look — a
                real <Checkbox> is a <button role="checkbox">, which axe flags as
                nested-interactive inside the row's role="button". */}
            <span
              aria-hidden
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
                visible
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input",
              )}
            >
              {visible ? <CheckIcon className="size-3.5" /> : null}
            </span>
          </div>
        </div>
        {over && dropTarget.edge === "bottom" ? (
          <span className="pointer-events-none absolute inset-x-1 bottom-0 z-10 h-0.5 translate-y-1/2 rounded-full bg-foreground" />
        ) : null}
      </div>
    )
  }

  const sectionLabel = (text: string) => (
    <div className="px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">
      {text}
    </div>
  )

  return (
    <>
      {pinnedLeft.length > 0 ? (
        <>
          {sectionLabel("Pinned left")}
          {pinnedLeft.map((column) => renderRow(column))}
        </>
      ) : null}
      {pinnedRight.length > 0 ? (
        <>
          {pinnedLeft.length > 0 ? <Separator className="my-1" /> : null}
          {sectionLabel("Pinned right")}
          {pinnedRight.map((column) => renderRow(column))}
        </>
      ) : null}
      {unpinned.length > 0 ? (
        <>
          {pinnedLeft.length > 0 || pinnedRight.length > 0 ? (
            <Separator className="my-1" />
          ) : null}
          {sectionLabel(hasGroups ? "High-level columns" : "Unpinned")}
          {/* Pivot: high-level rows DRAG to reorder groups; a flat table's rows
              drag to reorder the centre column order. */}
          {unpinned.map((column) =>
            renderRow(column, hasGroups ? "group" : "column"),
          )}
        </>
      ) : null}
      {measureEntries.length > 0 ? (
        <>
          <Separator className="my-1" />
          {sectionLabel("Low-level columns")}
          {measureEntries.map((entry) => renderMeasureRow(entry))}
        </>
      ) : null}
      {/* Pinned to the bottom of the (scrolling) popover: reset the whole column
          layout — widths, order, AND pinning — back to the section defaults.
          `resetColumnSizing(true)` clears widths so `getSize()` falls back to each
          def `size`; `resetColumnOrder(true)` clears the custom order (definition
          order returns); `resetColumnPinning()` restores `initialState` pinning
          (the structural select-left / actions-right anchors). The layout
          persistence then rewrites the reset state on the next change. */}
      <div className="sticky bottom-0 z-10 -mx-1 mt-1 border-t bg-popover px-1 pt-1">
        <button
          type="button"
          onClick={() => {
            table.resetColumnSizing(true)
            table.resetColumnOrder(true)
            table.resetColumnPinning()
          }}
          className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-sm px-2 text-left text-sm text-foreground outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring"
        >
          <RotateCcw className="size-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate">Reset column layout</span>
        </button>
      </div>
    </>
  )
}

/**
 * Ready-made toolbar control: an outline "Columns" button opening a Popover with
 * the `ColumnManagerMenuContent` list. A Popover (not a menu) so the checkboxes
 * and drag handles behave as normal interactive content.
 */
export function DataTableColumnManager<TData>({
  table,
  label = "Columns",
  triggerSize = "sm",
  disabled = false,
}: {
  table: Table<TData>
  label?: string
  /** Trigger button size — defaults to `sm` for legacy toolbars. */
  triggerSize?: React.ComponentProps<typeof Button>["size"]
  /** Disable the trigger (popover can't open). */
  disabled?: boolean
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size={triggerSize} disabled={disabled}>
          <Columns3 />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-96 w-64 overflow-y-auto p-1">
        <ColumnManagerMenuContent table={table} />
      </PopoverContent>
    </Popover>
  )
}
