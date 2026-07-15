import { type SectionDescriptor, defineSection } from "./section"
import type { TableSectionRow } from "./section-table"

/**
 * The reserved id of the pinned row-label (hierarchy) column. Every generated
 * value-column id is prefixed (`val…` — see `pivot-transform`), so a raw
 * dimension value or measure id can never collide with it. Exported so the
 * transform + renderer share the ONE literal.
 */
export const PIVOT_ROW_LABEL_ID = "__rowlabel"

/**
 * One aggregation a measure can apply to its bucket of source rows. A CLOSED
 * union:
 * - `sum` / `avg` / `min` / `max` fold the finite numeric values of `field`.
 *   Across more than one currency (`currencyField`) they refuse a fake number
 *   and yield a `mixed` cell — see `pivot-transform`.
 * - `count` counts the source rows in the bucket (currency-agnostic; no `field`).
 * - `countDistinct` counts the distinct values of `distinctField` in the bucket.
 */
export type PivotAggregation =
  "sum" | "count" | "countDistinct" | "avg" | "min" | "max"

/** A dimension that groups pivot rows or columns. Pure data. */
export interface PivotDimension {
  /** Source-row field id whose distinct values form this dimension's buckets. */
  readonly field: string
  /** Header label; defaults to `field`. */
  readonly label?: string
}

/**
 * Declarative number/currency format for a measure's value cells — plain data
 * (no function prop) so the descriptor stays serializable / server-safe. The
 * renderer builds an `Intl.NumberFormat` from it.
 *
 * DISPLAY-GRADE ONLY. The pivot aggregates with JavaScript `number` for
 * presentation — a reporting/summary view, NOT authoritative money accounting.
 * Exact minor-unit money (`Money<Currency>`) lives in the domain layer, which a
 * UI package must not import. A cell that mixes currencies is flagged
 * non-aggregable rather than summed.
 */
export interface PivotValueFormat {
  readonly style?: "decimal" | "currency"
  /** ISO currency code when `style: "currency"` (e.g. "CZK"). Dev-guarded. */
  readonly currency?: string
  /** BCP-47 locale; omit for the runtime default. */
  readonly locale?: string
  readonly maximumFractionDigits?: number
}

/** One measure = a source field folded by an aggregation, formatted for display. */
export interface PivotMeasure {
  /** Stable, author-supplied id — used to build collision-safe leaf-column ids. */
  readonly id: string
  /** Header label for the measure. */
  readonly label: string
  readonly agg: PivotAggregation
  /** Source numeric field. Required for `sum`/`avg`/`min`/`max`; ignored for `count`. */
  readonly field?: string
  /** Field whose distinct values are counted. Required for `countDistinct`. */
  readonly distinctField?: string
  readonly format?: PivotValueFormat
  /**
   * Source field naming the CURRENCY of `field` on each row. When set and a
   * `sum`/`avg`/`min`/`max` cell mixes more than one currency, that cell (and
   * every subtotal/grand-total over it) is flagged non-aggregable — never a fake
   * number. Omit for a plain single-scale number.
   */
  readonly currencyField?: string
}

/**
 * A Pivot-table section, described as pure data. It takes LONG-format source
 * rows (one record per observation) and pivots them into a hierarchical matrix:
 * a row hierarchy (`rowDimensions`) × a column hierarchy (`columnDimensions`),
 * each cell aggregated by a `measure`. The transform is `buildPivot`
 * (`./pivot-transform`); the live grid is rendered through the SAME
 * `useSectionGridTable` + `DataGridView` scaffold the flat Table section uses —
 * so sorting, pinning, column drag, resize, keyboard nav, virtualization, and
 * a11y are inherited, not forked.
 */
