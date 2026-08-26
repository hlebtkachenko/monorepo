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

const statementFormatter = new Intl.NumberFormat(
  BETA_LOCALE,
  betaFormats.number.statement,
)

/**
 * `numeric(14,2)` as a string → `"1 234,50"`, for a statutory statement cell.
 *
 * The currency-free twin of `formatBetaMoney`, and it exists for a rendering
 * reason rather than a data one: a rozvaha is a four-column form under a single
 * "v Kč" heading, so a "Kč" in every cell is noise the paper form does not
 * carry. Same null contract — the office not stating a value is an absence the
 * caller renders as one (spec §0.4), never as `0,00`, and the same single
 * float conversion at the last step before display (see `formatBetaMoney`).
 */
export function formatBetaAmount(value: string | null): string | null {
  if (value === null) return null
  return statementFormatter.format(Number(value))
}
