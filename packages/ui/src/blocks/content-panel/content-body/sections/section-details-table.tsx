import { type SectionDescriptor, defineSection } from "./section"
import type { DetailsFormSelectOption } from "./section-details-form"

/** Horizontal alignment of a column's header + cells. Default "start". */
export type DetailsTableColumnAlign = "start" | "end"

/**
 * Badge tones for display cells, mapped to design tokens in the renderer
 * (`neutral` → secondary, `success` → `--success`, `primary` → primary,
 * `outline` → outline). Data only — never a raw colour.
 */
export type DetailsTableBadgeTone =
  "neutral" | "success" | "primary" | "outline"

/**
 * How a column's cells render in READONLY mode. A closed discriminated union —
 * the "interactivity/format as data" seam: add an arm here + its case in the
 * renderer. `badge-or-dash` renders a badge when the cell has a value, an em
 * dash when it is empty (e.g. a "Primary" flag column).
 */
export type DetailsTableCellDisplay =
  | { readonly kind: "text" }
  | { readonly kind: "mono" }
  | { readonly kind: "badge"; readonly tone?: DetailsTableBadgeTone }
  | { readonly kind: "badge-or-dash"; readonly tone?: DetailsTableBadgeTone }

/**
 * The control a column's cells use in EDITABLE mode (and for appended rows).
 * Defaults to a text input. Same closed shape as the Form section's controls.
 */
export type DetailsTableEditControl =
  | {
      readonly kind: "text"
      readonly placeholder?: string
      readonly inputMode?: "text" | "numeric"
    }
  | {
      readonly kind: "select"
      readonly placeholder?: string
      readonly options?: readonly DetailsFormSelectOption[]
    }

/** One table column, described as data. */
export interface DetailsTableColumn {
  readonly id: string
  readonly header: string
  /** Alignment of the header + cells. Default "start". */
  readonly align?: DetailsTableColumnAlign
  /** Readonly display style for this column's cells. Default `{ kind: "text" }`. */
  readonly display?: DetailsTableCellDisplay
  /** Editable control (mode "editable" + appended rows). Default text input. */
  readonly edit?: DetailsTableEditControl
}

/**
 * A per-row cell value — a plain string, or a value plus a per-row badge tone
 * override (so one column can carry, say, both `success` and `neutral` pills).
 */
export type DetailsTableCellValue =
  string | { readonly value: string; readonly tone?: DetailsTableBadgeTone }

/** One row: a stable id and its cell values keyed by column id. */
export interface DetailsTableRow {
  readonly id: string
  readonly cells: Readonly<Record<string, DetailsTableCellValue>>
}

/** A closed set of action-button icons (name-strings), resolved in the renderer. */
export type DetailsTableActionIcon = "add" | "import"

/**
 * An action button rendered under the table, described AS DATA — no callback
 * crosses the descriptor. Two behaviours, both genuinely functional in the
 * closed renderer:
 *   - `add-row` (default): appends a blank EDITABLE row (local renderer state),
 *     the honest "add new" affordance even on a readonly display table.
 *   - `link`: renders a real anchor that navigates to `href` (for flows the
 *     library cannot own, e.g. an import wizard route).
 */
export type DetailsTableAction =
  | {
      readonly id: string
      readonly label: string
      readonly icon?: DetailsTableActionIcon
      readonly behavior?: "add-row"
    }
  | {
      readonly id: string
      readonly label: string
      readonly icon?: DetailsTableActionIcon
      readonly behavior: "link"
      readonly href: string
    }

/**
 * `readonly`: existing rows render as display cells (text/mono/badge); the only
 * mutation is "+ New", which appends editable rows. `editable`: every existing
 * row renders as inputs seeded from its data, editable in place. Appended rows
 * are always editable and removable. Default "readonly".
 */
export type DetailsTableMode = "readonly" | "editable"

export interface SectionDetailsTableProps {
  /** Left-column heading for the group. */
  readonly title: string
  /** Left-column supporting copy under the heading. */
  readonly description?: string
  /** Optional URL/scroll anchor slug applied as the section's DOM `id`. */
  readonly anchor?: string
  /** Readonly display (default) or editable inputs. */
  readonly mode?: DetailsTableMode
  readonly columns: readonly DetailsTableColumn[]
  readonly rows: readonly DetailsTableRow[]
  /** Action buttons under the table (e.g. New, Import). */
  readonly actions?: readonly DetailsTableAction[]
  /** Shown when the table has no rows. */
  readonly emptyText?: string
  /**
   * Harvest-name prefix for editable inputs (`${name}[${rowId}][${colId}]`).
   * Defaults to `anchor`; leave both unset for a demo table you won't submit.
   */
  readonly name?: string
}

export interface SectionDetailsTablePayload {
  readonly title: string
  readonly description?: string
  readonly mode: DetailsTableMode
  readonly columns: readonly DetailsTableColumn[]
  readonly rows: readonly DetailsTableRow[]
  readonly actions: readonly DetailsTableAction[]
  readonly emptyText?: string
  readonly name?: string
}

/**
 * The sole constructor for a Details Table-section descriptor — the Details Form
 * section with its right column swapped for a data-driven table (columns + rows
 * as pure data) plus action buttons below. Server-safe (no `"use client"`); the
 * interactive renderer lives in `./section-details-table-renderer`.
 */
export function sectionDetailsTable({
  anchor,
  title,
  description,
  mode = "readonly",
  columns,
  rows,
  actions = [],
  emptyText,
  name,
}: SectionDetailsTableProps): SectionDescriptor<
  "details-table",
  SectionDetailsTablePayload
> {
  return defineSection(
    "details-table",
    {
      title,
      description,
      mode,
      columns,
      rows,
      actions,
      emptyText,
      name: name ?? anchor,
    },
    { anchor },
  )
}