export interface SectionPivotTableProps {
  /** Long-format source rows (one record per observation), keyed by field id. */
  readonly rows: readonly TableSectionRow[]
  /** Row hierarchy [outer, …, inner]. At least one dimension. */
  readonly rowDimensions: readonly PivotDimension[]
  /**
   * Column hierarchy [outer, …, inner]. Empty => the measures are the only
   * header row (identical to a flat numeric table).
   */
  readonly columnDimensions: readonly PivotDimension[]
  /** The measures folded into each cell. At least one. */
  readonly measures: readonly PivotMeasure[]
  /**
   * Fixed column-value order per dimension field; a present value NOT listed is
   * dropped. Omit a field for first-seen order.
   */
  readonly columnOrder?: Readonly<Record<string, readonly string[]>>
  /** Header for the pinned row-label (hierarchy) column. Default "Name". */
  readonly rowLabelHeader?: string
  /** Width px of the pinned label column. Default 260. */
  readonly labelWidth?: number
  /** Width px of each generated value column. Default 150. */
  readonly valueWidth?: number
  /** Expand every group row on first render. Default true. */
  readonly defaultExpanded?: boolean
  /** Universal search over the row labels (global filter). Default true. */
  readonly search?: boolean
  /**
   * Async surface — the page flips this; the renderer shows a loading or error
   * state instead of the grid. Default "ready".
   */
  readonly state?: "ready" | "loading" | "error"
  /** Message shown when `state === "error"`. */
  readonly errorText?: string
  /** Shown when the pivot resolves to no rows. */
  readonly emptyText?: string
  /** Optional URL/scroll anchor slug applied as the section's DOM `id`. */
  readonly anchor?: string
}

/** What the renderer receives: the props minus the section-level `anchor`. */
export type SectionPivotTablePayload = Omit<SectionPivotTableProps, "anchor">

/** Aggregations that fold `field` (so a missing `field` is a config error). */
const FIELD_AGGREGATIONS: ReadonlySet<PivotAggregation> = new Set([
  "sum",
  "avg",
  "min",
  "max",
])

/**
 * The sole constructor for a Pivot-table section descriptor. Config is pure,
 * serializable data (survives the RSC boundary); the pivot transform, the live
 * TanStack instance, and every cell renderer live in the interactive renderer
 * (`./section-pivot-table-renderer`). Server-safe.
 *
 * Dev-only guards validate the CONFIG SHAPE (never a full row scan): at least
 * one row dimension + one measure, unique non-reserved measure ids, the
 * aggregation's required field, a currency for a currency format, and no
 * duplicate `columnOrder` value.
 */
export function sectionPivotTable(
  props: SectionPivotTableProps,
): SectionDescriptor<"pivot-table", SectionPivotTablePayload> {
  const { anchor, ...payload } = props
  if (process.env.NODE_ENV !== "production") {
    if (payload.rowDimensions.length === 0)
      throw new Error(
        "sectionPivotTable: `rowDimensions` must have ≥1 dimension.",
      )
    for (const dim of payload.rowDimensions)
      if (dim.field.length === 0)
        throw new Error(
          "sectionPivotTable: a row dimension has an empty field.",
        )
    for (const dim of payload.columnDimensions)
      if (dim.field.length === 0)
        throw new Error(
          "sectionPivotTable: a column dimension has an empty field.",
        )

    if (payload.measures.length === 0)
      throw new Error("sectionPivotTable: `measures` must have ≥1 measure.")
    const measureIds = new Set<string>()
    for (const measure of payload.measures) {
      if (measure.id.length === 0)
        throw new Error("sectionPivotTable: a measure has an empty id.")
      if (measure.id === PIVOT_ROW_LABEL_ID)
        throw new Error(
          `sectionPivotTable: measure id "${PIVOT_ROW_LABEL_ID}" is reserved.`,
        )
      if (measureIds.has(measure.id))
        throw new Error(
          `sectionPivotTable: duplicate measure id "${measure.id}".`,
        )
      measureIds.add(measure.id)

      if (FIELD_AGGREGATIONS.has(measure.agg) && !measure.field)
        throw new Error(
          `sectionPivotTable: measure "${measure.id}" (${measure.agg}) requires \`field\`.`,
        )
      if (measure.agg === "countDistinct" && !measure.distinctField)
        throw new Error(
          `sectionPivotTable: measure "${measure.id}" (countDistinct) requires \`distinctField\`.`,
        )
      if (measure.format?.style === "currency" && !measure.format.currency)
        throw new Error(
          `sectionPivotTable: measure "${measure.id}" \`format.currency\` is required when style is "currency".`,
        )
    }

    for (const [field, values] of Object.entries(payload.columnOrder ?? {})) {
      const seen = new Set<string>()
      for (const value of values) {
        if (seen.has(value))
          throw new Error(
            `sectionPivotTable: duplicate columnOrder value "${value}" for field "${field}".`,
          )
        seen.add(value)
      }
    }
  }
  // The grid fills the remaining body height and scrolls internally.
  return defineSection("pivot-table", payload, { anchor, fill: true })
}
