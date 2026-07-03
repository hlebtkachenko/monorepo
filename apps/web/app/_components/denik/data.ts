/**
 * Deník (journal) page data. `JournalRow` mirrors the public API shape
 * `GET /v1/accounting/periods/{periodId}/journal` → `rows[]` (see
 * `packages/shared/src/api/accounting.ts` / the generated SDK). Money is a
 * decimal STRING. The real page (`[orgSlug]/accounting/journal/page.tsx`)
 * fetches rows server-side via `_lib/accounting-data`; `JOURNAL_ROWS` below is
 * a demo fixture kept for reference.
 */

export type JournalSide = "DEBIT" | "CREDIT"

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
  side: JournalSide
  amount: string
}

/** Tabs mirror the deník's natural cuts; `kind` filters the body rows.
 *  `label` is a plain string so the tab list feeds both `ContentHeader`
 *  (ReactNode labels) and `ManageTabsMenu` (string labels). */
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

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`

/** A balanced fixture: each doklad posts a debit + credit line. */
export const JOURNAL_ROWS: JournalRow[] = [
  {
    postingDate: "2025-01-02",
    summaryDesignation: "FP2025/0001",
    summaryType: "INVOICE_RECEIVED",
    accountNumber: "501100",
    side: "DEBIT",
    amount: "18000.00",
    isOpening: false,
  },
  {
    postingDate: "2025-01-02",
    summaryDesignation: "FP2025/0001",
    summaryType: "INVOICE_RECEIVED",
    accountNumber: "321000",
    side: "CREDIT",
    amount: "18000.00",
    isOpening: false,
  },
  {
    postingDate: "2025-01-08",
    summaryDesignation: "FV2025/0001",
    summaryType: "INVOICE_ISSUED",
    accountNumber: "311000",
    side: "DEBIT",
    amount: "60500.00",
    isOpening: false,
  },
  {
    postingDate: "2025-01-08",
    summaryDesignation: "FV2025/0001",
    summaryType: "INVOICE_ISSUED",
    accountNumber: "602000",
    side: "CREDIT",
    amount: "50000.00",
    isOpening: false,
  },
  {
    postingDate: "2025-01-08",
    summaryDesignation: "FV2025/0001",
    summaryType: "INVOICE_ISSUED",
    accountNumber: "343000",
    side: "CREDIT",
    amount: "10500.00",
    isOpening: false,
  },
  {
    postingDate: "2025-01-15",
    summaryDesignation: "BV2025/0003",
    summaryType: "BANK_STATEMENT",
    accountNumber: "221000",
    side: "DEBIT",
    amount: "60500.00",
    isOpening: false,
  },
  {
    postingDate: "2025-01-15",
    summaryDesignation: "BV2025/0003",
    summaryType: "BANK_STATEMENT",
    accountNumber: "311000",
    side: "CREDIT",
    amount: "60500.00",
    isOpening: false,
  },
  {
    postingDate: "2025-01-20",
    summaryDesignation: "FP2025/0002",
    summaryType: "INVOICE_RECEIVED",
    accountNumber: "518300",
    side: "DEBIT",
    amount: "12100.00",
    isOpening: false,
  },
  {
    postingDate: "2025-01-20",
    summaryDesignation: "FP2025/0002",
    summaryType: "INVOICE_RECEIVED",
    accountNumber: "343000",
    side: "DEBIT",
    amount: "2541.00",
    isOpening: false,
  },
  {
    postingDate: "2025-01-20",
    summaryDesignation: "FP2025/0002",
    summaryType: "INVOICE_RECEIVED",
    accountNumber: "321000",
    side: "CREDIT",
    amount: "14641.00",
    isOpening: false,
  },
  {
    postingDate: "2025-01-31",
    summaryDesignation: "VPD2025/0007",
    summaryType: "CASH_VOUCHER",
    accountNumber: "518100",
    side: "DEBIT",
    amount: "1500.00",
    isOpening: false,
  },
  {
    postingDate: "2025-01-31",
    summaryDesignation: "VPD2025/0007",
    summaryType: "CASH_VOUCHER",
    accountNumber: "211000",
    side: "CREDIT",
    amount: "1500.00",
    isOpening: false,
  },
].map((r, i) => ({
  ...r,
  side: r.side as JournalSide,
  postingId: uuid(1000 + Math.floor(i / 2)),
  accountingEventId: uuid(2000 + Math.floor(i / 2)),
  lineId: uuid(3000 + i),
  accountId: uuid(4000 + i),
}))
