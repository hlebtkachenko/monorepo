import type { SortingFn } from "@tanstack/react-table"

import { formatDecimal } from "@workspace/ui/lib/format-number"

import type {
  TableCellValue,
  TableColumnKind,
  TableSectionRow,
} from "./section-table"

/**
 * Display + comparison helpers for the `currency` and `date` cell kinds — pure,
 * server-safe, and independently unit-tested (`section-cell-format.test.ts`).
 *
 * The invariant: a `currency` cell is carried as a decimal STRING and is NEVER
 * coerced to a `number` for storage or display (that would lose precision on
 * values past IEEE-754 double). `Number()` appears here ONLY transiently, inside
 * the sort comparator, exactly as the spec allows. Display goes through
 * `formatDecimal`, which hands the exact string straight to `Intl.NumberFormat`.
 */

/** Format a `currency` cell (a decimal string) for display — cs-CZ, grouped,
 *  2 decimals. Precision-safe: the string never passes through `Number()`. */
export function formatCurrencyCell(value: TableCellValue): string {
  return formatDecimal(value)
}

/** Format a `date` cell (an ISO date string) for display — cs-CZ short date
 *  (`1. 6. 2026`). A missing / unparseable value renders as the raw text. */
export function formatDateCell(value: TableCellValue): string {
  if (value === null || value === undefined) return ""
  const raw = String(value).trim()
  if (raw === "") return ""
  const time = Date.parse(raw)
  if (Number.isNaN(time)) return raw
  return new Intl.DateTimeFormat("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    // Date cells are calendar dates: a date-only ISO string parses to UTC
    // midnight, so format in UTC too — otherwise a runner in a negative-offset
    // zone would render "2026-06-01" as the previous day.
    timeZone: "UTC",
  }).format(new Date(time))
}

/**
 * Numeric ordering key for a `currency` cell. Parses the decimal string to a
 * number ONLY for the comparison (transient — the stored value stays a string).
 * A missing / non-numeric cell sinks to the bottom of an ascending sort.
 */
function currencySortKey(value: TableCellValue): number {
  if (value === null || value === undefined) return Number.NEGATIVE_INFINITY
  const raw = typeof value === "number" ? value : Number(String(value).trim())
  return Number.isFinite(raw) ? raw : Number.NEGATIVE_INFINITY
}

/** Chronological ordering key for a `date` cell (epoch ms). Missing / invalid
 *  dates sink to the bottom of an ascending sort. */
function dateSortKey(value: TableCellValue): number {
  if (value === null || value === undefined) return Number.NEGATIVE_INFINITY
  const time = Date.parse(String(value).trim())
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time
}

/** Compare two `currency` cells numerically (decimal strings → transient number). */
export function compareCurrency(a: TableCellValue, b: TableCellValue): number {
  const ka = currencySortKey(a)
  const kb = currencySortKey(b)
  return ka === kb ? 0 : ka > kb ? 1 : -1
}

/** Compare two `date` cells chronologically (ISO strings → epoch ms). */
export function compareDate(a: TableCellValue, b: TableCellValue): number {
  const ka = dateSortKey(a)
  const kb = dateSortKey(b)
  return ka === kb ? 0 : ka > kb ? 1 : -1
}

/**
 * The default TanStack `sortingFn` a column KIND needs, or `undefined` to keep
 * TanStack's inferred `auto` sort. `text` / `number` / `select` / `badge` sort
 * fine on their raw cell values; only the string-carried `currency` and `date`
 * kinds need a comparator that reads through the string. Exhaustive over the
 * closed `TableColumnKind` union — a new kind is a compile error here.
 */
export function sortingFnForKind(
  kind: TableColumnKind,
): SortingFn<TableSectionRow> | undefined {
  switch (kind) {
    case "currency":
      return (a, b, id) =>
        compareCurrency(
          a.getValue(id) as TableCellValue,
          b.getValue(id) as TableCellValue,
        )
    case "date":
      return (a, b, id) =>
        compareDate(
          a.getValue(id) as TableCellValue,
          b.getValue(id) as TableCellValue,
        )
    case "text":
    case "number":
    case "select":
    case "badge":
      return undefined
  }
}
