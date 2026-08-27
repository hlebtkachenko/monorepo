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

const dateTimeFormatter = new Intl.DateTimeFormat(BETA_LOCALE, {
  ...betaFormats.dateTime.dateTime,
  timeZone: BETA_TIME_ZONE,
})

/**
 * An ISO instant → `DD.MM.YYYY HH:MM`, Europe/Prague.
 *
 * For the stamps where the DAY is not precise enough to be useful: the §2.10
 * ARES cache stamp is a 24h window, so "naposledy načteno 26.08.2026" cannot
 * tell the office whether a re-lookup will hit the cache or the registry.
 */
export function formatBetaDateTime(value: string): string {
  return dateTimeFormatter.format(new Date(value))
}

/**
 * `2026-03-07` or an ISO timestamp → `07.03.2026`, in Prague terms, for a
 * value that may be absent — the null-safe twin of `formatBetaDate` above,
 * built from the SAME `dateFormatter` instance.
 *
 * A bare `YYYY-MM-DD` is anchored at UTC midnight on purpose: `new Date("...")`
 * already parses a date-only string as UTC, and Prague is ahead of UTC, so the
 * calendar day is preserved. Anchoring at local midnight instead would move the
 * date by one day for anyone whose machine is behind UTC.
 */
export function formatDate(value: string | null | undefined): string | null {
  if (!value) return null
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00Z` : value)
  return Number.isNaN(parsed.getTime()) ? null : dateFormatter.format(parsed)
}

/**
 * An ISO timestamp → `07.03.2026 11:24`, in Prague terms, for a value that
 * may be absent — the null-safe twin of `formatBetaDateTime` above, built
 * from the SAME `dateTimeFormatter` instance.
 */
export function formatDateTime(
  value: string | null | undefined,
): string | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime())
    ? null
    : dateTimeFormatter.format(parsed)
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
