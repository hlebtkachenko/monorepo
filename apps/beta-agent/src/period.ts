/**
 * A reporting period, in the coordinate form the ingestion API takes.
 *
 * The API deliberately refuses a period ID (see `periodSchema` in
 * `src/vendor/schemas.ts`): coordinates are resolved against the key's own
 * scope, so a period can only ever belong to the book named in the URL. This
 * module is the one place a human-typed `2026-07` becomes those coordinates.
 *
 * `kind: "quarter"` is accepted because the schema accepts it, even though no
 * beta dataset is quarterly today — a DPH-quarterly office would otherwise have
 * to hand-edit JSON.
 */
export type Period = {
  readonly kind: "month" | "quarter" | "year"
  readonly year: number
  readonly month?: number
  readonly quarter?: number
}

const MONTH = /^(\d{4})-(\d{2})$/
const QUARTER = /^(\d{4})-[Qq]([1-4])$/
const YEAR = /^(\d{4})$/

/** `2026-07` | `2026-Q3` | `2026` → coordinates. `null` when it is none of them. */
export function parsePeriod(value: string): Period | null {
  const trimmed = value.trim()

  const month = MONTH.exec(trimmed)
  if (month) {
    const year = Number(month[1])
    const number = Number(month[2])
    if (number < 1 || number > 12) return null
    return { kind: "month", year, month: number }
  }

  const quarter = QUARTER.exec(trimmed)
  if (quarter) {
    return {
      kind: "quarter",
      year: Number(quarter[1]),
      quarter: Number(quarter[2]),
    }
  }

  const year = YEAR.exec(trimmed)
  if (year) return { kind: "year", year: Number(year[1]) }

  return null
}

/** The way a period is written back to the operator and into an idempotency key. */
export function formatPeriod(period: Period): string {
  if (period.kind === "month") {
    return `${period.year}-${String(period.month).padStart(2, "0")}`
  }
  if (period.kind === "quarter") return `${period.year}-Q${period.quarter}`
  return String(period.year)
}
