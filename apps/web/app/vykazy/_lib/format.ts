// Czech number formatting + parsing for the Výkazy builder. Values are whole
// thousands of CZK on the paper form, so display rounds to integers and groups
// by three with a non-breaking space (e.g. 41 942). Negatives use a minus sign.

// Non-breaking space (U+00A0) so a grouped number never wraps inside a cell.
const GROUP_SEP = " "

/** Format a value for a display cell. Nullish / NaN -> "" (blank cell). */
export function formatTisice(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return ""
  const rounded = Math.round(n)
  const negative = rounded < 0
  const grouped = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_SEP)
  return negative ? `-${grouped}` : grouped
}

/**
 * Parse a user-typed cell string into a number. Accepts grouping spaces and a
 * comma decimal separator. Returns null for an empty / non-numeric string so
 * callers can treat "no value entered" as absent.
 */
export function parseCislo(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".")
  if (cleaned === "" || cleaned === "-" || cleaned === "+") return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}
