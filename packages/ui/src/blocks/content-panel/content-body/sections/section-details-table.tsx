import { type SectionDescriptor, defineSection } from "./section"
import type { DetailsFormSelectOption } from "./section-details-form"

/** Columns snap to the same fixed 6-track grid the Form section's fields use. */
export type DetailsTableColumnSpan = 1 | 2 | 3 | 4 | 5 | 6

/** Horizontal alignment of a column's header + cells. Default "start". */
export type DetailsTableColumnAlign = "start" | "end"

/**
 * A column's control — the SAME description drives the editable cell AND how the
 * display cell reads its value back. A closed discriminated union ("interactivity
 * as data"): add an arm here + its case in the renderer. Today: a text input, our
 * Select dropdown, and the tags field. `combobox` / `creatable-combobox` are the
 * next arms (same shape: options + optional create).
 */
export type DetailsTableControl =
  | {
      readonly kind: "text"
      readonly placeholder?: string
      readonly inputMode?: "text" | "numeric"
    }
  | {
      readonly kind: "select"
      readonly placeholder?: string
      readonly options: readonly DetailsFormSelectOption[]
    }
  | {
      readonly kind: "tags"
      readonly placeholder?: string
    }

/** One table column, described as data. */
export interface DetailsTableColumn {
  readonly id: string
  readonly header: string
  /**
   * Grid tracks this column occupies (1–6), snapped to fixed starts like the
   * Form's field grid. In editable mode the last track is reserved for the
   * Edit/Delete column, so data spans should sum to ≤5. Default 1.
   */
  readonly span?: DetailsTableColumnSpan
  readonly align?: DetailsTableColumnAlign
  readonly control: DetailsTableControl
}

/** A cell value — a string for text/select, a string list for a tags column. */
export type DetailsTableCellValue = string | readonly string[]

/** One row: a stable id and its cell values keyed by column id. */
export interface DetailsTableRow {
  readonly id: string
  readonly cells: Readonly<Record<string, DetailsTableCellValue>>
  /** Disables the configured row action for this row. */
  readonly actionDisabled?: boolean
  /** Shows the row action's busy label and disables it. */
  readonly actionBusy?: boolean
}

/** Optional command shown on every row of a read-only table. */
export interface DetailsTableRowAction {
  readonly label: string
  readonly busyLabel?: string
  readonly actionId: string
  readonly variant?: "default" | "outline" | "destructive"
  readonly header?: string
  readonly confirmTitle?: string
  readonly confirmDescription?: string
  readonly confirmLabel?: string
}

/** Icon name for an extra action button (resolved in the renderer). */
export type DetailsTableActionIcon = "import"

/**
 * An extra action button rendered after the always-first Add button — a real
 * navigation `link` (data only, no callback). The button set beyond Add is
 * page-configured and deliberately open.
 */
export interface DetailsTableAction {
  readonly id: string
  readonly label: string
  readonly icon?: DetailsTableActionIcon
  readonly href: string
}

/**
 * `editable`: rows display read-only until their Edit icon flips that row to
 * inputs (a newly-added row starts editable); Add/Delete are available.
 * `readonly`: pure display — the table cannot be configured from this page (no
 * Add, no Edit/Delete column). Default "editable".
 */
export type DetailsTableMode = "editable" | "readonly"

/**
 * A small line under the table pointing at where the data is actually editable —
 * for a read-only table synced from elsewhere. Renders as "{text} {linkLabel} ↗"
 * with an underlined link + an up-right arrow.
 */
export interface DetailsTableEditHint {
  /** Lead-in copy. Default "To edit this data, go to". */
  readonly text?: string
  /** The underlined link label. */
  readonly linkLabel: string
  /** Link target. */
  readonly href: string
}

export interface SectionDetailsTableProps {
  /** Left-column heading for the group. */
  readonly title: string
  /** Left-column supporting copy under the heading. */
  readonly description?: string
  /** Optional URL/scroll anchor slug applied as the section's DOM `id`. */
  readonly anchor?: string
  /** Editable (default) or read-only. */
  readonly mode?: DetailsTableMode
  readonly columns: readonly DetailsTableColumn[]
  readonly rows: readonly DetailsTableRow[]
  /** Per-row command for a read-only table, dispatched with `{ rowId }`. */
  readonly rowAction?: DetailsTableRowAction
  /**
   * Label for the always-first Add button (e.g. "Add account"). Editable mode
   * only; omit to hide the Add button.
   */
  readonly addLabel?: string
  /** Extra action buttons after Add (editable mode only). */
  readonly actions?: readonly DetailsTableAction[]
  /** Header text for the trailing Edit/Delete column. Default "Actions". */
  readonly actionsHeader?: string
  /** A "to edit, go to …" link under the table — for a read-only synced table. */
  readonly editHint?: DetailsTableEditHint
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
 * fields the factory always fills (`mode`, `actions`, `actionsHeader`) flipped to
 * required. Derived from the props so a new props field can't silently be dropped
 * from what the renderer sees.
 */
export type SectionDetailsTablePayload = Omit<
  SectionDetailsTableProps,
  "anchor" | "mode" | "actions" | "actionsHeader"
> &
  Required<Pick<SectionDetailsTableProps, "mode" | "actions" | "actionsHeader">>

/**
 * The sole constructor for a Details Table-section descriptor — the Details Form
 * section with its right column swapped for a grid-based table (columns + rows as
 * pure data) that aligns to the same 6-track grid as the form fields. Server-safe
 * (no `"use client"`); the interactive renderer lives in
 * `./section-details-table-renderer`.
 */
export function sectionDetailsTable({
  anchor,
  title,
  description,
  mode = "editable",
  columns,
  rows,
  rowAction,
  addLabel,
  actions = [],
  actionsHeader = "Actions",
  editHint,
  emptyText,
  name,
}: SectionDetailsTableProps): SectionDescriptor<
  "details-table",
  SectionDetailsTablePayload
> {
  // The columns snap to a fixed 6-track grid; an editable table reserves the
  // 6th track for the Edit/Delete column, so data spans must fit the remainder.
  // Fail loud in dev on an over-budget layout (the actions cell is hard-pinned
  // to track 6 — an overflow would silently wrap it to a second row).
  if (process.env.NODE_ENV !== "production") {
    const spanTotal = columns.reduce((sum, col) => sum + (col.span ?? 1), 0)
    const budget = mode === "editable" || rowAction != null ? 5 : 6
    if (spanTotal > budget) {
      throw new Error(
        `sectionDetailsTable("${title}"): column spans sum to ${spanTotal}, ` +
          `but a ${mode} table allows at most ${budget} of the 6 tracks` +
          `${mode === "editable" ? " (track 6 is the Edit/Delete column)" : ""}.`,
      )
    }
  }
  return defineSection(
    "details-table",
    {
      title,
      description,
      mode,
      columns,
      rows,
      rowAction,
      addLabel,
      actions,
      actionsHeader,
      editHint,
      emptyText,
      name: name ?? anchor,
    },
    { anchor },
  )
}
