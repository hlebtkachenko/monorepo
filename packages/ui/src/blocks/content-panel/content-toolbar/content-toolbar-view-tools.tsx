import {
  DataTableColumnManager,
  DataTableMultiSort,
} from "@workspace/ui/components/data-table"

import type { ViewToolsDescriptor } from "./toolbar-descriptors"

/**
 * ContentToolbar ViewTools slot (right #1) — the column manager and multi-sort
 * controls grouped together, both driven by the descriptor's TanStack table
 * handle. Repackages the reference toolbar's `DataTableColumnManager` +
 * `DataTableMultiSort` pair behind the closed descriptor vocabulary.
 */
export function ContentToolbarViewTools<TData>({
  table,
  columnsLabel,
  sortTooltip,
}: ViewToolsDescriptor<TData>) {
  return (
    <>
      <DataTableColumnManager table={table} label={columnsLabel} />
      <DataTableMultiSort table={table} tooltip={sortTooltip} />
    </>
  )
}
