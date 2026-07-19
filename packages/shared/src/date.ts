const CZECH_DATE_FORMATTER = new Intl.DateTimeFormat("en", {
  timeZone: "Europe/Prague",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

/** Return the current Czech civil date as YYYY-MM-DD. */
export function czechToday(now: Date = new Date()): string {
  const parts = CZECH_DATE_FORMATTER.formatToParts(now)
  const year = parts.find((part) => part.type === "year")?.value
  const month = parts.find((part) => part.type === "month")?.value
  const day = parts.find((part) => part.type === "day")?.value

  if (!year || !month || !day) {
    throw new RangeError("Unable to format Czech civil date")
  }

  return `${year}-${month}-${day}`
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

/** ISO date ("YYYY-MM-DD") -> "5 Jul 2026". No timezone drift — string split only. */
export function formatIsoDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number)
  if (!year || !month || !day) return iso
  return `${day} ${MONTH_NAMES[month - 1]} ${year}`
}

const FULL_MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

/** "2026-07-27" -> "July 2026" (the month-group header label). */
export function monthGroupLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number)
  if (!year || !month) return monthKey
  return `${FULL_MONTH_NAMES[month - 1]} ${year}`
}
