import type { TableCellValue, TableSectionRow } from "./section-table"

/**
 * A pure, React-free pivot/aggregation transform. It folds long-format source
 * rows (one record per observation) into a nested tree of pivot rows plus the
 * generated matrix (pivot) columns, ready for a pivot TABLE renderer to consume.
 * No `Date`, no `Math.random`, no side effects — same input, same output.
 */

/** How each matrix cell rolls up its underlying source values. */
export type PivotAggregate = "sum" | "avg" | "min" | "max" | "count"

export interface PivotConfig {
  /** Long-format source rows (one record per observation), keyed by field id. */
  readonly rows: readonly TableSectionRow[]
  /** Ordered field ids forming the row hierarchy — [outer, …, inner]. Min 1. */
  readonly rowGroups: readonly string[]
  /** Field id whose DISTINCT values become the matrix (pivot) columns. */
  readonly pivotColumn: string
  /** Numeric field id aggregated into each cell. */
  readonly valueField: string
  /** Cell aggregation. Default "sum". */
  readonly aggregate?: PivotAggregate
  /**
   * Explicit column set + order (by pivot value). When given it is used
   * VERBATIM — a listed value with no rows yields a column of null cells; a
   * present value NOT listed is dropped. When omitted, columns are the distinct
   * pivot values in first-seen order.
   */
  readonly pivotColumnOrder?: readonly string[]
}

export interface PivotColumn {
  readonly id: string // the pivot value (stringified)
  readonly header: string // display label (same as id)
}

export interface PivotRow {
  readonly id: string // stable path id = ancestor labels joined by "/"
  readonly label: string // this level's group value (stringified)
  readonly depth: number // 0-based (index in rowGroups)
  readonly values: Readonly<Record<string, number | null>> // keyed by PivotColumn.id
  readonly leafCount: number // # source rows in this subtree
  readonly subRows?: readonly PivotRow[]
}

export interface PivotResult {
  readonly columns: readonly PivotColumn[]
  readonly rows: readonly PivotRow[] // top-level nodes (nest via subRows)
  readonly grandTotals: Readonly<Record<string, number | null>>
}

/** Stringify a cell to a stable group key; a missing/`null` cell buckets under `""`. */
function groupKey(value: TableCellValue | undefined): string {
  return String(value ?? "")
}

/** The matrix columns: `pivotColumnOrder` verbatim, else distinct first-seen values. */
function collectColumns(config: PivotConfig): PivotColumn[] {
  if (config.pivotColumnOrder) {
    return config.pivotColumnOrder.map((value) => ({
      id: value,
      header: value,
    }))
  }
  const seen = new Set<string>()
  const columns: PivotColumn[] = []
  for (const row of config.rows) {
    const id = String(row[config.pivotColumn])
    if (!seen.has(id)) {
      seen.add(id)
      columns.push({ id, header: id })
    }
  }
  return columns
}

/** Group rows by one field, preserving first-seen key order. */
function groupBy(
  rows: readonly TableSectionRow[],
  field: string,
): Array<{ key: string; rows: TableSectionRow[] }> {
  const order: string[] = []
  const buckets = new Map<string, TableSectionRow[]>()
  for (const row of rows) {
    const key = groupKey(row[field])
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = []
      buckets.set(key, bucket)
      order.push(key)
    }
    bucket.push(row)
  }
  return order.map((key) => ({ key, rows: buckets.get(key) ?? [] }))
}

/** Fold the finite values (and raw match count) of one cell into a single scalar. */
function summarize(
  aggregate: PivotAggregate,
  values: readonly number[],
  count: number,
): number | null {
  // `count` is always a number (0 when no rows match); the rest are null-if-empty.
  if (aggregate === "count") return count
  if (values.length === 0) return null
  if (aggregate === "min") return values.reduce((a, b) => (b < a ? b : a))
  if (aggregate === "max") return values.reduce((a, b) => (b > a ? b : a))
  const total = values.reduce((a, b) => a + b, 0)
  return aggregate === "avg" ? total / values.length : total
}

/**
 * The per-column aggregate for ONE node, computed from its OWN subtree source
 * rows — so a parent re-derives from the underlying records, not from its child
 * aggregates (an `avg` is a true mean, never a mean-of-means).
 */
function computeValues(
  subtree: readonly TableSectionRow[],
  columns: readonly PivotColumn[],
  pivotColumn: string,
  valueField: string,
  aggregate: PivotAggregate,
): Record<string, number | null> {
  const finiteByColumn = new Map<string, number[]>()
  const countByColumn = new Map<string, number>()
  for (const column of columns) {
    finiteByColumn.set(column.id, [])
    countByColumn.set(column.id, 0)
  }
  for (const row of subtree) {
    const columnId = String(row[pivotColumn])
    const finite = finiteByColumn.get(columnId)
    // A pivot value outside the column set (e.g. dropped by pivotColumnOrder)
    // contributes to no cell.
    if (finite === undefined) continue
    countByColumn.set(columnId, (countByColumn.get(columnId) ?? 0) + 1)
    const numeric = Number(row[valueField])
    if (Number.isFinite(numeric)) finite.push(numeric)
  }
  const values: Record<string, number | null> = {}
  for (const column of columns) {
    values[column.id] = summarize(
      aggregate,
      finiteByColumn.get(column.id) ?? [],
      countByColumn.get(column.id) ?? 0,
    )
  }
  return values
}

/** Build the pivot rows for one hierarchy level, recursing into deeper groups. */
function buildLevel(
  rows: readonly TableSectionRow[],
  depth: number,
  ancestorLabels: readonly string[],
  config: PivotConfig,
  columns: readonly PivotColumn[],
  aggregate: PivotAggregate,
): PivotRow[] {
  // In range by construction — buildLevel is only entered for depth < length.
  const field = config.rowGroups[depth]!
  return groupBy(rows, field).map(({ key, rows: subtree }) => {
    const path = [...ancestorLabels, key]
    const node = {
      id: path.join("/"),
      label: key,
      depth,
      values: computeValues(
        subtree,
        columns,
        config.pivotColumn,
        config.valueField,
        aggregate,
      ),
      leafCount: subtree.length,
    }
    // The deepest rowGroups level IS the leaf row — no per-record children.
    if (depth + 1 >= config.rowGroups.length) return node
    return {
      ...node,
      subRows: buildLevel(subtree, depth + 1, path, config, columns, aggregate),
    }
  })
}

/**
 * Fold long-format `config.rows` into the nested pivot tree + matrix columns.
 * See `PivotConfig` for the exact column/hierarchy/rollup semantics.
 */
export function buildPivot(config: PivotConfig): PivotResult {
  const aggregate = config.aggregate ?? "sum"
  const columns = collectColumns(config)
  const grandTotals = computeValues(
    config.rows,
    columns,
    config.pivotColumn,
    config.valueField,
    aggregate,
  )
  if (config.rowGroups.length === 0) {
    return { columns, rows: [], grandTotals }
  }
  const rows = buildLevel(config.rows, 0, [], config, columns, aggregate)
  return { columns, rows, grandTotals }
}
