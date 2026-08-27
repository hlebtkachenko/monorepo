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

/**
 * The same `numeric(14,2)` → `"1 234,50 Kč"` rendering as `formatBetaMoney`,
 * built from the SAME `currencyFormatter` instance, but accepting `undefined`
 * and `""` alongside `null` as "not stated" — the shape a column reads before
 * a value has ever been entered, or an optional query-string param arrives in.
 */
export function formatAmount(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null
  const amount = Number(value)
  return Number.isFinite(amount) ? currencyFormatter.format(amount) : null
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

/**
 * Czech-written money in, `numeric` syntax out — the input-side counterpart
 * to `formatBetaMoney` / `formatBetaAmount` above.
 *
 * Every amount in this app is rendered through one of those two formatters,
 * which emit Czech grouping and a decimal comma (`1 234,50`), while every
 * money field's syntax gate (Majetek, Úvěry, Pro účetní's `formDecimal`) only
 * ever accepted `1234.50`. A client who read a figure off a rendered table
 * and typed it straight back got refused, and `inputMode="decimal"` on a
 * Czech keyboard offers a comma, not a dot — so the refusal was the default
 * outcome, not an edge case.
 *
 * Called BEFORE the caller's own shape regex, never as a replacement for it:
 * what reaches Postgres is still exactly `numeric` syntax, so the column's
 * own precision and CHECKs remain the authority.
 *
 * `\s` is the right class rather than a literal " ": it already covers
 * U+00A0 and U+202F, and those — not the ASCII space — are what
 * `Intl.NumberFormat("cs-CZ")` actually puts between groups, so they are what
 * lands in the field on a copy-paste off a rendered table.
 *
 * DELIBERATELY NOT NORMALISED: a lone `.` stays a decimal point. `1.234` is
 * ambiguous (1234 written Czech-style, or 1.234 written with three decimals)
 * and is left to fail the caller's own shape check — an ambiguous amount is a
 * refusal the client can see and correct, never a guess this layer makes on
 * their behalf. Dots are treated as grouping only when a comma proves they
 * were (`1.234,56` → `1234.56`).
 */
export function normalizeBetaMoneyInput(value: string): string {
  const ungrouped = value.replace(/\s/g, "")
  if (!ungrouped.includes(",")) return ungrouped
  return ungrouped.replace(/\./g, "").replace(",", ".")
}
