import { BETA_LOCALE, BETA_TIME_ZONE, betaFormats } from "@/i18n/formats"

/**
 * cs-CZ date formatting for plain presentational use — a Server or Client
 * Component that is not already inside next-intl's `getFormatter()` /
 * `useFormatter()` call sites (there are none yet in this app; this module is
 * the first). Built directly from the SAME constants `i18n/request.ts`
 * registers with next-intl, so a component reaching for either gets the
 * identical DD.MM.YYYY, Europe/Prague rendering (spec Part 3, `i18n/formats.test.ts`).
 */
const dateFormatter = new Intl.DateTimeFormat(BETA_LOCALE, {
  ...betaFormats.dateTime.date,
  timeZone: BETA_TIME_ZONE,
})

/**
 * An ISO date (`YYYY-MM-DD`, e.g. `filing.due_on`) or ISO instant
 * (`filing.paid_at`, `filing.updated_at`) → `DD.MM.YYYY`.
 *
 * A bare date string parses as UTC midnight; formatting it back out in
 * Europe/Prague (always ≥ UTC+1) never rolls the calendar day backward, so a
 * `date`-typed column and a `timestamptz`-typed one render through the same
 * function without disagreeing on which day a deadline falls on.
 */
export function formatBetaDate(value: string): string {
  return dateFormatter.format(new Date(value))
}

/**
 * The current calendar year, in Prague local time — Souhrn's "current-year
 * timeline" (spec §2.3) filters on THIS, not on `new Date().getFullYear()`
 * (the server's own timezone, which is not guaranteed to be Prague).
 */
export function currentBetaYear(): number {
  return Number(
    new Intl.DateTimeFormat(BETA_LOCALE, {
      year: "numeric",
      timeZone: BETA_TIME_ZONE,
    }).format(new Date()),
  )
}

const isoDateParts = new Intl.DateTimeFormat(BETA_LOCALE, {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: BETA_TIME_ZONE,
})

/**
 * Today, in Prague, as `YYYY-MM-DD` — the same shape a `date` column arrives
 * in, so the two can be compared without either one being parsed.
 *
 * `currentBetaYear`'s reasoning one field wider: `new Date().toISOString()`
 * would answer in UTC, which is the wrong calendar day for the first hour or
 * two of every Prague day and would make a freshness band flip a day early.
 * Assembled from `formatToParts` rather than from a locale that happens to
 * print ISO — cs-CZ prints `26. 8. 2026`, and depending on a second locale
 * here purely for its punctuation is the kind of thing that breaks silently
 * when an ICU version changes its spacing.
 */
export function betaTodayIso(now: Date = new Date()): string {
  const parts = isoDateParts.formatToParts(now)
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? ""
  return `${value("year")}-${value("month")}-${value("day")}`
}
