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
