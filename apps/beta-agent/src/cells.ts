/**
 * Cell readers — one layer above the vendored CSV tokenizer, one layer below
 * the dataset contracts.
 *
 * WHY THESE EXIST SEPARATELY FROM `src/vendor/csv.ts`. That file is a verbatim
 * copy of the portal's own reader and must stay byte-identical (see
 * `src/vendor/vendor.test.ts`), so nothing office-specific may be added to it.
 * The two readers below are exactly the office-specific part: a DATE and an
 * INSTANT, neither of which the portal's manual fallback ever needs (its three
 * datasets carry money and text only) and both of which a Money S3 registry
 * export is full of.
 *
 * NOTHING IS EVER GUESSED. Every reader returns `null` for an absent column or
 * a blank cell — an omission is an omission (spec §0.4), never a zero and never
 * today's date — and records an ISSUE for a value it cannot read. One issue
 * rejects the whole file, exactly as the portal's fallback does: a registry
 * imported minus its unreadable rows is data this program invented by omission.
 */
import {
  cell,
  normalizeHeader,
  parseDecimalCell,
  parseIntegerCell,
  type ColumnIndex,
  type CsvRecord,
} from "./vendor/csv"

type IssueCode =
  | "missing_value"
  | "invalid_amount"
  | "invalid_integer"
  | "invalid_date"
  | "invalid_period"
  | "unknown_value"
  | "duplicate_row"
  | "ragged_row"
  | "column_shape"

export type TransformIssue = {
  readonly line: number
  /** The header the issue is about, as written in the file. Null when row-wide. */
  readonly column: string | null
  readonly code: IssueCode
}

export type Collector = {
  readonly issues: TransformIssue[]
  add: (line: number, column: string | null, code: IssueCode) => void
}

export function collector(): Collector {
  const issues: TransformIssue[] = []
  return {
    issues,
    add: (line, column, code) => issues.push({ line, column, code }),
  }
}

const label = (columns: ColumnIndex, field: string): string | null =>
  columns.matched[field] ?? null

/** A required cell: present and non-blank, or an issue. */
export function req(
  row: CsvRecord,
  columns: ColumnIndex,
  field: string,
  issues: Collector,
): string | null {
  const value = cell(row, columns, field)
  if (value === null || value === "") {
    issues.add(row.line, label(columns, field), "missing_value")
    return null
  }
  return value
}

/** An optional cell. Absent column and blank cell are the same answer: `null`. */
export function opt(
  row: CsvRecord,
  columns: ColumnIndex,
  field: string,
): string | null {
  const value = cell(row, columns, field)
  return value === null || value === "" ? null : value
}

/** An optional money cell, normalized to the `numeric(14,2)` string form. */
export function money(
  row: CsvRecord,
  columns: ColumnIndex,
  field: string,
  issues: Collector,
): string | null {
  const raw = cell(row, columns, field)
  if (raw === null) return null
  const parsed = parseDecimalCell(raw)
  if (!parsed.ok) {
    issues.add(row.line, label(columns, field), "invalid_amount")
    return null
  }
  return parsed.value
}

/** A required money cell — `amount` on a liability, `acquisitionCost` on an asset. */
export function moneyReq(
  row: CsvRecord,
  columns: ColumnIndex,
  field: string,
  issues: Collector,
): string | null {
  const raw = req(row, columns, field, issues)
  if (raw === null) return null
  const parsed = parseDecimalCell(raw)
  if (!parsed.ok) {
    issues.add(row.line, label(columns, field), "invalid_amount")
    return null
  }
  return parsed.value
}

const CZECH_DATE = /^(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})$/
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * A date cell → `YYYY-MM-DD`.
 *
 * BOTH DIALECTS, because both are written by the same office in the same month:
 * `31.7.2026` is what a Czech desktop export prints and `2026-07-31` is what a
 * spreadsheet writes once a column has been re-typed as a date. The calendar
 * validity check (`toISOString` round-trip) is what stops `31.02.2026` from
 * becoming 3 March through Date's silent overflow.
 */
