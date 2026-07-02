/**
 * Clients (client books = organizations) table data contract for the workspace
 * tier. The identity fields (name, slug, type, fiscal year) are REAL — resolved
 * server-side from the `organization` table. The operational fields (VAT
 * regime, status, next deadline, assignee) are MOCK: no columns back them yet
 * (`organization` has no ico/dic/vat_status/status/assignee), so they are
 * derived deterministically from the row id in `enrichClientMock` — stable
 * across renders (no hydration drift), clearly placeholder until real sources
 * land. Mirrors the org tier's mock-backed surfaces.
 */

export type ClientStatus = "Active" | "Onboarding" | "Archived"
export type ClientVatRegime = "Payer" | "Non-payer" | "Identified person"

export interface ClientRow {
  id: string
  slug: string
  /** Real: organization.legal_name. */
  legalName: string
  /** Real: legal_subject_kind ?? person_kind (e.g. "s.r.o.", "OSVČ"). */
  typeLabel: string
  /** Real: derived from organization.fiscal_year_start_month. */
  fiscalYear: string
  /** MOCK. */
  vatRegime: ClientVatRegime
  /** MOCK. */
  status: ClientStatus
  /** MOCK — next obligation summary. */
  nextDeadline: string
  /** MOCK — responsible accountant. */
  assignee: string
}

export interface ClientTab {
  value: string
  label: string
  status?: ClientStatus
}

export const CLIENT_TABS: ClientTab[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active", status: "Active" },
  { value: "onboarding", label: "Onboarding", status: "Onboarding" },
  { value: "archived", label: "Archived", status: "Archived" },
]

export const CLIENT_STATUS_OPTIONS: { label: string; value: ClientStatus }[] = [
  { label: "Active", value: "Active" },
  { label: "Onboarding", value: "Onboarding" },
  { label: "Archived", value: "Archived" },
]

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

/** `1` → "Jan – Dec"; `4` → "Apr – Mar". Falls back to the calendar year. */
export function fiscalYearLabel(startMonth: number): string {
  const start = (((startMonth - 1) % 12) + 12) % 12
  const end = (start + 11) % 12
  return `${MONTHS[start]} – ${MONTHS[end]}`
}

const VAT_REGIMES: ClientVatRegime[] = [
  "Payer",
  "Non-payer",
  "Identified person",
]
const STATUSES: ClientStatus[] = ["Active", "Active", "Active", "Onboarding"]
const ASSIGNEES = [
  "Jana Nováková",
  "Petr Svoboda",
  "Lucie Dvořáková",
  "Tomáš Novák",
]
const DEADLINES = [
  "VAT return · 25th",
  "Control statement · 25th",
  "Payroll report · 20th",
  "Income tax · 1 Apr",
  "No upcoming deadline",
]

/** Stable non-negative hash of a string (djb2-ish) for deterministic mock picks. */
function hash(input: string): number {
  let h = 5381
  for (let i = 0; i < input.length; i++)
    h = (h * 33 + input.charCodeAt(i)) >>> 0
  return h
}

/** Deterministic MOCK operational fields derived from the client id. */
export function enrichClientMock(id: string): {
  vatRegime: ClientVatRegime
  status: ClientStatus
  nextDeadline: string
  assignee: string
} {
  const h = hash(id)
  const status = STATUSES[h % STATUSES.length]!
  return {
    vatRegime: VAT_REGIMES[h % VAT_REGIMES.length]!,
    status,
    nextDeadline:
      status === "Archived" ? "—" : DEADLINES[(h >> 3) % DEADLINES.length]!,
    assignee: ASSIGNEES[(h >> 5) % ASSIGNEES.length]!,
  }
}
