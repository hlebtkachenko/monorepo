/**
 * Czech public holidays (Act 245/2000 Sb., zákon o státních svátcích) + the
 * §33 Daňový řád (Act 280/2009 Sb.) business-day shift rule: a statutory
 * deadline that falls on a Saturday, Sunday, or public holiday moves to the
 * next business day.
 *
 * All date math here operates on UTC calendar parts only — an ISO
 * "YYYY-MM-DD" string is parsed with `Date.UTC` and read back with the
 * `getUTC*` accessors, never the local-timezone `Date` constructor/getters —
 * so results never drift with the host machine's timezone.
 */

/** Fixed-date public holidays (month, day) — independent of Easter. */
const FIXED_HOLIDAYS: readonly (readonly [month: number, day: number])[] = [
  [1, 1], // Nový rok / Den obnovy samostatného českého státu
  [5, 1], // Svátek práce
  [5, 8], // Den vítězství
  [7, 5], // Den slovanských věrozvěstů Cyrila a Metoděje
  [7, 6], // Den upálení mistra Jana Husa
  [9, 28], // Den české státnosti
  [10, 28], // Den vzniku samostatného československého státu
  [11, 17], // Den boje za svobodu a demokracii
  [12, 24], // Štědrý den
  [12, 25], // 1. svátek vánoční
  [12, 26], // 2. svátek vánoční
]

function pad2(n: number): string {
  return n.toString().padStart(2, "0")
}

function toIso(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

function parseIso(iso: string): [year: number, month: number, day: number] {
  return iso.split("-").map(Number) as [number, number, number]
}

/**
 * Easter Sunday (month, day) for a Gregorian calendar year, via the
 * Anonymous Gregorian algorithm (Meeus/Butcher). Good Friday and Easter
 * Monday are derived from it (§ czechHolidays below). Verified for 2026:
 * Easter Sunday = 5 April → Good Friday 3 April, Easter Monday 6 April.
 */
function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return { month, day }
}

/** Add (or subtract) whole days to an ISO date, rolling month/year as needed. */
function addDaysIso(iso: string, days: number): string {
  const [year, month, day] = parseIso(iso)
  const dt = new Date(Date.UTC(year, month - 1, day) + days * 86_400_000)
  return toIso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
}

/** Czech public holidays for `year`, as a Set of ISO "YYYY-MM-DD" dates. */
export function czechHolidays(year: number): Set<string> {
  const dates = FIXED_HOLIDAYS.map(([month, day]) => toIso(year, month, day))
  const easter = easterSunday(year)
  const easterIso = toIso(year, easter.month, easter.day)
  dates.push(addDaysIso(easterIso, -2)) // Good Friday
  dates.push(addDaysIso(easterIso, 1)) // Easter Monday
  return new Set(dates)
}

/**
 * Shift `iso` forward to the next business day if it falls on a Saturday,
 * Sunday, or Czech public holiday (§33 Daňový řád). Walks forward one day at
 * a time — deadlines never sit inside a holiday cluster longer than a few
 * days, so this stays cheap.
 */
export function shiftToBusinessDay(iso: string): string {
  let current = iso
  for (;;) {
    const [year, month, day] = parseIso(current)
    const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    const isHoliday = czechHolidays(year).has(current)
    if (!isWeekend && !isHoliday) return current
    current = addDaysIso(current, 1)
  }
}
