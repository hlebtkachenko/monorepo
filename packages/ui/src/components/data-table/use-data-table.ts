"use client"

import {
  type ColumnFiltersState,
  type ColumnOrderState,
  type ColumnPinningState,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  type TableOptions,
  type TableState,
  type Updater,
  type VisibilityState,
  getCoreRowModel,
  getFacetedMinMaxValues,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import * as React from "react"

import type { ExtendedColumnSort } from "./data-table-utils"

interface ReadonlyURLSearchParamsLike {
  get(name: string): string | null
  getAll(name: string): string[]
  has(name: string): boolean
  toString(): string
  forEach(callback: (value: string, key: string) => void): void
}

export interface UseDataTableQueryKeys {
  page: string
  perPage: string
  sort: string
}

const DEFAULT_QUERY_KEYS: UseDataTableQueryKeys = {
  page: "page",
  perPage: "perPage",
  sort: "sort",
}

type DataTableInitialState<TData> = Omit<Partial<TableState>, "sorting"> & {
  sorting?: ExtendedColumnSort<TData>[]
}

interface UseDataTableProps<TData> extends Omit<
  TableOptions<TData>,
  "state" | "pageCount" | "getCoreRowModel"
> {
  initialState?: DataTableInitialState<TData>
  pageCount?: number
  /**
   * Router-agnostic source of URL search params. Pass a `URLSearchParams` or
   * Next's `ReadonlyURLSearchParams`. When omitted, the hook keeps all state
   * locally.
   */
  searchParams?: URLSearchParams | ReadonlyURLSearchParamsLike
  /**
   * Notified whenever the table state would update the URL. Implement this in
   * your router layer (e.g. `router.replace(`?${params}`)`).
   */
  onParamsChange?: (params: URLSearchParams) => void
  queryKeys?: Partial<UseDataTableQueryKeys>
  /**
   * Optional invariant applied to every `columnPinning` write (which is now
   * controlled here). Use it to keep structural columns anchored — e.g. a
   * leading `select` first in `left` and a trailing `actions` last in `right`
   * — so a user pinning a data column via the header menu can never land it
   * outside those anchors.
   */
  normalizeColumnPinning?: (pinning: ColumnPinningState) => ColumnPinningState
}

function readPagination(
  params: URLSearchParams | ReadonlyURLSearchParamsLike | undefined,
  keys: UseDataTableQueryKeys,
  fallback: PaginationState,
): PaginationState {
  if (!params) return fallback
  const pageRaw = params.get(keys.page)
  const perPageRaw = params.get(keys.perPage)
  const page = pageRaw ? Number.parseInt(pageRaw, 10) : NaN
  const perPage = perPageRaw ? Number.parseInt(perPageRaw, 10) : NaN
  return {
    pageIndex:
      Number.isFinite(page) && page > 0 ? page - 1 : fallback.pageIndex,
    pageSize:
      Number.isFinite(perPage) && perPage > 0 ? perPage : fallback.pageSize,
  }
}

function readSorting<TData>(
  params: URLSearchParams | ReadonlyURLSearchParamsLike | undefined,
  keys: UseDataTableQueryKeys,
  fallback: ExtendedColumnSort<TData>[],
): ExtendedColumnSort<TData>[] {
  if (!params) return fallback
  const raw = params.get(keys.sort)
  if (!raw) return fallback
  return raw
    .split(",")
    .map<ExtendedColumnSort<TData> | null>((entry) => {
      const trimmed = entry.trim()
      if (!trimmed) return null
      const desc = trimmed.startsWith("-")
      const id = (desc ? trimmed.slice(1) : trimmed) as Extract<
        keyof TData,
        string
      >
      if (!id) return null
      return { id, desc }
    })
    .filter((sort): sort is ExtendedColumnSort<TData> => sort !== null)
}

function paramsToURLSearchParams(
  source: URLSearchParams | ReadonlyURLSearchParamsLike,
): URLSearchParams {
  if (source instanceof URLSearchParams) {
    return new URLSearchParams(source)
  }
  const next = new URLSearchParams()
  source.forEach((value, key) => {
    next.append(key, value)
  })
  return next
}

function writePagination(
  params: URLSearchParams,
  keys: UseDataTableQueryKeys,
  state: PaginationState,
  initial: PaginationState,
) {
  if (state.pageIndex === initial.pageIndex) {
    params.delete(keys.page)
  } else {
    params.set(keys.page, String(state.pageIndex + 1))
  }
  if (state.pageSize === initial.pageSize) {
    params.delete(keys.perPage)
  } else {
    params.set(keys.perPage, String(state.pageSize))
  }
}

function writeSorting(
  params: URLSearchParams,
  keys: UseDataTableQueryKeys,
  state: SortingState,
) {
  if (state.length === 0) {
    params.delete(keys.sort)
    return
  }
  const serialized = state
    .map((sort) => `${sort.desc ? "-" : ""}${sort.id}`)
    .join(",")
  params.set(keys.sort, serialized)
}

export function useDataTable<TData>(props: UseDataTableProps<TData>) {
  const {
    columns,
    data,
    initialState,
    searchParams,
    onParamsChange,
    queryKeys,
    pageCount,
    normalizeColumnPinning,
    ...tableProps
  } = props

  const keys = React.useMemo<UseDataTableQueryKeys>(
    () => ({ ...DEFAULT_QUERY_KEYS, ...queryKeys }),
    [queryKeys],
  )

  const initialPagination = React.useMemo<PaginationState>(
    () => ({
      pageIndex: initialState?.pagination?.pageIndex ?? 0,
      pageSize: initialState?.pagination?.pageSize ?? 10,
    }),
    [initialState?.pagination?.pageIndex, initialState?.pagination?.pageSize],
  )

  const initialSorting = React.useMemo<ExtendedColumnSort<TData>[]>(
    () => initialState?.sorting ?? [],
    [initialState?.sorting],
  )

  const [pagination, setPagination] = React.useState<PaginationState>(() =>
    readPagination(searchParams, keys, initialPagination),
  )
  const [sorting, setSorting] = React.useState<SortingState>(
    () =>
      readSorting<TData>(searchParams, keys, initialSorting) as SortingState,
  )
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    initialState?.columnFilters ?? [],
  )
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>(initialState?.columnVisibility ?? {})
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>(
    initialState?.rowSelection ?? {},
  )
  // Column pinning + order are controlled here (they were seed-only before, so
  // the renderer could neither normalize a dynamic pin nor observe reorders
  // without the JSON-signature hack). Sizing stays uncontrolled on purpose:
  // the grid resizes live through CSS vars, and controlling it would re-render
  // every cell on each mouse-move during a drag-resize.
  const normalizePinningRef = React.useRef(normalizeColumnPinning)
  React.useEffect(() => {
    normalizePinningRef.current = normalizeColumnPinning
  }, [normalizeColumnPinning])
  const [columnPinning, setColumnPinning] = React.useState<ColumnPinningState>(
    () => {
      const seed = initialState?.columnPinning ?? {}
      return normalizeColumnPinning ? normalizeColumnPinning(seed) : seed
    },
  )
  const [columnOrder, setColumnOrder] = React.useState<ColumnOrderState>(
    initialState?.columnOrder ?? [],
  )

  const onColumnPinningChange = React.useCallback(
    (updater: Updater<ColumnPinningState>) => {
      setColumnPinning((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater
        const normalize = normalizePinningRef.current
        return normalize ? normalize(next) : next
      })
    },
    [],
  )
  const onColumnOrderChange = React.useCallback(
    (updater: Updater<ColumnOrderState>) => {
      setColumnOrder((prev) =>
        typeof updater === "function" ? updater(prev) : updater,
      )
    },
    [],
  )

  const onParamsChangeRef = React.useRef(onParamsChange)
  React.useEffect(() => {
    onParamsChangeRef.current = onParamsChange
  }, [onParamsChange])

  const emitParams = React.useCallback(
    (nextPagination: PaginationState, nextSorting: SortingState) => {
      const callback = onParamsChangeRef.current
      if (!callback) return
      const base = searchParams
        ? paramsToURLSearchParams(searchParams)
        : new URLSearchParams()
      writePagination(base, keys, nextPagination, initialPagination)
      writeSorting(base, keys, nextSorting)
      callback(base)
    },
    [initialPagination, keys, searchParams],
  )

  const onPaginationChange = React.useCallback(
    (updater: Updater<PaginationState>) => {
      setPagination((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater
        emitParams(next, sorting)
        return next
      })
    },
    [emitParams, sorting],
  )

  const onSortingChange = React.useCallback(
    (updater: Updater<SortingState>) => {
      setSorting((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater
        emitParams(pagination, next)
        return next
      })
    },
    [emitParams, pagination],
  )

  const table = useReactTable<TData>({
    // Pagination is controlled here, so TanStack's data-change page reset would
    // fire `onPaginationChange` (a setState) during render. Default it off;
    // consumers can re-enable via `tableProps`.
    autoResetPageIndex: false,
    ...tableProps,
    columns,
    data,
    ...(pageCount !== undefined ? { pageCount } : {}),
    // Column sizing stays uncontrolled (live CSS-var resize), so it is the only
    // slice still seeded via initialState. Spread only when set — passing
    // `undefined` would clobber TanStack's default (an undefined columnSizing
    // breaks getSize()).
    initialState: {
      ...(initialState?.columnSizing
        ? { columnSizing: initialState.columnSizing }
        : {}),
    },
    state: {
      pagination,
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      columnPinning,
      columnOrder,
    },
    enableRowSelection: true,
    onPaginationChange,
    onSortingChange,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onColumnPinningChange,
    onColumnOrderChange,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFacetedMinMaxValues: getFacetedMinMaxValues(),
  })

  // With the data-change auto-reset off, clamp the page when filtering shrinks
  // the row count below the current page, so the user is never stranded on an
  // empty page. Runs in an effect (post-render) — never a render-phase setState.
  const currentPageCount = table.getPageCount()
  React.useEffect(() => {
    if (pagination.pageIndex > 0 && pagination.pageIndex >= currentPageCount) {
      onPaginationChange((prev) => ({
        ...prev,
        pageIndex: Math.max(0, currentPageCount - 1),
      }))
    }
  }, [currentPageCount, pagination.pageIndex, onPaginationChange])

  return { table }
}
