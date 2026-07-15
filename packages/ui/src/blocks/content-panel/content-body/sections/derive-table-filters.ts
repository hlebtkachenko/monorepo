import {
  createColumnConfigHelper,
  dateFilterFn,
  multiOptionFilterFn,
  numberFilterFn,
  optionFilterFn,
  textFilterFn,
  type ColumnConfig,
  type FilterModel,
  type FiltersState,
} from "@workspace/ui/components/filter-bar"
import {
  Calendar1,
  CaseUpper,
  ChevronsUpDown,
  CircleDot,
  SquareSigma,
} from "@workspace/ui/lib/icons"

import { resolveColumnFilter } from "./section-table"
import type {
  TableColumnFilterVariant,
  TableColumnSpec,
  TableSectionRow,
} from "./section-table"

/**
 * Column-driven toolbar filters. A column spec opts in with `filter` (either the
 * `true` shorthand, which derives the variant from `kind`, or an explicit
 * `{ variant }` preset); the toolbar's multi-filter config (`deriveFilterColumns`)
 * and the row apply-pass (`applyTableFilters`) both run each spec through the
 * single `resolveColumnFilter` seam, so a page never hand-writes a
 * `createColumnConfigHelper` chain or a per-column `matchesFilters`, and
 * kind→variant is resolved once. Two columns of the same variant reuse the same
 * filter UI; each just supplies its own `header` as the label. See
 * `docs/specs/TABLE-FILTERS.md`.
 */

/** Default filter icon per preset variant (a column may still carry its own).
 * `multiOption` uses `ChevronsUpDown` — the closest available glyph to the
 * requested `chevrons-up-down-square`, which isn't in the pinned lucide 1.24.0. */
const VARIANT_ICON: Record<TableColumnFilterVariant, typeof CaseUpper> = {
  text: CaseUpper,
  number: SquareSigma,
  date: Calendar1,
  option: CircleDot,
  multiOption: ChevronsUpDown,
}

/** A comma-joined tag cell → the trimmed, non-empty string[] the multiOption
 * filter expects. Each split segment is trimmed so `"a, b"` doesn't leave a
 * leading-space `" b"` entry, and empty segments (from `"a,,b"` or a trailing
 * comma) are dropped. */
function toTags(value: unknown): string[] {
  return String(value ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
}

/**
 * A numeric cell reads as `NaN` when the value is missing (`null`/`undefined`),
 * keeping "no value" distinct from a real `0` — otherwise an "is 0" filter
 * would match rows that never had a value at all. `applyTableFilters`
 * explicitly excludes `NaN` before it ever reaches `numberFilterFn`.
 */
function toFilterNumber(value: unknown): number {
  return value === null || value === undefined ? NaN : Number(value)
}

/**
 * A date cell — `Invalid Date` when missing or malformed. `applyTableFilters`
 * explicitly excludes an invalid date rather than letting it fall into
 * date-fns comparisons with unspecified behavior.
 */
function toFilterDate(value: unknown): Date {
  return new Date(String(value ?? ""))
}

/**
 * Build the bazza FilterBar `columnsConfig` from the columns that opt into the
 * toolbar filter. Each spec is normalized via `resolveColumnFilter` (so the
 * `filter: true` shorthand's kind→variant default is applied here too);
 * accessors read each cell from the row record by column id and coerce it to the
 * shape the preset expects; option values default to the column's own `options`.
 */
export function deriveFilterColumns(
  columns: readonly TableColumnSpec[],
): ColumnConfig<TableSectionRow>[] {
  const helper = createColumnConfigHelper<TableSectionRow>()
  const configs: ColumnConfig<TableSectionRow>[] = []
  for (const col of columns) {
    const preset = resolveColumnFilter(col)
    if (!preset) continue
    const label = col.header
    const icon = VARIANT_ICON[preset.variant]
    const options = (preset.options ?? col.options)?.map((o) => ({
      value: o.value,
      label: o.label,
    }))
    switch (preset.variant) {
      case "text":
        configs.push(
          helper
            .text()
            .id(col.id)
            .accessor((row) => String(row[col.id] ?? ""))
            .displayName(label)
            .icon(icon)
            .build() as ColumnConfig<TableSectionRow>,
        )
        break
      case "number":
        configs.push(
          helper
            .number()
            .id(col.id)
            .accessor((row) => toFilterNumber(row[col.id]))
            .displayName(label)
            .icon(icon)
            .build() as ColumnConfig<TableSectionRow>,
        )
        break
      case "date":
        configs.push(
          helper
            .date()
            .id(col.id)
            .accessor((row) => toFilterDate(row[col.id]))
            .displayName(label)
            .icon(icon)
            .build() as ColumnConfig<TableSectionRow>,
        )
        break
      case "option":
        configs.push(
          helper
            .option()
            .id(col.id)
            .accessor((row) => String(row[col.id] ?? ""))
            .displayName(label)
            .icon(icon)
            .options(options ?? [])
            .build() as ColumnConfig<TableSectionRow>,
        )
        break
      case "multiOption":
        configs.push(
          helper
            .multiOption()
            .id(col.id)
            .accessor((row) => toTags(row[col.id]))
            .displayName(label)
            .icon(icon)
            .options(options ?? [])
            .build() as ColumnConfig<TableSectionRow>,
        )
        break
    }
  }
  return configs
}

/**
 * Apply an active `FiltersState` to the rows (the client pre-filter the page
 * feeds the section as its `rows`). Each filter is dispatched to the preset
 * `filterFn` for its column's variant — derived from the same specs, so it stays
 * in lockstep with `deriveFilterColumns`.
 */
export function applyTableFilters(
  rows: readonly TableSectionRow[],
  filters: FiltersState,
  columns: readonly TableColumnSpec[],
): TableSectionRow[] {
  if (filters.length === 0) return [...rows]
  const variantById = new Map<string, TableColumnFilterVariant>()
  for (const col of columns) {
    const preset = resolveColumnFilter(col)
    if (preset) variantById.set(col.id, preset.variant)
  }
  return rows.filter((row) =>
    filters.every((filter) => {
      const variant = variantById.get(filter.columnId)
      // A filter targeting a column with no preset, or whose stored `type`
      // no longer matches the column's current variant (e.g. the column was
      // reconfigured to a different preset while a stale filter model from
      // the old variant survived in state), does not narrow. Casting an
      // incompatible FilterModel into another variant's filterFn is unsafe —
      // e.g. dateFilterFn indexes its operator table by the model's
      // `operator`, which throws for an operator that isn't a valid
      // DateFilterOperator.
      if (variant === undefined || filter.type !== variant) return true
      const raw = row[filter.columnId]
      switch (variant) {
        case "text":
          return textFilterFn(String(raw ?? ""), filter as FilterModel<"text">)
        case "number": {
          const value = toFilterNumber(raw)
          // A missing numeric cell must never satisfy an active filter —
          // otherwise "is 0" (and similar) would match rows with no value.
          return Number.isNaN(value)
            ? false
            : numberFilterFn(value, filter as FilterModel<"number">)
        }
        case "date": {
          const value = toFilterDate(raw)
          // A missing or malformed date must never satisfy an ordinary
          // comparison; treat it as "no value" and exclude the row.
          return Number.isNaN(value.getTime())
            ? false
            : dateFilterFn(value, filter as FilterModel<"date">)
        }
        case "option":
          return optionFilterFn(
            String(raw ?? ""),
            filter as FilterModel<"option">,
          )
        case "multiOption":
          return multiOptionFilterFn(
            toTags(raw),
            filter as FilterModel<"multiOption">,
          )
      }
    }),
  )
}
