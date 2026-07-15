import type { TableSectionRow } from "./section-table"
import type { PivotDimension, PivotMeasure } from "./section-pivot-table"

/**
 * A pure, React-free pivot transform. It folds LONG-format source rows into a
 * hierarchical matrix (row hierarchy × column hierarchy, each cell an aggregated
 * measure) with per-node subtotals and grand totals. Aggregation is
 * accumulator-based: one bucket pass over the rows, then a bottom-up MERGE of
 * accumulators so a parent's value is a true re-aggregation of the leaves (a true
 * mean at every level), never a mean-of-means and never a subtree rescan.
 *
 * Display-grade only: it aggregates with JS `number` and NEVER fabricates a
 * number across mixed currencies — such a cell is flagged `mixed`.
 */

/** A single aggregated cell's display state — never a fake number. */
export type PivotCell =
  | {
      readonly kind: "value"
      readonly value: number
      readonly currency?: string
    }
  | { readonly kind: "empty" }
  | { readonly kind: "mixed" }

/** One flat value column (a column-path × a measure). */
export interface PivotLeafColumn {
  /** CSS-safe structural id (`val0`, `val1`, …) — feeds `--col-<id>-size`. */
  readonly id: string
  /** The measure label (bottom header row). */
  readonly label: string
  readonly measureId: string
  /** The column-dimension values above this leaf. */
  readonly columnPath: readonly string[]
}

/** A node in the COLUMN header tree (drives hierarchical headers). */
export interface PivotColumnNode {
  /** CSS-safe id (`grp0`, … for groups; the leaf's `val…` id for leaves). */
  readonly id: string
  readonly label: string
  readonly children?: readonly PivotColumnNode[]
  /** Set only on a measure leaf — the `PivotLeafColumn.id`. */
  readonly leafId?: string
  /** Set only on a GROUP node — the column-dimension FIELD it splits on (e.g.
   *  "channel"), so a group header's Filter can route to that dimension's
   *  toolbar filter. */
  readonly dimField?: string
}

/** One row node in the pivot hierarchy. */
export interface PivotRow {
  /** Collision-safe id (`row:` + JSON of the dimension-value path). */
  readonly id: string
  readonly label: string
  readonly depth: number
  /** Aggregated cells keyed by `PivotLeafColumn.id`. */
  readonly values: Readonly<Record<string, PivotCell>>
  /** The dimension field → value map on this node's path (for drill-through). */
  readonly rowValues: Readonly<Record<string, string>>
  readonly subRows?: readonly PivotRow[]
  /**
   * A synthetic per-group SUBTOTAL row (`subtotalRows` on): the last child of a
   * group, carrying the group's aggregate under a "Total …" label. Its parent's
   * own value cells are then hidden while expanded so the subtotal isn't doubled.
   */
  readonly isTotal?: boolean
}

export interface PivotResult {
  readonly columnTree: readonly PivotColumnNode[]
  readonly leafColumns: readonly PivotLeafColumn[]
  readonly rows: readonly PivotRow[]
  readonly grandTotals: Readonly<Record<string, PivotCell>>
}

export interface BuildPivotInput {
  readonly rows: readonly TableSectionRow[]
  readonly rowDimensions: readonly PivotDimension[]
  readonly columnDimensions: readonly PivotDimension[]
  readonly measures: readonly PivotMeasure[]
  readonly columnOrder?: Readonly<Record<string, readonly string[]>>
  /** Append a "Total …" subtotal row at the end of each group (see PivotRow.isTotal). */
  readonly subtotalRows?: boolean
}

/** Per-(rowNode × leafColumn) accumulator. Merged up the tree, resolved at end. */
interface Acc {
  matchCount: number // source rows matching this bucket (drives `count`)
  sum: number
  n: number // finite field values (drives sum/avg/min/max)
  min: number
  max: number
  distinct: Set<string> // drives countDistinct
  currencies: Set<string> // >1 ⇒ mixed
}

function emptyAcc(): Acc {
  return {
    matchCount: 0,
    sum: 0,
    n: 0,
    min: Infinity,
    max: -Infinity,
    distinct: new Set(),
    currencies: new Set(),
  }
}

