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
  accountName: string
  side: JournalSide
  amount: string
  eventDescription: string | null
  counterpartyName: string | null
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

const ACCOUNT_NAMES: Record<string, string> = {
  "501100": "Spotřeba materiálu",
  "321000": "Dodavatelé",
  "311000": "Odběratelé",
  "602000": "Tržby z prodeje služeb",
  "343000": "DPH",
  "221000": "Bankovní účty",
  "518300": "Ostatní služby",
  "518100": "Ostatní služby",
  "211000": "Pokladna",
}

/** Per-doklad event description + counterparty for the fixture rows. */
const EVENT_META: Record<
  string,
  { description: string | null; counterparty: string | null }
> = {
  "FP2025/0001": {
    description: "Nákup kancelářského materiálu",
    counterparty: "Papírnictví Novák s.r.o.",
  },
  "FV2025/0001": {
    description: "Konzultační služby leden 2025",
    counterparty: "Acme Trading s.r.o.",
  },
  "BV2025/0003": {
    description: "Úhrada FV2025/0001",
    counterparty: null,
  },
  "FP2025/0002": {
    description: "Právní služby",
    counterparty: "AK Dvořák a partneři",
  },
  "VPD2025/0007": {
    description: "Poštovné",
    counterparty: null,
  },
}

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
  accountName: ACCOUNT_NAMES[r.accountNumber] ?? "",
  eventDescription: EVENT_META[r.summaryDesignation]?.description ?? null,
  counterpartyName: EVENT_META[r.summaryDesignation]?.counterparty ?? null,
}))
