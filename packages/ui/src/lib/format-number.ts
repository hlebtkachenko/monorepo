/**
 * Locale-aware number formatter, Czech-style by default: `1 000 000,00`.
 * Space (NBSP) thousand separator, comma decimal, 2 fraction digits.
 * Pass `locale` to format for other markets (e.g. "en-US" → `1,000,000.00`).
 */
export type FormatNumberOptions = {
  minimumFractionDigits?: number
  maximumFractionDigits?: number
  /** BCP-47 locale tag. Defaults to "cs-CZ". */
  locale?: string
}

const DEFAULT_LOCALE = "cs-CZ"

const DEFAULT_OPTIONS = {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}

export function formatNumber(
  value: number | null | undefined,
  options: FormatNumberOptions = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return ""
  return new Intl.NumberFormat(options.locale ?? DEFAULT_LOCALE, {
    minimumFractionDigits:
      options.minimumFractionDigits ?? DEFAULT_OPTIONS.minimumFractionDigits,
    maximumFractionDigits:
      options.maximumFractionDigits ?? DEFAULT_OPTIONS.maximumFractionDigits,
  }).format(value)
}

/**
 * Format a decimal value carried as a STRING (e.g. a `numeric(19,4)` money
 * amount transported as `"1234.5000"`) to the Czech display form, WITHOUT ever
 * routing it through a lossy `Number()`. ECMA-402 `Intl.NumberFormat.format`
 * accepts an exact decimal string numeric literal, so precision beyond
 * IEEE-754 double is preserved — the whole reason a money cell is a string.
 *
 * - A plain `number` is accepted too (stringified first) for convenience.
 * - `null` / `undefined` / `""` → `""`.
 * - A value that is not a well-formed decimal literal is returned untouched
 *   (never coerced to the string `"NaN"`).
 */
export function formatDecimal(
  value: string | number | null | undefined,
  options: FormatNumberOptions = {},
): string {
  if (value === null || value === undefined) return ""
  const raw =
    typeof value === "number"
      ? Number.isFinite(value)
        ? String(value)
        : ""
      : value.trim()
  if (raw === "") return ""
  // Only a bare decimal literal is formatted; anything else passes through as
  // typed so a stray non-numeric cell can never render as "NaN".
  if (!/^[+-]?\d+(\.\d+)?$/.test(raw)) return raw
  return new Intl.NumberFormat(options.locale ?? DEFAULT_LOCALE, {
    minimumFractionDigits:
      options.minimumFractionDigits ?? DEFAULT_OPTIONS.minimumFractionDigits,
    maximumFractionDigits:
      options.maximumFractionDigits ?? DEFAULT_OPTIONS.maximumFractionDigits,
    // The string literal is passed straight through — the es2022 TS lib only
    // types `format(number | bigint)`, but the runtime accepts a string.
  }).format(raw as unknown as number)
}

/**
 * Structural money shape: bigint minor units + ISO-4217 currency code.
 * Matches both the server-side `@workspace/db` money type and the SDK's
 * `Money<C>` class without importing either (keeps `@workspace/ui`
 * dependency-free of domain packages).
 */
export type MoneyLike = {
  amount: bigint
  currency: string
}

/**
 * Render a Money value (bigint minor units) as a localized currency string,
 * e.g. `Money.of(123456n, "CZK")` → `1 234,56 Kč` (cs-CZ, the default) or
 * `CZK 1,234.56` (en-US). Minor-unit scaling comes from the currency's own
 * fraction digits per Intl (CZK/EUR/USD/GBP → 2). The bigint is converted
 * through an exact decimal string, never a float, so amounts beyond
 * Number.MAX_SAFE_INTEGER stay precise.
 */
