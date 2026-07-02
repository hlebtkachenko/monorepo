/**
 * Legislation table data contract for the workspace tier — the accountant
 * office's cross-company statutory obligation board. Every field is MOCK: no
 * columns back statutory obligations yet, so the rows are a static, deterministic
 * fixture (no `Math.random`, no `Date.now`) — stable across renders (no
 * hydration drift), clearly placeholder until a real obligation source lands.
 * Mirrors the Companies table surface.
 */

export type ObligationStatus = "Upcoming" | "Due soon" | "Overdue" | "Filed"

export interface ObligationRow {
  id: string
  /** e.g. "VAT return", "Control statement (KH)". */
  obligation: string
  /** Client book (organization) the obligation belongs to. */
  company: string
  /** ISO date string of the statutory due date. */
  dueDate: string
  status: ObligationStatus
  /** Responsible accountant. */
  assignee: string
}

export interface ObligationTab {
  value: string
  label: string
  status?: ObligationStatus
}

export const OBLIGATION_TABS: ObligationTab[] = [
  { value: "all", label: "All" },
  { value: "upcoming", label: "Upcoming", status: "Upcoming" },
  { value: "overdue", label: "Overdue", status: "Overdue" },
  { value: "filed", label: "Filed", status: "Filed" },
]

export const OBLIGATION_STATUS_OPTIONS: {
  label: string
  value: ObligationStatus
}[] = [
  { label: "Upcoming", value: "Upcoming" },
  { label: "Due soon", value: "Due soon" },
  { label: "Overdue", value: "Overdue" },
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

/**
 * Static MOCK obligation board — ~18 rows across a mock company roster. Dates
 * straddle the current period so all four status buckets are represented.
 */
export const OBLIGATION_ROWS: ObligationRow[] = [
  {
    id: "d-01",
    obligation: "VAT return",
    company: "Novák Trading s.r.o.",
    dueDate: "2026-07-27",
    status: "Due soon",
    assignee: "Jana Nováková",
  },
  {
    id: "d-02",
    obligation: "Control statement (KH)",
    company: "Novák Trading s.r.o.",
    dueDate: "2026-07-27",
    status: "Due soon",
    assignee: "Jana Nováková",
  },
  {
    id: "d-03",
    obligation: "Payroll report",
    company: "Svoboda Design s.r.o.",
    dueDate: "2026-07-20",
    status: "Overdue",
    assignee: "Petr Svoboda",
  },
  {
    id: "d-04",
    obligation: "EC Sales List",
    company: "Dvořák Export a.s.",
    dueDate: "2026-07-25",
    status: "Due soon",
    assignee: "Lucie Dvořáková",
  },
  {
    id: "d-05",
    obligation: "Income tax advance",
    company: "Horák Consulting s.r.o.",
    dueDate: "2026-06-15",
    status: "Overdue",
    assignee: "Tomáš Novák",
  },
  {
    id: "d-06",
    obligation: "VAT return",
    company: "Kučera Bistro s.r.o.",
    dueDate: "2026-08-25",
    status: "Upcoming",
    assignee: "Jana Nováková",
  },
  {
    id: "d-07",
    obligation: "Payroll report",
    company: "Novák Trading s.r.o.",
    dueDate: "2026-06-20",
    status: "Filed",
    assignee: "Petr Svoboda",
  },
  {
    id: "d-08",
    obligation: "Control statement (KH)",
    company: "Dvořák Export a.s.",
    dueDate: "2026-08-25",
    status: "Upcoming",
    assignee: "Lucie Dvořáková",
  },
  {
    id: "d-09",
    obligation: "EC Sales List",
    company: "Marek Logistics s.r.o.",
    dueDate: "2026-07-25",
    status: "Due soon",
    assignee: "Tomáš Novák",
  },
  {
    id: "d-10",
    obligation: "Income tax advance",
    company: "Svoboda Design s.r.o.",
    dueDate: "2026-09-15",
    status: "Upcoming",
    assignee: "Jana Nováková",
  },
  {
    id: "d-11",
    obligation: "VAT return",
    company: "Horák Consulting s.r.o.",
    dueDate: "2026-06-25",
    status: "Filed",
    assignee: "Tomáš Novák",
  },
  {
    id: "d-12",
    obligation: "Payroll report",
    company: "Kučera Bistro s.r.o.",
    dueDate: "2026-07-20",
    status: "Overdue",
    assignee: "Petr Svoboda",
  },
  {
    id: "d-13",
    obligation: "Control statement (KH)",
    company: "Marek Logistics s.r.o.",
    dueDate: "2026-07-27",
    status: "Due soon",
    assignee: "Lucie Dvořáková",
  },
  {
    id: "d-14",
    obligation: "VAT return",
    company: "Dvořák Export a.s.",
    dueDate: "2026-06-25",
    status: "Filed",
    assignee: "Lucie Dvořáková",
  },
  {
    id: "d-15",
    obligation: "Income tax advance",
    company: "Marek Logistics s.r.o.",
    dueDate: "2026-09-15",
    status: "Upcoming",
    assignee: "Tomáš Novák",
  },
  {
    id: "d-16",
    obligation: "EC Sales List",
    company: "Novák Trading s.r.o.",
    dueDate: "2026-06-25",
    status: "Filed",
    assignee: "Jana Nováková",
  },
  {
    id: "d-17",
    obligation: "Payroll report",
    company: "Horák Consulting s.r.o.",
    dueDate: "2026-08-20",
    status: "Upcoming",
    assignee: "Petr Svoboda",
  },
  {
    id: "d-18",
    obligation: "Control statement (KH)",
    company: "Kučera Bistro s.r.o.",
    dueDate: "2026-08-25",
    status: "Upcoming",
    assignee: "Jana Nováková",
  },
]
