import { BETA_LOCALE, betaFormats } from "@/i18n/formats"

/**
 * cs-CZ currency formatting for plain presentational use — see `date.ts`'s
 * header for why this is a small direct `Intl` wrapper rather than a
 * `getFormatter()` call site.
 */
const currencyFormatter = new Intl.NumberFormat(
  BETA_LOCALE,
  betaFormats.number.currency,
)

/**
 * `numeric(14,2)` as a string → `"1 234,50 Kč"`.
 *
 * Returns `null` for `null` — the office has not stated an amount (spec
 * §0.4, "empty beats stale"), which the caller must render as an absence
 * ("Neuvedeno"), never as "0 Kč". This is the ONLY place this application
 * turns a money string into a JavaScript number, and it is the last step
 * before display: the result is never fed back into a sum, a comparison, or
 * another field, so there is nowhere for the float conversion to introduce a
 * rounding error that reaches an accounting fact (spec §0.2 — every sum stays
 * SQL-side, upstream of this call).
 */
export function formatBetaMoney(value: string | null): string | null {
  if (value === null) return null
  return currencyFormatter.format(Number(value))
}
