"use client"

import type { Table } from "@tanstack/react-table"

import { useDataTable } from "@workspace/ui/components/data-table"
import type { UseDataTableProps } from "@workspace/ui/components/data-table"

import { useRegisterSectionTable } from "./section-table-context"

/**
 * Everything a section grid passes into `useDataTable` EXCEPT the three options
 * the shared scaffold owns and forces (`paginated`, `columnResizeMode`,
 * `globalFilterFn`). A caller supplies only its data-specific pieces — `data`,
 * `columns`, `getRowId`, `defaultColumn`, `enableGlobalFilter`, and (per
 * renderer) `normalizeColumnPinning` / `persistenceKey` / `getSubRows` /
 * `getExpandedRowModel` / `initialState` / etc.
 */
export type SectionGridTableProps<TData> = Omit<
  UseDataTableProps<TData>,
  "paginated" | "columnResizeMode" | "globalFilterFn"
>

/**
 * The ONE shared Table-section grid scaffold. Both the flat Table renderer and
 * the Pivot renderer build their live TanStack instance through this hook so the
 * MANDATORY table behavior lives in a single place, never copy-pasted:
 *
 *   - the single-page row model (`paginated: false`) — `getRowModel()` returns
 *     the COMPLETE sorted/filtered dataset (no hidden page-size truncation);
 *     `DataGridView` bounds the DOM by virtualization, not by a page size;
 *   - live column resizing (`columnResizeMode: "onChange"`);
 *   - the universal-search matcher (`globalFilterFn: "includesString"`);
 *   - publishing the live instance UP to the archetype chrome via
 *     `useRegisterSectionTable`, keyed by a `stateSignature` that re-registers
 *     the toolbar/footer on any tracked grid-state change (selection, sort,
 *     visibility, order, pinning, filters, search, expansion).
 *
 * The caller keeps its OWN data-specific pieces: columns + cell renderers, the
 * pin layout / `normalizeColumnPinning`, `getSubRows` / expansion, the summary
 * (footer) row, and the `DataGridView` render (whose props legitimately diverge
 * between flat and pivot). The `selectionCount` is derived here from the live
 * filtered-selection model so a renderer never recomputes it.
 */
export function useSectionGridTable<TData>(
  props: SectionGridTableProps<TData>,
): { table: Table<TData>; selectionCount: number } {
  const { table } = useDataTable<TData>({
    ...props,
    // Mandatory across every section grid — see the hook doc.
    columnResizeMode: "onChange",
    globalFilterFn: "includesString",
    paginated: false,
  })

  // Publish the live instance so the toolbar (Columns/Sort/search) + selection
  // footer stay in sync; re-register whenever a tracked slice of grid state
  // changes. One signature superset covers both renderers: flat exercises
  // `rs`/`f`, pivot exercises `e`, and the unused slices stay inert (`{}`/`[]`).
  const state = table.getState()
  // `flatRows` (not `.rows`) so a NESTED selection counts: in a Tree-table every
  // selectable row is a nested account (the Class/Group tiers are non-selectable),
  // so `.rows` — the top-level rows only — would always be 0 and the selection
  // footer would never show. For a flat table `flatRows === rows`, so unchanged.
  const selectionCount = table.getFilteredSelectedRowModel().flatRows.length
  const stateSignature = JSON.stringify({
    rs: state.rowSelection,
    s: state.sorting,
    v: state.columnVisibility,
    o: state.columnOrder,
    p: state.columnPinning,
    f: state.columnFilters,
    g: state.globalFilter,
    e: state.expanded,
  })
  useRegisterSectionTable(table as never, selectionCount, stateSignature)

  return { table, selectionCount }
}
