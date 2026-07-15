import { type SectionDescriptor, defineSection } from "./section"

/**
 * A column's cell/editor kind — a CLOSED union. The renderer maps each to OUR
 * shadcn control (display text · number · a Select dropdown · a Badge). Adding a
 * kind = one arm here + one case in the renderer ("interactivity as data").
 * `date` / `tags` / `combobox` are the documented next arms.
 */
export type TableColumnKind = "text" | "number" | "select" | "badge"

/** Horizontal alignment of a column's header + cells. Default "start". */
export type TableColumnAlign = "start" | "end" | "center"

/** How a column's cells can be edited. Default "readonly".
 * - "inline": editable in the grid cell (click-to-edit)
 * - "inspector": editable only in the row Inspector (page-driven), read-only in the grid
 * - "both": inline AND inspector
 * - "readonly": display only */
export type TableColumnEditMode = "readonly" | "inline" | "inspector" | "both"

/** One `select` / `badge` option — value stored, label shown. */
export interface TableColumnOption {
  readonly value: string
  readonly label: string
}

/**
 * The shared toolbar-filter PRESETS a column can point at. The column supplies
 * only its own label (its `header`) + which preset; the toolbar's multi-filter
 * config + apply logic are DERIVED from these (see `deriveFilterColumns` /
 * `applyTableFilters`), so two columns of the same kind (e.g. "Due date" and
 * "Start date") reuse the same date-picker filter with no per-page hardcoding.
 */
export type TableColumnFilterVariant =
  "text" | "number" | "date" | "option" | "multiOption"

/** A column's plug into the toolbar multi-filter — a preset variant + (for the
 * option variants) the selectable values, which default to the column's own
 * `options` when omitted. */
export interface TableColumnFilterPreset {
  readonly variant: TableColumnFilterVariant
  readonly options?: readonly TableColumnOption[]
}

/** One table column, described as pure data — NO cell renderer, NO ColumnDef. */
export interface TableColumnSpec {
  readonly id: string
  readonly header: string
  readonly kind: TableColumnKind
  /** `select` / `badge` options (value ↔ label). */
  readonly options?: readonly TableColumnOption[]
  /** How this column's cells can be edited (grid vs Inspector). Default "readonly". */
  readonly edit?: TableColumnEditMode
  /** Freeze the column at the left or right body edge. */
  readonly pin?: "left" | "right"
  /** Participates in header/toolbar sorting. Default true. */
  readonly enableSort?: boolean
  /** Can be hidden from the toolbar column manager. Default true. */
  readonly enableHide?: boolean
  /** Faceted-filter on this column (Status-style multi-select). Default false. */
  readonly enableFilter?: boolean
  /**
   * Expose this column in the toolbar's multi-filter via a shared preset. The
   * toolbar filter config + apply logic are derived from this (see
   * `deriveFilterColumns` / `applyTableFilters`); `header` supplies the label.
   * Independent of `enableFilter` (the in-grid faceted filter) — see
   * `docs/specs/TABLE-FILTERS.md`.
   */
  readonly filter?: TableColumnFilterPreset
  readonly align?: TableColumnAlign
  /** Initial column width in px. Default 160. */
  readonly width?: number
}

/** A cell value — plain, serializable. */
export type TableCellValue = string | number | null

/** A pinned-columns layout — the left/right frozen groups, by column id. */
export interface PinnedColumns {
  readonly left?: readonly string[]
  readonly right?: readonly string[]
}

/**
 * Keep the Table section's structural columns anchored on every pinning write:
 * `select` first in the left group, `actions` last in the right group. So a user
 * pinning a data column via the header menu — TanStack appends it to the END of
 * the group — slots it BETWEEN the checkbox and the action column, never
 * outside. Fed to the controlled `columnPinning` in `useDataTable`, so it also
 * repairs a within-group drag that would otherwise dislodge an anchor.
 */