export function formatMoney(
  money: MoneyLike | null | undefined,
  locale: string = DEFAULT_LOCALE,
): string {
  if (money === null || money === undefined) return ""
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: money.currency,
  })
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2
  const divisor = 10n ** BigInt(digits)
  const negative = money.amount < 0n
  const abs = negative ? -money.amount : money.amount
  const whole = abs / divisor
  const fraction = (abs % divisor).toString().padStart(digits, "0")
  const decimal =
    digits > 0
      ? `${negative ? "-" : ""}${whole}.${fraction}`
      : `${negative ? "-" : ""}${whole}`
  // Intl.NumberFormat accepts exact decimal strings (ECMA-402 string
  // numeric literals); the es2022 TS lib only types number | bigint.
  return formatter.format(decimal as unknown as number)
}

/**
 * Parse a Czech-formatted string back to a number. Accepts spaces / NBSP /
 * thin space as thousand separator, comma OR dot as decimal. Returns null
 * for invalid input.
 */
export function parseNumber(input: string): number | null {
  if (!input) return null
  const normalized = input.replace(/[\s\u00A0\u202F]/g, "").replace(",", ".")
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

// The thousand separator Intl emits for the default locale (so the live mask
// groups exactly like `formatNumber` does on commit).
const GROUP_SEPARATOR =
  formatNumber(1000, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).replace(/[0-9]/g, "") || "\u00A0"

/** Group a run of integer digits with the locale thousand separator. */
function groupIntegerDigits(digits: string): string {
  const stripped = digits.replace(/^0+(?=\d)/, "")
  return stripped.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_SEPARATOR)
}

/** Caret offset that lands just after the `n`-th digit of a grouped string. */
function caretAfterDigits(grouped: string, n: number): number {
  if (n <= 0) return 0
  let count = 0
  for (let i = 0; i < grouped.length; i++) {
    if (grouped[i]! >= "0" && grouped[i]! <= "9") {
      count++
      if (count === n) return i + 1
    }
  }
  return grouped.length
}

/**
 * Live input mask for a Czech-formatted decimal field. Given the raw input and
 * the caret position, returns the reformatted text and the caret to restore:
 *
 * - integer digits group with thousand separators as you type;
 * - a `,00` decimal suffix is appended while only integer digits are present
 *   (typing `1` shows `1,00` with the caret kept right after the `1`);
 * - typing a comma/dot switches into the decimals (max 2 digits);
 * - an empty field stays empty so the placeholder can show.
 */
export function maskNumberInput(
  raw: string,
  caret: number,
): { text: string; caret: number } {
  const negative = /^\s*-/.test(raw)
  const sepIndex = raw.search(/[.,]/)
  const hasSeparator = sepIndex >= 0
  const intSource = hasSeparator ? raw.slice(0, sepIndex) : raw
  const decSource = hasSeparator ? raw.slice(sepIndex + 1) : ""
  const intDigits = intSource.replace(/\D/g, "")
  const decDigits = decSource.replace(/\D/g, "").slice(0, 2)

  // Nothing typed yet \u2192 keep it empty (the placeholder shows).
  if (intDigits === "" && decDigits === "" && !hasSeparator) {
    return { text: "", caret: 0 }
  }

  const sign = negative ? "-" : ""
  const grouped = intDigits === "" ? "0" : groupIntegerDigits(intDigits)
  const caretInDecimal = hasSeparator && caret > sepIndex

  if (caretInDecimal) {
    const decBeforeCaret = decSource
      .slice(0, caret - sepIndex - 1)
      .replace(/\D/g, "").length
    return {
      text: `${sign}${grouped},${decDigits}`,
      caret:
        sign.length +
        grouped.length +
        1 +
        Math.min(decBeforeCaret, decDigits.length),
    }
  }

  // Integer editing \u2014 show a 2-digit decimal suffix (committed decimals or 00)
  // and keep the caret among the integer digits.
  const decSuffix = (decDigits || "00").padEnd(2, "0")
  const digitsBeforeCaret = raw.slice(0, caret).replace(/\D/g, "").length
  return {
    text: `${sign}${grouped},${decSuffix}`,
    caret: sign.length + caretAfterDigits(grouped, digitsBeforeCaret),
  }
}
