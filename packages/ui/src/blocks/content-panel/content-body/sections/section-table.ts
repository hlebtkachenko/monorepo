import { type SectionDescriptor, defineSection } from "./section"

/**
 * A column's cell/editor kind — a CLOSED union. The renderer maps each to OUR
 * shadcn control (display text · number · a Select dropdown · a Badge · a
 * formatted money cell · a formatted date), and `filterVariantForKind` maps
 * each to its default toolbar filter. A column's KIND canonically determines
 * BOTH its cell control and its filter, from these two global places — never
 * per page. Adding a kind = three global edits: this union + an arm in the
 * exhaustive `KIND_FILTER_VARIANT` + a case in the renderer's cell switch
 * (`displayCell`) and its sort map (`sortingFnForKind`) — "interactivity as
 * data".
 *
 * - `currency`: value carried as a decimal STRING (never a float — money keeps
 *   full precision). Displays right-aligned + cs-CZ formatted, sorts NUMERICALLY
 *   (the string is parsed to a number only inside the comparator), filters as a
 *   number range, and is read-only in the grid (never routed through the
 *   inline `Number()` editor). See `section-cell-format`.
 * - `date`: value carried as an ISO date string. Displays cs-CZ short date,
 *   sorts chronologically, filters with the date picker.
 *
 * Documented next arm (control, filter): `tags` (tag chips, `multiOption`).
 */
export type TableColumnKind =
  "text" | "number" | "select" | "badge" | "currency" | "date"

/**
 * The SINGLE global mapping from a column KIND to its default toolbar-filter
 * VARIANT (`text→text`, `number→number`, `select→option`, `badge→option`,
 * `currency→number`, `date→date`). A `select` of companies with `filter: true`
 * is therefore an OPTION dropdown, never a text search; a `currency` column
 * gets a NUMBER range. Backed by an exhaustive `Record<TableColumnKind, …>`, so
 * adding a kind to the union is a compile error here until it is mapped —
 * keeping the closed-union extension story honest. Read once through
 * `resolveColumnFilter`, never recomputed per page.
 */
export function filterVariantForKind(
  kind: TableColumnKind,
): TableColumnFilterVariant {
  return KIND_FILTER_VARIANT[kind]
}

const KIND_FILTER_VARIANT: Record<TableColumnKind, TableColumnFilterVariant> = {
  text: "text",
  number: "number",
  select: "option",
  badge: "option",
  currency: "number",
  date: "date",
}

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
  /**
   * Marks this as the record's IDENTITY column (its business number, e.g. a
   * document number from a number series). REQUIRED once per Table that enables
   * the row inspector (`features.inspect`): the Open-inspector button renders
   * right-aligned in this column's cells. Exactly one column may carry it.
   */
  readonly role?: "id"
  /** `select` / `badge` options (value ↔ label). */
  readonly options?: readonly TableColumnOption[]
  /**
   * Make a `select` column's option set EXTENSIBLE from the table: its inline
   * editor becomes a CreatableCombobox (type-to-search + "Create …"), and a value
   * the user creates is added to this column's checkable `options` on the spot
   * (and forwarded to the page via `ArchetypeTable.onCreateOption` to persist —
   * e.g. adding a new counterparty to the directory). Default false → a plain
   * fixed-option Select. Only meaningful for `kind: "select"`.
   */
  readonly creatable?: boolean
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
   * The column's place in the toolbar's multi-filter. Filterable BY DEFAULT so a
   * new column just works — you never wire a filter per column.
   * - absent / `true` — filterable, deriving EVERYTHING from `kind`: the variant
   *   is `filterVariantForKind(kind)`, and the option variants default their
   *   selectable values to this column's own `options` (a `select` becomes an
   *   option dropdown for free, never a bare text search).
   * - `{ variant, options? }` — an explicit override of the kind default.
   * - `false` — opt OUT (e.g. the column delegated to the single Status filter).
   *
   * Normalized in ONE place, `resolveColumnFilter`, which both
   * `deriveFilterColumns` and `applyTableFilters` consume — so kind→variant is
   * computed once, never per page. `header` supplies the label. Independent of
   * `enableFilter` (the in-grid faceted filter) — see `docs/specs/TABLE-FILTERS.md`.
   */
  readonly filter?: boolean | TableColumnFilterPreset
  readonly align?: TableColumnAlign
  /** Initial column width in px. Default 160. */
  readonly width?: number
}