export function anchorStructuralPins(
  pinning: PinnedColumns,
  opts: { hasSelect: boolean; hasActions: boolean },
): { left: string[]; right: string[] } {
  const left = [...(pinning.left ?? [])]
  const right = [...(pinning.right ?? [])]
  return {
    left: opts.hasSelect
      ? ["select", ...left.filter((id) => id !== "select")]
      : left,
    right: opts.hasActions
      ? [...right.filter((id) => id !== "actions"), "actions"]
      : right,
  }
}

/** One row: plain data keyed by column id (plus the id column named by `rowIdKey`). */
export type TableSectionRow = Readonly<Record<string, TableCellValue>>

/** Pure feature flags — no handlers. */
export interface TableSectionFeatures {
  /** Row selection mode. `"multi"` adds a leading select column. Default "multi". */
  readonly selection?: "multi" | "none"
  /** Universal search over the rows (global filter). Default true. */
  readonly search?: boolean
  /**
   * Leading select column shows a "maximize" affordance (on hover / when a
   * single row is selected) to open the row inspector. Hidden while several
   * rows are selected. Default false.
   */
  readonly inspect?: boolean
  /**
   * Right-pinned column of per-row action buttons (two confirm + one more).
   * Placeholder wiring for now — the handlers land later. Default false.
   */
  readonly rowActions?: boolean
}

export interface SectionTableProps {
  readonly columns: readonly TableColumnSpec[]
  /** Rows keyed by column id; each MUST carry the `rowIdKey` value. */
  readonly rows: readonly TableSectionRow[]
  /** The row field that is the stable id (selection/sort survive by it). */
  readonly rowIdKey: string
  readonly features?: TableSectionFeatures
  /** Optional URL/scroll anchor slug applied as the section's DOM `id`. */
  readonly anchor?: string
  /** Shown when the table has no rows. */
  readonly emptyText?: string
  /**
   * Harvest-name prefix for editable inputs (`${name}[${rowId}][${colId}]`).
   * Defaults to `anchor`; leave both unset for a demo table you won't submit.
   */
  readonly name?: string
}

/**
 * What the renderer receives: the props minus the section-level `anchor`, with the
 * always-filled `features` flipped to required — so a new props field can't be
 * silently dropped from what the renderer sees.
 */
export type SectionTablePayload = Omit<
  SectionTableProps,
  "anchor" | "features"
> & {
  readonly features: Required<TableSectionFeatures>
}

/**
 * The sole constructor for a Table-section descriptor — the full data grid the
 * Table archetype composes, built on TanStack Table v8 (Doc `table-stack-research`).
 * Columns + rows + feature flags are pure serializable data (survive the RSC
 * boundary); the live TanStack instance, all cell renderers, and every handler
 * live inside the interactive renderer (`./section-table-renderer`). Server-safe.
 */
export function sectionTable({
  anchor,
  columns,
  rows,
  rowIdKey,
  features,
  emptyText,
  name,
}: SectionTableProps): SectionDescriptor<"table", SectionTablePayload> {
  if (process.env.NODE_ENV !== "production") {
    const ids = new Set<string>()
    for (const col of columns) {
      if (ids.has(col.id))
        throw new Error(`sectionTable: duplicate column id "${col.id}".`)
      ids.add(col.id)
    }
    if (!columns.some((col) => col.id === rowIdKey) && rowIdKey.length === 0)
      throw new Error(
        "sectionTable: `rowIdKey` must be a non-empty field name.",
      )
  }
  return defineSection(
    "table",
    {
      columns,
      rows,
      rowIdKey,
      features: {
        selection: features?.selection ?? "multi",
        search: features?.search ?? true,
        inspect: features?.inspect ?? false,
        rowActions: features?.rowActions ?? false,
      },
      emptyText,
      name: name ?? anchor,
    },
    // The grid fills the remaining body height and scrolls internally.
    { anchor, fill: true },
  )
}