function mergeInto(target: Acc, src: Acc): void {
  target.matchCount += src.matchCount
  target.sum += src.sum
  target.n += src.n
  if (src.min < target.min) target.min = src.min
  if (src.max > target.max) target.max = src.max
  for (const d of src.distinct) target.distinct.add(d)
  for (const c of src.currencies) target.currencies.add(c)
}

function resolveCell(acc: Acc, measure: PivotMeasure): PivotCell {
  if (measure.agg === "count") return { kind: "value", value: acc.matchCount }
  if (measure.agg === "countDistinct")
    return { kind: "value", value: acc.distinct.size }
  // sum / avg / min / max: no finite value ⇒ empty; mixed currencies ⇒ refuse.
  if (acc.n === 0) return { kind: "empty" }
  if (measure.currencyField && acc.currencies.size > 1) return { kind: "mixed" }
  const currency =
    measure.currencyField && acc.currencies.size === 1
      ? [...acc.currencies][0]
      : undefined
  let value: number
  if (measure.agg === "sum") value = acc.sum
  else if (measure.agg === "avg") value = acc.sum / acc.n
  else if (measure.agg === "min") value = acc.min
  else value = acc.max
  return currency !== undefined
    ? { kind: "value", value, currency }
    : { kind: "value", value }
}

/** Field value as a display string (`""` for null/undefined). */
function fieldStr(row: TableSectionRow, field: string): string {
  const v = row[field]
  return v == null ? "" : String(v)
}

/** The ordered distinct values of a column dimension: `columnOrder` verbatim
 *  (present-but-unlisted dropped), else first-seen while scanning rows. */
function distinctValues(
  rows: readonly TableSectionRow[],
  field: string,
  ordered: readonly string[] | undefined,
): string[] {
  if (ordered) return [...ordered]
  const seen = new Set<string>()
  const out: string[] = []
  for (const row of rows) {
    const v = fieldStr(row, field)
    if (!seen.has(v)) {
      seen.add(v)
      out.push(v)
    }
  }
  return out
}

/** Cross-join the per-level distinct values into ordered column paths. */
function crossJoin(levels: readonly string[][]): string[][] {
  let paths: string[][] = [[]]
  for (const level of levels) {
    const next: string[][] = []
    for (const path of paths) for (const v of level) next.push([...path, v])
    paths = next
  }
  return paths
}

/** A mutable row-tree node built during the bucket pass. */
interface BuildNode {
  path: string[]
  rowValues: Record<string, string>
  children: Map<string, BuildNode>
  order: string[] // child insertion order (first-seen)
  acc: Acc[] // per leaf column
}

function newNode(
  path: string[],
  rowValues: Record<string, string>,
  numLeaves: number,
): BuildNode {
  const acc: Acc[] = new Array(numLeaves)
  for (let i = 0; i < numLeaves; i++) acc[i] = emptyAcc()
  return { path, rowValues, children: new Map(), order: [], acc }
}

/**
 * Fold long-format `rows` into the pivot matrix. See the module doc for the
 * accumulator/merge strategy. O(R·(Dr+Dc+M)) bucket pass + O(nodes·leaves) fold.
 */