export function dateCell(
  row: CsvRecord,
  columns: ColumnIndex,
  field: string,
  issues: Collector,
  required = false,
): string | null {
  const raw = required
    ? req(row, columns, field, issues)
    : opt(row, columns, field)
  if (raw === null) return null

  const czech = CZECH_DATE.exec(raw)
  const iso = czech
    ? `${czech[3]!}-${czech[2]!.padStart(2, "0")}-${czech[1]!.padStart(2, "0")}`
    : ISO_DATE.test(raw)
      ? raw
      : null
  if (
    iso === null ||
    new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) !== iso
  ) {
    issues.add(row.line, label(columns, field), "invalid_date")
    return null
  }
  return iso
}

/**
 * A `paid_at` cell → an RFC 3339 instant.
 *
 * ASSUMPTION, FLAGGED: a Money S3 export states WHEN something was paid as a
 * calendar DATE, and `paid_at` is a `timestamptz`. A date is therefore widened
 * to **12:00 UTC**, not to midnight — noon is the same calendar day in
 * Europe/Prague in both CET and CEST, while midnight UTC renders as 01:00 or
 * 02:00 the same day and midnight LOCAL would render as the previous day for
 * anyone reading in UTC. Nothing about the accounting fact changes; only its
 * representation, and this is the representation that cannot move the day.
 * A cell that already carries a full instant is passed through untouched.
 */
export function instantCell(
  row: CsvRecord,
  columns: ColumnIndex,
  field: string,
  issues: Collector,
): string | null {
  const raw = opt(row, columns, field)
  if (raw === null) return null
  if (raw.includes("T")) {
    const parsed = new Date(raw)
    if (Number.isNaN(parsed.getTime())) {
      issues.add(row.line, label(columns, field), "invalid_date")
      return null
    }
    return parsed.toISOString()
  }
  const date = dateCell(row, columns, field, issues)
  return date === null ? null : `${date}T12:00:00Z`
}

/**
 * An enum cell, matched through `normalizeHeader` so `Vozidlo`, `vozidlo` and
 * `VEHICLE` are one value. An unrecognised token is an issue naming the cell —
 * never a fallback to "ostatní", which would silently re-file a client's asset.
 */
export function enumCell<T extends string>(
  row: CsvRecord,
  columns: ColumnIndex,
  field: string,
  table: Readonly<Record<string, T>>,
  issues: Collector,
  required = false,
): T | null {
  const raw = required
    ? req(row, columns, field, issues)
    : opt(row, columns, field)
  if (raw === null) return null
  const value = table[normalizeHeader(raw)]
  if (value === undefined) {
    issues.add(row.line, label(columns, field), "unknown_value")
    return null
  }
  return value
}

/**
 * A small whole number in range, or `null` when the file has no such column.
 *
 * Separate from `intCell` because the two absences mean different things. An
 * omitted `Úroveň` column is a formatting detail with an obvious default; an
 * omitted headcount is a NUMBER THE OFFICE DID NOT STATE, and publishing it as
 * `0` would tell a client they employed nobody that month (§0.4).
 */
export function intOptional(
  row: CsvRecord,
  columns: ColumnIndex,
  field: string,
  range: { min: number; max: number },
  issues: Collector,
): number | null {
  const raw = cell(row, columns, field)
  if (raw === null) return null
  const parsed = parseIntegerCell(raw, range)
  if (!parsed.ok) {
    issues.add(row.line, label(columns, field), "invalid_integer")
    return null
  }
  return parsed.value
}

/** A small whole number in range, defaulting to `fallback` when absent. */
export function intCell(
  row: CsvRecord,
  columns: ColumnIndex,
  field: string,
  range: { min: number; max: number },
  issues: Collector,
  fallback: number,
): number {
  const raw = cell(row, columns, field)
  if (raw === null) return fallback
  const parsed = parseIntegerCell(raw, range)
  if (!parsed.ok) {
    issues.add(row.line, label(columns, field), "invalid_integer")
    return fallback
  }
  return parsed.value ?? fallback
}
