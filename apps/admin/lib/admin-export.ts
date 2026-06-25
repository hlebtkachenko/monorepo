import "server-only"

/**
 * CSV export helpers (M3.T05).
 *
 * `exportRowsAsCsv` is a pure function: no DB, no env, no audit. It serialises
 * a row set against a column projection (key + display label) into a single
 * RFC-4180-shaped CSV string. The caller is responsible for the row cap and
 * for emitting the `admin.<table>.exported` audit event (see §C10).
 *
 * `escapeCsvCell` is exported so individual values (e.g. headers built outside
 * the projection helper) can be escaped consistently.
 */

/**
 * Convert any cell value to a CSV-safe string. Strings containing comma,
 * double-quote, CR, or LF are wrapped in double quotes and any inner double
 * quote is doubled (RFC 4180).
 *
 * `null` and `undefined` render as the empty cell. `Date` values render as
 * ISO-8601 UTC. Objects render via `JSON.stringify`. Everything else uses
 * `String(value)`.
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return ""

  let text: string
  if (value instanceof Date) {
    text = value.toISOString()
  } else if (typeof value === "object") {
    text = JSON.stringify(value)
  } else {
    text = String(value)
  }

  const needsQuoting = /[",\r\n]/.test(text)
  if (!needsQuoting) return text
  return `"${text.replace(/"/g, '""')}"`
}

/**
 * Project `rows` through `columns` and emit a CSV string. The first line is
 * the header row built from `column.label`; subsequent lines are one row each
 * with cells in column order. Line terminator is `\r\n` (RFC 4180).
 */
export function exportRowsAsCsv<T>(
  rows: T[],
  columns: { key: keyof T & string; label: string }[],
): string {
  const header = columns.map((c) => escapeCsvCell(c.label)).join(",")
  const lines = rows.map((row) =>
    columns
      .map((c) => escapeCsvCell((row as Record<string, unknown>)[c.key]))
      .join(","),
  )
  return [header, ...lines].join("\r\n")
}