export function buildPivot(input: BuildPivotInput): PivotResult {
  const {
    rows,
    rowDimensions,
    columnDimensions,
    measures,
    columnOrder,
    subtotalRows,
  } = input

  // 1. Enumerate column paths + the flat value columns (colPath-major, measure-minor).
  const colLevels = columnDimensions.map((dim) =>
    distinctValues(rows, dim.field, columnOrder?.[dim.field]),
  )
  const colPaths = crossJoin(colLevels)
  const M = measures.length
  const leafColumns: PivotLeafColumn[] = []
  for (const colPath of colPaths) {
    for (const measure of measures) {
      leafColumns.push({
        id: `val${leafColumns.length}`,
        label: measure.label,
        measureId: measure.id,
        columnPath: colPath,
      })
    }
  }
  const numLeaves = leafColumns.length
  const colPathIndex = new Map<string, number>()
  colPaths.forEach((p, i) => colPathIndex.set(JSON.stringify(p), i))

  // 2. Build the column header tree (groups per level, measure leaves at bottom).
  let groupCounter = 0
  const buildColumnTree = (
    dimIdx: number,
    prefix: string[],
  ): PivotColumnNode[] => {
    if (dimIdx === columnDimensions.length) {
      const base = colPathIndex.get(JSON.stringify(prefix))! * M
      return measures.map((measure, mi) => {
        const leaf = leafColumns[base + mi]!
        return { id: leaf.id, label: measure.label, leafId: leaf.id }
      })
    }
    return colLevels[dimIdx]!.map((value) => ({
      id: `grp${groupCounter++}`,
      label: value,
      dimField: columnDimensions[dimIdx]!.field,
      children: buildColumnTree(dimIdx + 1, [...prefix, value]),
    }))
  }
  const columnTree = buildColumnTree(0, [])

  // 3. Bucket pass — fold each source row into its DEEPEST row node.
  const root = newNode([], {}, numLeaves)
  for (const row of rows) {
    // Which column bucket? (skip a row whose colPath was dropped by columnOrder)
    const colPath = columnDimensions.map((dim) => fieldStr(row, dim.field))
    const colIdx = colPathIndex.get(JSON.stringify(colPath))
    if (colIdx === undefined) continue

    // Descend/create the row node for this row's dimension path.
    let node = root
    const path: string[] = []
    const rowValues: Record<string, string> = {}
    for (const dim of rowDimensions) {
      const value = fieldStr(row, dim.field)
      path.push(value)
      rowValues[dim.field] = value
      let child = node.children.get(value)
      if (!child) {
        child = newNode([...path], { ...rowValues }, numLeaves)
        node.children.set(value, child)
        node.order.push(value)
      }
      node = child
    }

    // Fold into the leaf node's accumulators (one leaf column per measure here).
    measures.forEach((measure, mi) => {
      const acc = node.acc[colIdx * M + mi]!
      acc.matchCount += 1
      if (measure.field) {
        // A missing value (null/undefined/"") is NOT a number — `Number(null)`
        // is 0, which would wrongly count toward sum/avg. Skip it entirely.
        const rawVal = row[measure.field]
        if (rawVal != null && rawVal !== "") {
          const raw = Number(rawVal)
          if (Number.isFinite(raw)) {
            acc.sum += raw
            acc.n += 1
            if (raw < acc.min) acc.min = raw
            if (raw > acc.max) acc.max = raw
            if (measure.currencyField)
              acc.currencies.add(fieldStr(row, measure.currencyField))
          }
        }
      }
      if (measure.distinctField)
        acc.distinct.add(fieldStr(row, measure.distinctField))
    })
  }

  // 4. Roll up (post-order): parent accumulators = merge of children's.
  const rollUp = (node: BuildNode): void => {
    for (const value of node.order) {
      const child = node.children.get(value)!
      rollUp(child)
      for (let i = 0; i < numLeaves; i++) mergeInto(node.acc[i]!, child.acc[i]!)
    }
  }
  rollUp(root)

  // 5. Materialize the immutable PivotRow tree + resolve cells.
  const measureOfLeaf = (leafIdx: number): PivotMeasure =>
    measures[leafIdx % M]!
  const toValues = (acc: Acc[]): Record<string, PivotCell> => {
    const out: Record<string, PivotCell> = {}
    for (let i = 0; i < numLeaves; i++)
      out[leafColumns[i]!.id] = resolveCell(acc[i]!, measureOfLeaf(i))
    return out
  }
  const materialize = (node: BuildNode, depth: number): PivotRow => {
    const label = node.path[node.path.length - 1] ?? ""
    const subRows: PivotRow[] = node.order.map((value) =>
      materialize(node.children.get(value)!, depth + 1),
    )
    // A "Total <label>" subtotal row closes each group (its aggregate = the
    // group's), so the group's own value cells can be blanked while expanded.
    if (subtotalRows && subRows.length)
      subRows.push({
        id: `total:${JSON.stringify(node.path)}`,
        label: `Total ${label}`,
        depth: depth + 1,
        values: toValues(node.acc),
        rowValues: node.rowValues,
        isTotal: true,
      })
    return {
      id: `row:${JSON.stringify(node.path)}`,
      label,
      depth,
      values: toValues(node.acc),
      rowValues: node.rowValues,
      subRows: subRows.length ? subRows : undefined,
    }
  }
  const rows_out = root.order.map((value) =>
    materialize(root.children.get(value)!, 0),
  )

  return {
    columnTree,
    leafColumns,
    rows: rows_out,
    grandTotals: toValues(root.acc),
  }
}
