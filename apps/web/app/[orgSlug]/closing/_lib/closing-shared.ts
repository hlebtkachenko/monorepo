import type { Obligation } from "@workspace/accounting"

/**
 * Pure, presentational Closing types + helpers shared by the server-only
 * `closing-data.ts` loader AND the "use client" Overview/Calendar views.
 *
 * Deliberately NOT `server-only`: `formatIsoDate` and the result types are
 * imported by client components (to render dates/status without a second
 * network round trip), and `server-only` would poison the client bundle with
 * `closing-data.ts`'s `@workspace/db` import graph. `closing-data.ts` is the
 * single place that touches the database; this module has zero DB/Next
 * dependencies, so it is safe on both sides of the server/client boundary.
 */

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

export type ClosingObligationStatus = "Overdue" | "Due soon" | "Upcoming"

/**
 * Derive a display status from an obligation's due date relative to a
 * reference date (both ISO "YYYY-MM-DD", so string comparison is exact for
 * "past"). "Due soon" covers the next 14 days inclusive of today. There is no
 * "Filed" status yet — filing state doesn't exist until PR5 wires actual
 * submission tracking.
 */
export function deriveObligationStatus(
  dueDate: string,
  today: string,
): ClosingObligationStatus {
  if (dueDate < today) return "Overdue"
  const dueMs = Date.parse(`${dueDate}T00:00:00Z`)
  const todayMs = Date.parse(`${today}T00:00:00Z`)
  const diffDays = Math.round((dueMs - todayMs) / (24 * 60 * 60 * 1000))
  return diffDays <= 14 ? "Due soon" : "Upcoming"
}

export type ObligationWithStatus = Obligation & {
  status: ClosingObligationStatus
}

export type ClosingObligationsResult =
  | { status: "no-access" }
  | { status: "no-period" }
  | { status: "vat-unconfigured"; periodLabel: string }
  | {
      status: "ok"
      periodLabel: string
      periodStart: string
      periodEnd: string
      obligations: ObligationWithStatus[]
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

/**
 * Group obligations by the calendar month of `dueDate`, preserving the
 * engine's chronological (dueDate-ascending) order — each group's rows stay
 * in order, and groups themselves come out oldest-first since the source
 * array is already sorted. Relies on `computeObligations` returning
 * dueDate-sorted rows; if that sort ever changes, a month could split into
 * two non-adjacent groups instead of merging into one.
 */
export function groupByMonth(
  obligations: ObligationWithStatus[],
): { monthKey: string; rows: ObligationWithStatus[] }[] {
  const groups: { monthKey: string; rows: ObligationWithStatus[] }[] = []
  for (const o of obligations) {
    const monthKey = o.dueDate.slice(0, 7)
    const last = groups[groups.length - 1]
    if (last && last.monthKey === monthKey) {
      last.rows.push(o)
    } else {
      groups.push({ monthKey, rows: [o] })
    }
  }
  return groups
}
