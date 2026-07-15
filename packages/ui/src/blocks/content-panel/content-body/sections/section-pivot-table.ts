import { type SectionDescriptor, defineSection } from "./section"
import type { PivotAggregate } from "./pivot-transform"
import type { TableSectionRow } from "./section-table"

/**
 * Declarative number format for the pivot's value cells — kept as plain data (no
 * function prop) so the descriptor stays serializable / server-safe like every
 * other section. The renderer builds an `Intl.NumberFormat` from it.
 */
export interface PivotValueFormat {
  readonly style?: "decimal" | "currency"
  /** ISO currency code when `style: "currency"` (e.g. "CZK"). */
  readonly currency?: string
  /** BCP-47 locale; omit for the runtime default. */
  readonly locale?: string
  readonly maximumFractionDigits?: number
}

/**
 * A Pivot-table section, described as pure data. It takes LONG-format source rows
 * and pivots them into a hierarchical matrix (row groups × the distinct values of
 * `pivotColumn`, cells aggregated from `valueField`). The transform is
 * `buildPivot` (`./pivot-transform`); the live grid is rendered by the SAME
 * `DataGridView` + `useDataTable` the flat Table section uses — so pin behaviour,
 * column drag, resize, a11y, and styling are inherited, not forked.
 */
export interface SectionPivotTableProps {
  /** Long-format source rows (one record per observation), keyed by field id. */
  readonly rows: readonly TableSectionRow[]
  /** Ordered field ids forming the row hierarchy — [outer, …, inner]. Min 1. */
  readonly rowGroups: readonly string[]
  /** Field id whose distinct values become the matrix (pivot) columns. */
  readonly pivotColumn: string
  /** Numeric field id aggregated into each cell. */
  readonly valueField: string
  /** Cell aggregation. Default "sum". */
  readonly aggregate?: PivotAggregate
  /** Explicit pivot-column set + order (by value); omit for first-seen order. */
  readonly pivotColumnOrder?: readonly string[]
  /** Header for the leading row-label (hierarchy) column. Default "Name". */
  readonly labelHeader?: string
  /** Width px of the pinned label column. Default 260. */
  readonly labelWidth?: number
  /** Width px of each generated value column. Default 150. */
  readonly valueWidth?: number
  /** Value-cell number formatting. Default localized decimal (2 fraction digits). */
  readonly valueFormat?: PivotValueFormat
  /** Expand every group row on first render. Default true. */
  readonly defaultExpanded?: boolean
  /** Universal search over the row labels (global filter). Default true. */
  readonly search?: boolean
  /** Optional URL/scroll anchor slug applied as the section's DOM `id`. */
  readonly anchor?: string
  /** Shown when the pivot resolves to no rows. */
  readonly emptyText?: string
}

/** What the renderer receives: the props minus the section-level `anchor`. */
export type SectionPivotTablePayload = Omit<SectionPivotTableProps, "anchor">

/**
 * The sole constructor for a Pivot-table section descriptor. Config is pure,
 * serializable data (survives the RSC boundary); the pivot transform, the live
 * TanStack instance, and every cell renderer live in the interactive renderer
 * (`./section-pivot-table-renderer`). Server-safe.
 */
export function sectionPivotTable(
  props: SectionPivotTableProps,
): SectionDescriptor<"pivot-table", SectionPivotTablePayload> {
  const { anchor, ...payload } = props
  if (process.env.NODE_ENV !== "production") {
    if (payload.rowGroups.length === 0)
      throw new Error("sectionPivotTable: `rowGroups` must have ≥1 field id.")
    if (payload.pivotColumn.length === 0)
      throw new Error("sectionPivotTable: `pivotColumn` must be a field id.")
    if (payload.valueField.length === 0)
      throw new Error("sectionPivotTable: `valueField` must be a field id.")
  }
  // The grid fills the remaining body height and scrolls internally.
  return defineSection("pivot-table", payload, { anchor, fill: true })
}
