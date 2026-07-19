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
