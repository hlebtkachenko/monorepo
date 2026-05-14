"use client"

import * as React from "react"
import {
  type Cell,
  type ColumnDef,
  type RowData,
  type SortingState,
  type TableMeta,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { useVirtualizer, type VirtualItem } from "@tanstack/react-virtual"
import {
  BaselineIcon,
  CalendarIcon,
  CheckSquareIcon,
  File as FileIconBase,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  HashIcon,
  LinkIcon,
  ListChecksIcon,
  ListIcon,
  Presentation,
  TextInitialIcon,
} from "@workspace/ui/lib/icons"

import { cn } from "@workspace/ui/lib/utils"

import { DataGridColumnHeader } from "./data-grid-column-header"
import { DataGridContextMenu } from "./data-grid-context-menu"
import { DataGridPasteDialog } from "./data-grid-paste-dialog"
import { DataGridRow } from "./data-grid-row"
import { DataGridSearch } from "./data-grid-search"

export type RowHeightValue = "short" | "medium" | "tall" | "extra-tall"

export interface CellSelectOption {
  label: string
  value: string
}

export type CellOpts =
  | { variant: "short-text" }
  | { variant: "long-text" }
  | {
      variant: "number"
      min?: number
      max?: number
      step?: number
      decimals?: number
    }
  | { variant: "select"; options: CellSelectOption[] }
  | { variant: "multi-select"; options: CellSelectOption[] }
  | { variant: "checkbox" }
  | { variant: "date" }
  | { variant: "url" }
  | {
      variant: "file"
      maxFileSize?: number
      maxFiles?: number
      accept?: string
      multiple?: boolean
    }

export interface CellUpdate {
  rowIndex: number
  columnId: string
  value: unknown
}

export interface CellPosition {
  rowIndex: number
  columnId: string
}

export interface FileCellData {
  id: string
  name: string
  size: number
  type: string
  url?: string
}

export interface ContextMenuState {
  open: boolean
  x: number
  y: number
}

export interface PasteDialogState {
  open: boolean
  rowsNeeded: number
}

declare module "@tanstack/react-table" {
  // biome-ignore lint/correctness/noUnusedVariables: required for module augmentation
  interface ColumnMeta<TData extends RowData, TValue> {
    label?: string
    cell?: CellOpts
  }

  // biome-ignore lint/correctness/noUnusedVariables: required for module augmentation
  interface TableMeta<TData extends RowData> {
    focusedCell?: CellPosition | null
    editingCell?: CellPosition | null
    rowHeight?: RowHeightValue
    readOnly?: boolean
    onDataUpdate?: (params: CellUpdate | Array<CellUpdate>) => void
    onCellClick?: (rowIndex: number, columnId: string) => void
    onCellDoubleClick?: (rowIndex: number, columnId: string) => void
    onCellContextMenu?: (
      rowIndex: number,
      columnId: string,
      event: React.MouseEvent,
    ) => void
    onCellEditingStart?: (rowIndex: number, columnId: string) => void
    onCellEditingStop?: () => void
    onError?: (message: string) => void
  }
}

export interface DataGridCellProps<TData> {
  cell: Cell<TData, unknown>
  tableMeta: TableMeta<TData> | undefined
  rowIndex: number
  columnId: string
  rowHeight: RowHeightValue
  isEditing: boolean
  isFocused: boolean
  isSelected: boolean
  readOnly: boolean
}

export { flexRender }

export function getCellKey(rowIndex: number, columnId: string): string {
  return `${rowIndex}:${columnId}`
}

export function parseCellKey(key: string): CellPosition {
  const [r, ...rest] = key.split(":")
  if (r === undefined) return { rowIndex: -1, columnId: "" }
  return { rowIndex: Number(r), columnId: rest.join(":") }
}

export function getRowHeightValue(value: RowHeightValue): number {
  switch (value) {
    case "short":
      return 36
    case "medium":
      return 56
    case "tall":
      return 76
    case "extra-tall":
      return 96
  }
}

export function getLineCount(value: RowHeightValue): number {
  switch (value) {
    case "short":
      return 1
    case "medium":
      return 2
    case "tall":
      return 3
    case "extra-tall":
      return 4
  }
}

export function getEmptyCellValue(
  variant: CellOpts["variant"] | undefined,
): unknown {
  if (variant === "multi-select" || variant === "file") return []
  if (variant === "number" || variant === "date") return null
  if (variant === "checkbox") return false
  return ""
}

export function getColumnVariant(variant?: CellOpts["variant"]): {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  label: string
} | null {
  switch (variant) {
    case "short-text":
      return { label: "Short text", icon: BaselineIcon }
    case "long-text":
      return { label: "Long text", icon: TextInitialIcon }
    case "number":
      return { label: "Number", icon: HashIcon }
    case "url":
      return { label: "URL", icon: LinkIcon }
    case "checkbox":
      return { label: "Checkbox", icon: CheckSquareIcon }
    case "select":
      return { label: "Select", icon: ListIcon }
    case "multi-select":
      return { label: "Multi-select", icon: ListChecksIcon }
    case "date":
      return { label: "Date", icon: CalendarIcon }
    case "file":
      return { label: "File", icon: FileIconBase }
    default:
      return null
  }
}

export function getUrlHref(urlString: string): string {
  if (!urlString || urlString.trim() === "") return ""
  const trimmed = urlString.trim()
  if (/^(javascript|data|vbscript|file):/i.test(trimmed)) return ""
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://"))
    return trimmed
  return `http://${trimmed}`
}

export function parseLocalDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value !== "string") return null
  const parts = value.split("-").map(Number)
  const [year, month, day] = parts
  if (!year || !month || !day) return null
  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }
  return date
}

