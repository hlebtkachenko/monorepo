/**
 * Legislation table data contract for the workspace tier — the accountant
 * office's cross-company statutory obligation board. Rows are real, resolved
 * server-side (`workspace/legislation/page.tsx`) via the shared obligation
 * engine (`workspace-obligations.ts`), one row per (organization, obligation)
 * for each org's current accounting period. A past due date is presented as
 * exactly that, not as proof of non-compliance; filing state is not persisted.
 */

export type ObligationStatus =
  | "Past due date"
  | "Due soon"
  | "Upcoming"
  | "Condition not evaluated"
  | "Needs input"
  | "Filed"

export type ObligationApplicability =
  "APPLICABLE" | "CONDITION_NOT_EVALUATED" | "NEEDS_INPUT"

export const OBLIGATION_STATUS_BADGE_VARIANT: Record<
  ObligationStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  "Past due date": "outline",
  "Due soon": "default",
  Upcoming: "secondary",
  "Condition not evaluated": "outline",
  "Needs input": "destructive",
  Filed: "secondary",
}

export interface ObligationRow {
  id: string
  /** e.g. "VAT return", "Control statement (KH)". */
  obligation: string
  /** Client book (organization) the obligation belongs to. */
  company: string
  /** ISO date string of the statutory due date. */
  dueDate: string
  status: ObligationStatus
  applicability: ObligationApplicability
  /** Human-readable reason for the applicability decision. */
  note?: string
  /** Responsible accountant; null = unassigned. */
  assignee: string | null
}

export interface ObligationTab {
  value: string
  label: string
  status?: ObligationStatus
}

export const OBLIGATION_TABS: ObligationTab[] = [
  { value: "all", label: "All" },
  { value: "upcoming", label: "Upcoming", status: "Upcoming" },
  { value: "due-soon", label: "Due soon", status: "Due soon" },
  {
    value: "past-due-date",
    label: "Past due date",
    status: "Past due date",
  },
  {
    value: "needs-input",
    label: "Needs input",
    status: "Needs input",
  },
  {
    value: "condition-not-evaluated",
    label: "Condition not evaluated",
    status: "Condition not evaluated",
  },
  { value: "filed", label: "Filed", status: "Filed" },
]

export const OBLIGATION_STATUS_OPTIONS: {
  label: string
  value: ObligationStatus
}[] = [
  { label: "Upcoming", value: "Upcoming" },
  { label: "Due soon", value: "Due soon" },
  { label: "Past due date", value: "Past due date" },
  { label: "Needs input", value: "Needs input" },
  { label: "Condition not evaluated", value: "Condition not evaluated" },
  { label: "Filed", value: "Filed" },
]

/** ISO date → "5 Jul 2026" (locale-stable, no timezone drift on the date part). */
export function formatDueDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number)
  const MONTHS = [
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
  if (!year || !month || !day) return iso
  return `${day} ${MONTHS[month - 1]} ${year}`
}
