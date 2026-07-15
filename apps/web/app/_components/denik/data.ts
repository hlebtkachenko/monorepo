/**
 * Deník (journal) page data. `JournalRow` mirrors the public API shape
 * `GET /v1/accounting/periods/{periodId}/journal` → `rows[]` (see
 * `packages/shared/src/api/accounting.ts` / the generated SDK). Money is a
 * decimal STRING. The real page (`[orgSlug]/accounting/journal/page.tsx`)
 * fetches rows server-side via `_lib/accounting-data`.
 */

type JournalSide = "DEBIT" | "CREDIT"

export interface JournalRow {
  postingId: string
  postingDate: string
  isOpening: boolean
  summaryDesignation: string
  summaryType: string
  accountingEventId: string
  lineId: string
  accountId: string
  accountNumber: string
  accountName: string
  side: JournalSide
  amount: string
  eventDescription: string | null
  counterpartyName: string | null
  /** [Tier 4] true ⇒ the Afframe Brain proposed the posting (a human approved it). */
  createdByAgent: boolean
}

/** Views mirror the deník's natural cuts; `kind` filters the body rows.
 *  `label` is a plain string, fed to `ContentHeader.viewTabs` and the
 *  `manageViews` configure data. */
export interface JournalTab {
  value: string
  label: string
  kind?: JournalSide
}

export const JOURNAL_TABS: JournalTab[] = [
  { value: "all", label: "All" },
  { value: "md", label: "MD (debit)", kind: "DEBIT" },
  { value: "dal", label: "Dal (credit)", kind: "CREDIT" },
]
