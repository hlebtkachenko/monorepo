import type {
  TableCellValue,
  TableColumnSpec,
  TableSectionRow,
} from "./section-table"

/** A column definition = the pure `TableColumnSpec` PLUS how to read the cell from a source record. */
export type TableColumnDef<T> = TableColumnSpec & {
  /** Project the source record to this column's scalar cell value. */
  readonly accessor: (row: T) => TableCellValue
}

export interface BuildTableSectionOptions<T> {
  readonly columns: readonly TableColumnDef<T>[]
  readonly data: readonly T[]
  /** Field name that will hold the stable row id in each produced row. */
  readonly rowIdKey: string
  /** Stable id per source record (stringified into rowIdKey). */
  readonly getRowId: (row: T) => string
}

export interface BuiltTableSection {
  readonly columns: TableColumnSpec[]
  readonly rows: TableSectionRow[]
}

/**
 * Turns a typed source-record array + column definitions into the pure
 * `{ columns, rows }` shape `sectionTable(...)` consumes — removing the
 * per-page boilerplate of hand-writing `TableColumnSpec[]` and hand-mapping
 * DB records into `TableSectionRow`. Every `TableColumnSpec` field (current
 * or future) is spread through untouched, so new spec fields need no change
 * here.
 */
export function buildTableSection<T>({
  columns,
  data,
  rowIdKey,
  getRowId,
}: BuildTableSectionOptions<T>): BuiltTableSection {
  if (process.env.NODE_ENV !== "production") {
    const ids = new Set<string>()
    for (const col of columns) {
      if (ids.has(col.id))
        throw new Error(`buildTableSection: duplicate column id "${col.id}".`)
      ids.add(col.id)
    }
    if (rowIdKey.length === 0)
      throw new Error(
        "buildTableSection: `rowIdKey` must be a non-empty field name.",
      )
  }

  const builtColumns: TableColumnSpec[] = columns.map((col) => {
    const { accessor, ...spec } = col
    return spec
  })

  const rows: TableSectionRow[] = data.map((record) => {
    const row: Record<string, TableCellValue> = {
      [rowIdKey]: String(getRowId(record)),
    }
    for (const col of columns) {
      row[col.id] = col.accessor(record)
    }
    return row
  })

  return { columns: builtColumns, rows }
}
