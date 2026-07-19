import {
  deriveObligationPresentationStatus,
  type Obligation,
  type ObligationPresentationStatus,
} from "./model"
import type { ProfileIssue } from "./timeline-obligations"

/**
 * Presentational obligation status + grouping helpers shared by the closing
 * views. Pure — no DB/Next dependencies. Extracted out of the old
 * `apps/web/app/[orgSlug]/closing/_lib/closing-shared.ts` route file so
 * cross-tier consumers no longer reach into the route tree.
 */

export type ClosingObligationStatus = ObligationPresentationStatus

export const deriveObligationStatus = deriveObligationPresentationStatus

export type ObligationWithStatus = Obligation & {
  status: ClosingObligationStatus
}

export type ClosingObligationsResult =
  | { status: "no-access" }
  | { status: "no-period" }
  | {
      status: "ok"
      periodLabel: string
      periodStart: string
      periodEnd: string
      obligations: ObligationWithStatus[]
      issues: ProfileIssue[]
    }

/**
 * Group obligations by the calendar month of `dueDate`, preserving the
 * engine's chronological (dueDate-ascending) order — each group's rows stay
 * in order, and groups themselves come out oldest-first since the source
 * array is already sorted. Relies on the source being dueDate-sorted; if that
 * ever changes, a month could split into two non-adjacent groups instead of
 * merging into one.
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
