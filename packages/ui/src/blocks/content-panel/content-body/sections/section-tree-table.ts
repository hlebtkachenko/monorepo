import { type SectionDescriptor, defineSection } from "./section"
import {
  resolveColumnFilter,
  type TableColumnSpec,
  type TableCellValue,
  type TableSectionFeatures,
} from "./section-table"

/**
 * One row in a Tree-table section. UNLIKE the flat `TableSectionRow` (a scalar
 * `Record<string, TableCellValue>` that cannot nest), a tree row carries its
 * column `values` PLUS optional `subRows` — so the SAME editable-cell grid the
 * flat Table renders can also express a parent/child hierarchy (e.g. chart of
 * accounts: Class → Group → Synthetic → Analytical). The renderer reads
 * `getSubRows: (row) => row.subRows` and keys selection/sort by `id`.
 *
 * A STRUCTURAL tier node (a Class/Group grouping row with no backing record)
 * sets `selectable: false` + `editable: false`: it is rendered label-only (its
 * non-identity cells show "—"), can never be swept into a selection, and its
 * cells are never editable even in an editable column. Real records leave both
 * default (`true`).
 */
export interface TreeTableRow {
  /** Stable, globally-unique row id (selection/sort/expansion survive by it). */
  readonly id: string
  /** Column values keyed by column id. Absent keys render blank ("—"). */
  readonly values: Readonly<Record<string, TableCellValue>>
  /** Child rows (the next tier). Presence enables the expand/collapse toggle. */
  readonly subRows?: readonly TreeTableRow[]
  /** false = a structural tier node: not selectable. Default true. */
  readonly selectable?: boolean
  /** false = a structural tier node: never inline-editable. Default true. */
  readonly editable?: boolean
}

/**
 * Initial expansion. `true` = every node expanded; `false` = all collapsed; a
 * NUMBER = expand every node whose depth is `< n` (0-indexed), so a chart of
 * accounts can open Class + Group (`2`) and leave analyticals collapsed.
 */
export type TreeTableDefaultExpanded = boolean | number

export interface SectionTreeTableProps {
  readonly columns: readonly TableColumnSpec[]
  /** The nested row forest, each carrying its `id` + column `values` + `subRows`. */
  readonly rows: readonly TreeTableRow[]
  readonly features?: TableSectionFeatures
  /** Initial expansion depth/flag. Default `true` (all expanded). */
  readonly defaultExpanded?: TreeTableDefaultExpanded
  /** Optional URL/scroll anchor slug applied as the section's DOM `id`. */
  readonly anchor?: string
  /** Shown when the tree has no rows. */
  readonly emptyText?: string
  /** Harvest-name prefix for editable inputs (`${name}[${rowId}][${colId}]`). */
  readonly name?: string
  /** Stable, page-unique key for persisting the user's column layout. */
  readonly persistKey?: string
}

/**
 * What the renderer receives: the props minus the section-level `anchor`, with
 * the always-filled `features` flipped to required and `defaultExpanded`
 * defaulted — so a new props field can't be silently dropped.
 */
export type SectionTreeTablePayload = Omit<
  SectionTreeTableProps,
  "anchor" | "features" | "defaultExpanded"
> & {
  readonly features: Required<TableSectionFeatures>
  readonly defaultExpanded: TreeTableDefaultExpanded
}

/**
 * The sole constructor for a Tree-table-section descriptor — the flat Table's
 * editable data grid PLUS a parent/child hierarchy with TanStack row expansion.
 * Columns + nested rows + feature flags are pure serializable data (survive the
 * RSC boundary); the live TanStack instance, all cell renderers, the inline
 * editors, and every handler live inside the interactive renderer
 * (`./section-tree-table-renderer`). Server-safe.
 *
 * Dev-only guards mirror `sectionTable`'s column contract (unique + filterable
 * ids, `creatable` only on a `select`, at most one `role: "id"`, and — when
 * `features.inspect` — a required identity column).
 */
export function sectionTreeTable({
  anchor,
  columns,
  rows,
  features,
  defaultExpanded,
  emptyText,
  name,
  persistKey,
}: SectionTreeTableProps): SectionDescriptor<
  "tree-table",
  SectionTreeTablePayload
> {
  if (process.env.NODE_ENV !== "production") {
    const ids = new Set<string>()
    for (const col of columns) {
      if (ids.has(col.id))
        throw new Error(`sectionTreeTable: duplicate column id "${col.id}".`)
      ids.add(col.id)
      // Every data column must be filterable (see sectionTable): a `filter: false`
      // opts a column out entirely, which is disallowed.
      if (resolveColumnFilter(col) === null)
        throw new Error(
          `sectionTreeTable: column "${col.id}" opts out of filtering (\`filter: false\`). Every data column must be filterable; remove the \`filter: false\`.`,
        )
      if (col.creatable && col.kind !== "select")
        throw new Error(
          `sectionTreeTable: column "${col.id}" is \`creatable\` but its kind is "${col.kind}"; only \`kind: "select"\` supports a creatable option set.`,
        )
    }
    const idColumns = columns.filter((col) => col.role === "id")
    if (idColumns.length > 1)
      throw new Error(
        'sectionTreeTable: at most one column may have `role: "id"`.',
      )
    if (features?.inspect && idColumns.length === 0)
      throw new Error(
        'sectionTreeTable: a Tree-table with `features.inspect` requires one column with `role: "id"`.',
      )
  }
  return defineSection(
    "tree-table",
    {
      columns,
      rows,
      features: {
        search: features?.search ?? true,
        inspect: features?.inspect ?? false,
        rowActions: features?.rowActions ?? false,
      },
      defaultExpanded: defaultExpanded ?? true,
      emptyText,
      name: name ?? anchor,
      persistKey,
    },
    // The grid fills the remaining body height and scrolls internally.
    { anchor, fill: true },
  )
}
