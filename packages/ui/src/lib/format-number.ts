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