export function formatDateToString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function formatDateForDisplay(value: unknown): string {
  if (!value) return ""
  const date = parseLocalDate(value)
  if (!date) return typeof value === "string" ? value : ""
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function formatFileSize(bytes: number): string {
  if (bytes <= 0 || !Number.isFinite(bytes)) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.min(
    sizes.length - 1,
    Math.floor(Math.log(bytes) / Math.log(k)),
  )
  return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`
}

export function getFileIcon(
  type: string,
): React.ComponentType<React.SVGProps<SVGSVGElement>> {
  if (type.startsWith("image/")) return FileImage
  if (type.startsWith("video/")) return FileVideo
  if (type.startsWith("audio/")) return FileAudio
  if (type.includes("pdf")) return FileText
  if (type.includes("zip") || type.includes("rar")) return FileArchive
  if (type.includes("word") || type.includes("doc")) return FileText
  if (
    type.includes("sheet") ||
    type.includes("excel") ||
    type.includes("xls")
  ) {
    return FileSpreadsheet
  }
  if (type.includes("presentation") || type.includes("ppt")) return Presentation
  return FileIconBase
}

export function parseTsv(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => line.split("\t"))
}

export interface UseDataGridOptions<TData> {
  data: TData[]
  columns: ColumnDef<TData, unknown>[]
  rowHeight?: RowHeightValue
  readOnly?: boolean
  enableSearch?: boolean
  onDataChange?: (data: TData[]) => void
  onError?: (message: string) => void
}

export interface DataGridProps<TData>
  extends
    UseDataGridOptions<TData>,
    Omit<React.ComponentProps<"div">, "onError"> {
  height?: number
}

export function DataGrid<TData>({
  data,
  columns,
  rowHeight = "short",
  readOnly = false,
  enableSearch = false,
  onDataChange,
  onError,
  height = 480,
  className,
  ...props
}: DataGridProps<TData>) {
  const dataGridRef = React.useRef<HTMLDivElement>(null)
  const scrollContainerRef = React.useRef<HTMLDivElement>(null)
  const reactId = React.useId()

  const [sorting, setSorting] = React.useState<SortingState>([])
  const [focusedCell, setFocusedCell] = React.useState<CellPosition | null>(
    null,
  )
  const [editingCell, setEditingCell] = React.useState<CellPosition | null>(
    null,
  )
  const [contextMenu, setContextMenu] = React.useState<ContextMenuState>({
    open: false,
    x: 0,
    y: 0,
  })
  const [pasteDialog, setPasteDialog] = React.useState<PasteDialogState>({
    open: false,
    rowsNeeded: 0,
  })
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [matchIndex, setMatchIndex] = React.useState(0)

  const onDataUpdate = React.useCallback(
    (updates: CellUpdate | Array<CellUpdate>) => {
      if (readOnly) return
      const list = Array.isArray(updates) ? updates : [updates]
      if (list.length === 0) return
      const next = data.map((row, i) => {
        const rowUpdates = list.filter((u) => u.rowIndex === i)
        if (rowUpdates.length === 0) return row
        const merged: Record<string, unknown> = {
          ...(row as Record<string, unknown>),
        }
        for (const u of rowUpdates) merged[u.columnId] = u.value
        return merged as TData
      })
      onDataChange?.(next)
    },
    [data, onDataChange, readOnly],
  )

  const onCellClick = React.useCallback(
    (rowIndex: number, columnId: string) => {
      setFocusedCell({ rowIndex, columnId })
    },
    [],
  )

  const onCellDoubleClick = React.useCallback(
    (rowIndex: number, columnId: string) => {
      if (readOnly) return
      setEditingCell({ rowIndex, columnId })
    },
    [readOnly],
  )

  const onCellEditingStart = React.useCallback(
    (rowIndex: number, columnId: string) => {
      if (readOnly) return
      setEditingCell({ rowIndex, columnId })
      setFocusedCell({ rowIndex, columnId })
    },
    [readOnly],
  )

  const onCellEditingStop = React.useCallback(() => {
    setEditingCell(null)
  }, [])

  const onCellContextMenu = React.useCallback(
    (rowIndex: number, columnId: string, event: React.MouseEvent) => {
      event.preventDefault()
      setFocusedCell({ rowIndex, columnId })
      setContextMenu({ open: true, x: event.clientX, y: event.clientY })
    },
    [],
  )

  const onContextMenuOpenChange = React.useCallback((open: boolean) => {
    setContextMenu((prev) => ({ ...prev, open }))
  }, [])

  const onPasteDialogOpenChange = React.useCallback((open: boolean) => {
    setPasteDialog((prev) => ({ ...prev, open }))
  }, [])

  const onClearCell = React.useCallback(() => {
    if (!focusedCell || readOnly) return
    const column = columns.find(
      (c) =>
        c.id === focusedCell.columnId ||
        (c as { accessorKey?: string }).accessorKey === focusedCell.columnId,
    )
    const variant = column?.meta?.cell?.variant
    onDataUpdate({
      rowIndex: focusedCell.rowIndex,
      columnId: focusedCell.columnId,
      value: getEmptyCellValue(variant),
    })
    setContextMenu((prev) => ({ ...prev, open: false }))
  }, [columns, focusedCell, onDataUpdate, readOnly])

  const onCopyCell = React.useCallback(() => {
    if (!focusedCell) return
    const row = data[focusedCell.rowIndex] as
      | Record<string, unknown>
      | undefined
    if (!row) return
    const value = row[focusedCell.columnId]
    const text = value == null ? "" : String(value)
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {
        onError?.("Failed to copy cell value")
      })
    }
    setContextMenu((prev) => ({ ...prev, open: false }))
  }, [data, focusedCell, onError])

  const onCutCell = React.useCallback(() => {
    onCopyCell()
    onClearCell()
  }, [onCopyCell, onClearCell])

  const onPasteRequest = React.useCallback(
    async (expand: boolean) => {
      setPasteDialog({ open: false, rowsNeeded: 0 })
      if (!focusedCell || readOnly) return
      try {
        const text = await navigator.clipboard.readText()
        const rows = parseTsv(text)
        if (rows.length === 0) return
        const colIndex = columns.findIndex(
          (c) =>
            c.id === focusedCell.columnId ||
            (c as { accessorKey?: string }).accessorKey ===
              focusedCell.columnId,
        )
        if (colIndex < 0) return
        const updates: CellUpdate[] = []
        const limit = expand
          ? rows.length
          : Math.min(rows.length, data.length - focusedCell.rowIndex)
        for (let r = 0; r < limit; r++) {
          const cells = rows[r] ?? []
          for (let c = 0; c < cells.length; c++) {
            const targetCol = columns[colIndex + c]
            const columnId =
              targetCol?.id ??
              (targetCol as { accessorKey?: string } | undefined)?.accessorKey
            if (!columnId) continue
            updates.push({
              rowIndex: focusedCell.rowIndex + r,
              columnId,
              value: cells[c],
            })
          }
        }
        onDataUpdate(updates)
      } catch {
        onError?.("Failed to read clipboard")
      }
    },
    [columns, data.length, focusedCell, onDataUpdate, onError, readOnly],
  )

  const tableMeta = React.useMemo<TableMeta<TData>>(
    () => ({
      focusedCell,
      editingCell,
      rowHeight,
      readOnly,
      onDataUpdate,
      onCellClick,
      onCellDoubleClick,
      onCellContextMenu,
      onCellEditingStart,
      onCellEditingStop,
      onError,
    }),
    [
      focusedCell,
      editingCell,
      rowHeight,
      readOnly,
      onDataUpdate,
      onCellClick,
      onCellDoubleClick,
      onCellContextMenu,
      onCellEditingStart,
      onCellEditingStop,
      onError,
    ],
  )

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    meta: tableMeta,
  })

  const rows = table.getRowModel().rows

  const searchMatches = React.useMemo<CellPosition[]>(() => {
    if (!enableSearch || !searchQuery.trim()) return []
    const q = searchQuery.toLowerCase()
    const matches: CellPosition[] = []
    rows.forEach((row, rowIndex) => {
      for (const cell of row.getVisibleCells()) {
        const v = cell.getValue()
        if (v == null) continue
        const s = Array.isArray(v) ? v.join(",") : String(v)
        if (s.toLowerCase().includes(q)) {
          matches.push({ rowIndex, columnId: cell.column.id })
        }
      }
    })
    return matches
  }, [enableSearch, rows, searchQuery])

  React.useEffect(() => {
    if (matchIndex >= searchMatches.length) setMatchIndex(0)
  }, [matchIndex, searchMatches.length])

  const activeSearchMatch = searchMatches[matchIndex] ?? null
  const searchMatchKeys = React.useMemo(() => {
    const set = new Set<string>()
    for (const m of searchMatches) set.add(getCellKey(m.rowIndex, m.columnId))
    return set
  }, [searchMatches])

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => getRowHeightValue(rowHeight),
    overscan: 8,
    initialRect: { width: 800, height },
    observeElementRect: (instance, cb) => {
      const element = instance.scrollElement as HTMLElement | null
      if (!element) return
      const targetWindow = instance.targetWindow
      const update = () => {
        const rect = element.getBoundingClientRect()
        const fallbackHeight = rect.height > 0 ? rect.height : height
        const fallbackWidth = rect.width > 0 ? rect.width : 800
        cb({
          width: Math.round(fallbackWidth),
          height: Math.round(fallbackHeight),
        })
      }
      update()
      if (!targetWindow?.ResizeObserver) return
      const observer = new targetWindow.ResizeObserver(() => update())
      observer.observe(element, { box: "border-box" })
      return () => observer.unobserve(element)
    },
  })

  const virtualItems = rowVirtualizer.getVirtualItems()
  const totalSize = rowVirtualizer.getTotalSize()

  React.useEffect(() => {
    if (!enableSearch) return
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        if (!dataGridRef.current?.contains(document.activeElement)) return
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [enableSearch])

  const gridTemplateColumns = React.useMemo(() => {
    return columns
      .map((column) => {
        const size = (column as { size?: number }).size
        if (typeof size === "number" && Number.isFinite(size) && size > 0) {
          return `${size}px`
        }
        return "minmax(120px, 1fr)"
      })
      .join(" ")
  }, [columns])

  return (
    <div
      data-slot="data-grid"
      ref={dataGridRef}
      {...props}
      className={cn("relative flex w-full flex-col gap-2", className)}
    >
      {enableSearch && (
        <DataGridSearch
          searchOpen={searchOpen}
          onSearchOpenChange={setSearchOpen}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          matchIndex={matchIndex}
          matchCount={searchMatches.length}
          onNavigateNext={() =>
            setMatchIndex((i) =>
              searchMatches.length === 0 ? 0 : (i + 1) % searchMatches.length,
            )
          }
          onNavigatePrev={() =>
            setMatchIndex((i) =>
              searchMatches.length === 0
                ? 0
                : (i - 1 + searchMatches.length) % searchMatches.length,
            )
          }
        />
      )}
      <DataGridContextMenu
        contextMenu={contextMenu}
        readOnly={readOnly}
        onOpenChange={onContextMenuOpenChange}
        onCopy={onCopyCell}
        onCut={onCutCell}
        onClear={onClearCell}
        onPaste={() => setPasteDialog({ open: true, rowsNeeded: 0 })}
      />
      <DataGridPasteDialog
        pasteDialog={pasteDialog}
        onOpenChange={onPasteDialogOpenChange}
        onConfirm={onPasteRequest}
      />
      <div
        role="grid"
        aria-rowcount={rows.length}
        aria-colcount={columns.length}
        ref={scrollContainerRef}
        className="relative overflow-auto rounded-md border bg-background focus:outline-none"
        style={{ maxHeight: `${height}px` }}
        tabIndex={0}
      >
        <div
          role="rowgroup"
          data-slot="data-grid-header"
          className="sticky top-0 z-10 border-b bg-background"
        >
          {table.getHeaderGroups().map((headerGroup, rowIndex) => (
            <div
              key={headerGroup.id}
              role="row"
              aria-rowindex={rowIndex + 1}
              className="grid w-full"
              style={{ gridTemplateColumns }}
            >
              {headerGroup.headers.map((header, colIndex) => (
                <div
                  key={header.id}
                  role="columnheader"
                  aria-colindex={colIndex + 1}
                  className="relative min-w-0 border-r last:border-r-0"
                >
                  {header.isPlaceholder ? null : (
                    <DataGridColumnHeader header={header} />
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div
          role="rowgroup"
          data-slot="data-grid-body"
          className="relative"
          style={{ height: `${totalSize}px` }}
        >
          {virtualItems.map((virtualItem: VirtualItem) => {
            const row = rows[virtualItem.index]
            if (!row) return null
            return (
              <DataGridRow
                key={`${reactId}-${row.id}`}
                row={row}
                tableMeta={tableMeta}
                virtualItem={virtualItem}
                rowHeight={rowHeight}
                focusedCell={focusedCell}
                editingCell={editingCell}
                searchMatchKeys={searchMatchKeys}
                activeSearchMatch={activeSearchMatch}
                readOnly={readOnly}
                gridTemplateColumns={gridTemplateColumns}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
