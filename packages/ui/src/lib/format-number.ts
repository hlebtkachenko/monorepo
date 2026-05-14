/**
 * Czech-style number formatter: `1 000 000,00`.
 * Space (NBSP) thousand separator, comma decimal, 2 fraction digits by default.
 */
export type FormatNumberOptions = {
  minimumFractionDigits?: number
  maximumFractionDigits?: number
}

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
  return new Intl.NumberFormat("cs-CZ", {
    minimumFractionDigits:
      options.minimumFractionDigits ?? DEFAULT_OPTIONS.minimumFractionDigits,
    maximumFractionDigits:
      options.maximumFractionDigits ?? DEFAULT_OPTIONS.maximumFractionDigits,
  }).format(value)
}

/**
 * Parse a Czech-formatted string back to a number. Accepts spaces / NBSP /
 * thin space as thousand separator, comma OR dot as decimal. Returns null
 * for invalid input.
 */
export function parseNumber(input: string): number | null {
  if (!input) return null
  const normalized = input.replace(/[\s  ]/g, "").replace(",", ".")
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}