/**
 * Normalize a column's `filter` field to a concrete preset, or `null` when the
 * column opts OUT of the toolbar multi-filter. Filterable BY DEFAULT — the SINGLE
 * seam where the kind→variant default is applied:
 *
 * - `false` → `null` (opt out).
 * - absent / `true` → derive from `kind`: `{ variant: filterVariantForKind(kind) }`;
 *   the option variants' selectable values fall back to the column's own `options`
 *   at build time (in `deriveFilterColumns`).
 * - `{ variant, options? }` → taken as-is (an explicit override).
 *
 * Both `deriveFilterColumns` and `applyTableFilters` route through this, so the
 * kind→variant default lands in exactly one place and is never recomputed per
 * page.
 */
export function resolveColumnFilter(
  spec: TableColumnSpec,
): TableColumnFilterPreset | null {
  const { filter } = spec
  if (filter === false) return null
  if (filter === undefined || filter === true)
    return { variant: filterVariantForKind(spec.kind) }
  return filter
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
  // Strip BOTH structural ids from BOTH groups first, so a malformed `select`
  // on the right (or `actions` on the left) can never survive re-insertion.
  const isStructural = (id: string) => id === "select" || id === "actions"
  const left = (pinning.left ?? []).filter((id) => !isStructural(id))
  const right = (pinning.right ?? []).filter((id) => !isStructural(id))
  return {
    left: opts.hasSelect ? ["select", ...left] : left,
    right: opts.hasActions ? [...right, "actions"] : right,
  }
}

/** One row: plain data keyed by column id (plus the id column named by `rowIdKey`). */
export type TableSectionRow = Readonly<Record<string, TableCellValue>>

/**
 * Pure feature flags — no handlers. Selection is NOT a flag: the leading select
 * column is mandatory and always rendered (spec §6), so there is nothing to
 * toggle. These flags only add OPTIONAL surface on top of that baseline.
 */
export interface TableSectionFeatures {
  /** Universal search over the rows (global filter). Default true. */
  readonly search?: boolean
  /**
   * Adds a per-row "Open inspector" button right-aligned in the `role: "id"`
   * column (revealed on row hover), wired through `SectionTableProvider` to the
   * archetype's `renderInspector` Sheet (inert without that provider). Requires
   * one column with `role: "id"`. Default false.
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
  /**
   * Stable, page-unique key for persisting the user's column layout (widths /
   * order / pinning) across reloads. When omitted the renderer auto-derives one
   * from the page path + section name, so most pages get persistence for free;
   * set it explicitly when a page hosts two tables that would otherwise collide.
   */
  readonly persistKey?: string
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
  persistKey,
}: SectionTableProps): SectionDescriptor<"table", SectionTablePayload> {
  if (process.env.NODE_ENV !== "production") {
    const ids = new Set<string>()
    for (const col of columns) {
      if (ids.has(col.id))
        throw new Error(`sectionTable: duplicate column id "${col.id}".`)
      ids.add(col.id)
      // Every data column MUST be filterable — the leading checkbox is the only
      // column allowed to have no filter. Columns are filterable BY DEFAULT, so
      // this only trips on an explicit `filter: false`. A column delegated to the
      // Single Status Filter still resolves to a preset (it's routed, not opted
      // out), so it passes. See docs/specs/TABLE-FILTERS.md.
      if (resolveColumnFilter(col) === null)
        throw new Error(
          `sectionTable: column "${col.id}" opts out of filtering (\`filter: false\`). Every data column must be filterable; remove the \`filter: false\`.`,
        )
      // A creatable option set is only meaningful for a `select` cell editor.
      if (col.creatable && col.kind !== "select")
        throw new Error(
          `sectionTable: column "${col.id}" is \`creatable\` but its kind is "${col.kind}"; only \`kind: "select"\` supports a creatable option set.`,
        )
    }
    if (rowIdKey.length === 0)
      throw new Error(
        "sectionTable: `rowIdKey` must be a non-empty field name.",
      )
    const idColumns = columns.filter((col) => col.role === "id")
    if (idColumns.length > 1)
      throw new Error('sectionTable: at most one column may have `role: "id"`.')
    // A Table with the row inspector needs an identity column to host the
    // right-aligned Open-inspector button (spec §3b).
    if (features?.inspect && idColumns.length === 0)
      throw new Error(
        'sectionTable: a Table with `features.inspect` requires one column with `role: "id"`.',
      )
  }
  return defineSection(
    "table",
    {
      columns,
      rows,
      rowIdKey,
      features: {
        search: features?.search ?? true,
        inspect: features?.inspect ?? false,
        rowActions: features?.rowActions ?? false,
      },
      emptyText,
      name: name ?? anchor,
      persistKey,
    },
    // The grid fills the remaining body height and scrolls internally.
    { anchor, fill: true },
  )
}
