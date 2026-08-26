import { BETA_LOCALE, BETA_TIME_ZONE, betaFormats } from "./formats"

/**
 * Value formatters for the Czech UI, built from the SAME `betaFormats` the
 * next-intl provider is configured with (`i18n/request.ts`).
 *
 * WHY THESE EXIST ALONGSIDE next-intl's `useFormatter()`. Two reasons, both
 * practical. A Server Component and a Client Component would otherwise reach for
 * different APIs to render the same column, and every one of these functions has
 * to answer for a NULL — `document_date`, `amount` and `site_ref` are all
 * nullable, and "—" is a presentation decision that belongs in one place rather
 * than at every call site. They are plain functions over `Intl`, so a component
 * that uses them renders in a test without a provider.
 *
 * PURE MODULE: no `server-only`, no React. Safe on both sides of the boundary.
 */

const dateFormat = new Intl.DateTimeFormat(BETA_LOCALE, {
  ...betaFormats.dateTime.date,
  timeZone: BETA_TIME_ZONE,
})

const dateTimeFormat = new Intl.DateTimeFormat(BETA_LOCALE, {
  ...betaFormats.dateTime.dateTime,
  timeZone: BETA_TIME_ZONE,
})

const currencyFormat = new Intl.NumberFormat(
  BETA_LOCALE,
  betaFormats.number.currency,
)

const byteFormat = new Intl.NumberFormat(BETA_LOCALE, {
  maximumFractionDigits: 1,
})

/**
 * `2026-03-07` or an ISO timestamp → `07.03.2026`, in Prague terms.
 *
 * A bare `YYYY-MM-DD` is anchored at UTC midnight on purpose: `new Date("...")`
 * already parses a date-only string as UTC, and Prague is ahead of UTC, so the
 * calendar day is preserved. Anchoring at local midnight instead would move the
 * date by one day for anyone whose machine is behind UTC.
 */
export function formatDate(value: string | null | undefined): string | null {
  if (!value) return null
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00Z` : value)
  return Number.isNaN(parsed.getTime()) ? null : dateFormat.format(parsed)
}

/** An ISO timestamp → `07.03.2026 11:24`, in Prague terms. */
export function formatDateTime(
  value: string | null | undefined,
): string | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : dateTimeFormat.format(parsed)
}

/**
 * The exact decimal text Postgres returned for a `numeric(14,2)` → `1 234,50 Kč`.
 *
 * THE ONE PLACE A MONEY VALUE BECOMES A `number`, and it is display only. Beta
 * stores money as `numeric(14,2)`, carries it as a string and never computes on
 * it (spec §0.7) — `Intl.NumberFormat` takes a number, so a conversion has to
 * happen somewhere, and it happens here rather than in a data module where the
 * result could be added to something. It is lossless for every value the column
 * can hold: 14 significant digits is inside a double's exact-integer range once
 * scaled by 100, and the formatter rounds to exactly the two decimals the column
 * stores.
 */
export function formatAmount(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null
  const amount = Number(value)
  return Number.isFinite(amount) ? currencyFormat.format(amount) : null
}

const BYTE_UNITS = ["B", "kB", "MB"] as const

/** A byte count → `1,4 MB`. Uploads are capped at 25 MiB, so MB is the top. */
export function formatBytes(value: number): string {
  let size = value
  let unit = 0
  while (size >= 1024 && unit < BYTE_UNITS.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${byteFormat.format(size)} ${BYTE_UNITS[unit]}`
}
