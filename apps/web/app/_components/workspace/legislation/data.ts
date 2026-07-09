/**
 * Legislation table data contract for the workspace tier — the accountant
 * office's cross-company statutory obligation board. Rows are real, resolved
 * server-side (`workspace/legislation/page.tsx`) via the shared obligation
 * engine (`workspace-obligations.ts`), one row per (organization, obligation)
 * for each org's current accounting period. Status is date-derived only —
 * there is NO persisted filing state, so `"Filed"` does not exist as a value.
 * The board is forward-looking only (`dueDate >= today`), so `"Overdue"` does
 * not exist as a value either — without filing state there is no truthful way
 * to say a past obligation went unfiled. Mirrors the Companies table surface.
 */

export type ObligationStatus = "Upcoming" | "Due soon"

export interface ObligationRow {
  id: string
  /** e.g. "VAT return", "Control statement (KH)". */
  obligation: string
  /** Client book (organization) the obligation belongs to. */
  company: string
  /** ISO date string of the statutory due date. */
  dueDate: string
  status: ObligationStatus
  /** true = only applies if the underlying event occurred (e.g. SH). */
  conditional: boolean
  /** Human-readable explanation of the condition, e.g. "only if the event occurred". */
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
]

export const OBLIGATION_STATUS_OPTIONS: {
  label: string
  value: ObligationStatus
}[] = [
  { label: "Upcoming", value: "Upcoming" },
  { label: "Due soon", value: "Due soon" },
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
