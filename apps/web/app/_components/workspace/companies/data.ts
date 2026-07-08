/**
 * Companies (company books = organizations) table data contract for the workspace
 * tier. The identity fields (name, slug, type, fiscal year), the member stack,
 * and the accounting periods are REAL — resolved server-side from
 * `organization` / `organization_membership` / `accounting_period`. The
 * operational fields (VAT regime, status, next deadline, assignee) are MOCK:
 * no columns back them yet (`organization` has no ico/dic/vat_status/
 * status/assignee), so they are derived deterministically from the row id in
 * `enrichCompanyMock` — stable across renders (no hydration drift), clearly
 * placeholder until real sources land.
 */

export type CompanyStatus = "Active" | "Onboarding" | "Archived"
export type CompanyVatRegime = "Payer" | "Non-payer" | "Identified person"

/** A person with an active membership in the company (real, from the DB). */
export interface CompanyMember {
  userId: string
  name: string
  image?: string
}

export interface CompanyRow {
  id: string
  slug: string
  /** Real: organization.legal_name. */
  legalName: string
  /** Real: legal_subject_kind ?? person_kind (e.g. "s.r.o.", "OSVČ"). */
  typeLabel: string
  /** Real: derived from organization.fiscal_year_start_month. */
  fiscalYear: string
  /** Real: active organization members (avatars on the card). */
  members: CompanyMember[]
  /** Real: organization.archived_at is set (drives the archive/unarchive row action). */
  archived: boolean
  /** Real: the org's accounting periods, newest first (card's period picker). */
  periods: CompanyPeriod[]
  /** MOCK. */
  vatRegime: CompanyVatRegime
  /** MOCK. */
  status: CompanyStatus
  /** MOCK — next obligation summary. */
  nextDeadline: string
  /** MOCK — responsible accountant. */
  assignee: string
}

/** An accounting period a user can jump straight into from the card. */
export interface CompanyPeriod {
  /** Real: `accounting_period.id` (UUID) — persisted via `setActivePeriodAction`. */
  value: string
  label: string
  /** Open (postable) vs closed (locked) — drives the lock glyph. */
  open: boolean
}

export interface CompanyTab {
  value: string
  label: string
  status?: CompanyStatus
}

export const COMPANY_TABS: CompanyTab[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active", status: "Active" },
  { value: "onboarding", label: "Onboarding", status: "Onboarding" },
  { value: "archived", label: "Archived", status: "Archived" },
]

export const COMPANY_STATUS_OPTIONS: { label: string; value: CompanyStatus }[] =
  [
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

const pad = (m: number) => String(m).padStart(2, "0")

/**
 * Format an accounting period's date range for the card's period picker: the
 * bare year when it is a full calendar year (Jan–Dec, same year), else the
 * full `MM.YYYY – MM.YYYY` range. Matches the org-header switcher's *trigger*
 * label (`toPeriod().headerLabel` in `period-switcher.tsx`); the header
 * dropdown deliberately shows the full range even for a calendar year, so the
 * two dropdowns differ only in that collapsed-year case.
 */
export function formatPeriodLabel(
  periodStart: string,
  periodEnd: string,
): string {
  const fromYear = Number(periodStart.slice(0, 4))
  const fromMonth = Number(periodStart.slice(5, 7))
  const toYear = Number(periodEnd.slice(0, 4))
  const toMonth = Number(periodEnd.slice(5, 7))
  const isCalendarYear =
    fromMonth === 1 && toMonth === 12 && fromYear === toYear
  return isCalendarYear
    ? String(fromYear)
    : `${pad(fromMonth)}.${fromYear} – ${pad(toMonth)}.${toYear}`
}

/** Map `accounting_period` rows (newest-first) into the card's period-picker shape. */
export function toCompanyPeriods(
  rows: {
    id: string
    period_start: string
    period_end: string
    status: "OPEN" | "CLOSED"
  }[],
): CompanyPeriod[] {
  return rows.map((row) => ({
    value: row.id,
    label: formatPeriodLabel(row.period_start, row.period_end),
    open: row.status === "OPEN",
  }))
}

const VAT_REGIMES: CompanyVatRegime[] = [
  "Payer",
  "Non-payer",
  "Identified person",
]
const STATUSES: CompanyStatus[] = ["Active", "Active", "Onboarding", "Archived"]
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

/** Deterministic MOCK operational fields derived from the company id. */
export function enrichCompanyMock(id: string): {
  vatRegime: CompanyVatRegime
  status: CompanyStatus
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

/**
 * Status → Badge variant. The single source shared by the card, the table
 * columns, and the inspector (was copy-pasted in three places). Typed to the
 * literal variants so this data module stays free of component imports.
 */
export const STATUS_BADGE: Record<
  CompanyStatus,
  "default" | "secondary" | "outline"
> = {
  Active: "default",
  Onboarding: "secondary",
  Archived: "outline",
}

/**
 * The one free-text search predicate for BOTH Companies views. Card and table
 * previously carried divergent copies (the card omitted `status`), so the same
 * query returned different results per view.
 */
export function applySearch(rows: CompanyRow[], query: string): CompanyRow[] {
  const q = query.trim().toLowerCase()
  if (!q) return rows
  return rows.filter((row) =>
    [
      row.legalName,
      row.slug,
      row.typeLabel,
      row.vatRegime,
      row.status,
      row.assignee,
    ].some((value) => value.toLowerCase().includes(q)),
  )
}
