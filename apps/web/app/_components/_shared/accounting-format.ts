/**
 * Shared display helpers for the accounting book pages. Data-shaping only (no
 * reusable UI — those live in `packages/ui/src/blocks`). The domain transports
 * money as `Decimal` (a decimal string, e.g. "12100.00", NEVER a JS number);
 * these helpers parse it for DISPLAY only. Never round-trip a displayed number
 * back into a posting.
 */

/**
 * Domain money transport type: a decimal STRING (e.g. "12100.00"), never a JS
 * number. Declared locally so `apps/web` needn't depend on `@workspace/accounting`
 * — these are display-only helpers and the API already sends strings.
 */
type Decimal = string

const money = new Intl.NumberFormat("cs-CZ", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const moneyWhole = new Intl.NumberFormat("cs-CZ", {
  maximumFractionDigits: 0,
})

/** Parse a domain `Decimal` string to a JS number — DISPLAY ONLY. */
export function decimalToNumber(value: Decimal): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/** Format a `Decimal` as a cs-CZ amount with 2 decimals + " Kč" suffix. */
export function formatDecimal(value: Decimal): string {
  return `${money.format(decimalToNumber(value))} Kč`
}

/** Format a plain number as a cs-CZ amount with 2 decimals + " Kč". */
export function formatAmount(value: number): string {
  return `${money.format(value)} Kč`
}

/** Format a plain number as a cs-CZ whole-Kč amount + " Kč". */
export function formatWhole(value: number): string {
  return `${moneyWhole.format(value)} Kč`
}

/** Format an ISO date (`2026-06-01`) as a cs-CZ medium date. Local-parsed. */
export function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number)
  const date =
    year && month && day ? new Date(year, month - 1, day) : new Date(iso)
  return new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium" }).format(date)
}

/** Concatenate the ways a date might be typed so free-text search matches. */
export function dateSearchText(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number)
  if (!year || !month || !day) return iso
  return [iso, `${day}.${month}.${year}`, `${day}.${month}`].join(" ")
}

/** Normalize for free-text search: drop diacritics, lowercase, strip separators. */
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s.,-]/g, "")
}
