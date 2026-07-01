/**
 * TEMP preview data for the Content Panel build. Mock incoming-invoice rows so
 * the header tabs / toolbar / status bar / action bar / inspector can be wired
 * against a real table. NOT the domain model — `amount` / `vat` are plain
 * display numbers here, NOT the `Money<Currency>` type the real ledger uses.
 */

export type InvoiceKind =
  | "advance"
  | "tax-document"
  | "credit-note"
  | "settlement"

export type InvoiceStatus = "New" | "To approve" | "Approved" | "Posted"

export interface InvoiceRow {
  id: string
  document: string
  partner: string
  /** Mock display amount in CZK (not the domain Money type). */
  amount: number
  /** Mock display VAT amount in CZK. */
  vat: number
  /** ISO date — sorted/formatted in the cell. */
  date: string
  status: InvoiceStatus
  kind: InvoiceKind
  /** Mock "needs matching to a bank line" flag, for the status-bar summary. */
  needsMatch: boolean
}

/** Tab → kind. The "all" tab shows every row and is always visible. */
export const INVOICE_TABS: {
  value: string
  label: string
  kind?: InvoiceKind
}[] = [
  { value: "all", label: "All" },
  { value: "advances", label: "Advances", kind: "advance" },
  { value: "tax", label: "Tax documents", kind: "tax-document" },
  { value: "credit-notes", label: "Credit notes", kind: "credit-note" },
  { value: "settlements", label: "Settlements", kind: "settlement" },
]

export const INVOICE_STATUS_OPTIONS: { value: InvoiceStatus; label: string }[] =
  [
    { value: "New", label: "New" },
    { value: "To approve", label: "To approve" },
    { value: "Approved", label: "Approved" },
    { value: "Posted", label: "Posted" },
  ]

export const INVOICE_ROWS: InvoiceRow[] = [
  {
    id: "1",
    document: "FP-2026-0001",
    partner: "Alza.cz a.s.",
    amount: 12400,
    vat: 2152,
    date: "2026-06-01",
    status: "Posted",
    kind: "tax-document",
    needsMatch: false,
  },
  {
    id: "2",
    document: "FP-2026-0002",
    partner: "ČEZ Prodej s.r.o.",
    amount: 8650,
    vat: 1502,
    date: "2026-06-03",
    status: "Approved",
    kind: "tax-document",
    needsMatch: true,
  },
  {
    id: "3",
    document: "ZAL-2026-0007",
    partner: "O2 Czech Republic",
    amount: 3000,
    vat: 0,
    date: "2026-06-04",
    status: "To approve",
    kind: "advance",
    needsMatch: true,
  },
  {
    id: "4",
    document: "FP-2026-0003",
    partner: "Google Cloud EMEA",
    amount: 21980,
    vat: 0,
    date: "2026-06-05",
    status: "New",
    kind: "tax-document",
    needsMatch: true,
  },
  {
    id: "5",
    document: "DOB-2026-0002",
    partner: "Alza.cz a.s.",
    amount: -1240,
    vat: -215,
    date: "2026-06-06",
    status: "Approved",
    kind: "credit-note",
    needsMatch: false,
  },
  {
    id: "6",
    document: "FP-2026-0004",
    partner: "Seznam.cz a.s.",
    amount: 5400,
    vat: 937,
    date: "2026-06-08",
    status: "Posted",
    kind: "tax-document",
    needsMatch: false,
  },
  {
    id: "7",
    document: "ZAP-2026-0001",
    partner: "Henderson Profese s.r.o.",
    amount: 9900,
    vat: 0,
    date: "2026-06-09",
    status: "To approve",
    kind: "settlement",
    needsMatch: false,
  },
  {
    id: "8",
    document: "ZAL-2026-0008",
    partner: "Rohlik.cz",
    amount: 1500,
    vat: 0,
    date: "2026-06-10",
    status: "New",
    kind: "advance",
    needsMatch: true,
  },
  {
    id: "9",
    document: "FP-2026-0005",
    partner: "Microsoft Ireland",
    amount: 33150,
    vat: 0,
    date: "2026-06-11",
    status: "Approved",
    kind: "tax-document",
    needsMatch: false,
  },
  {
    id: "10",
    document: "DOB-2026-0003",
    partner: "Seznam.cz a.s.",
    amount: -540,
    vat: -94,
    date: "2026-06-12",
    status: "New",
    kind: "credit-note",
    needsMatch: true,
  },
  {
    id: "11",
    document: "FP-2026-0006",
    partner: "Kofola ČeskoSlovensko",
    amount: 7250,
    vat: 1259,
    date: "2026-06-13",
    status: "Posted",
    kind: "tax-document",
    needsMatch: false,
  },
  {
    id: "12",
    document: "ZAP-2026-0002",
    partner: "Notino s.r.o.",
    amount: 4300,
    vat: 0,
    date: "2026-06-15",
    status: "To approve",
    kind: "settlement",
    needsMatch: false,
  },
]

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "CZK",
  maximumFractionDigits: 0,
})

export function formatMoney(amount: number): string {
  return money.format(amount)
}

export function formatDate(iso: string): string {
  // Parse as a local date — `new Date(iso)` reads a date-only ISO string as UTC
  // midnight, which renders the previous day in timezones west of UTC.
  const [year, month, day] = iso.split("-").map(Number)
  const date =
    year && month && day ? new Date(year, month - 1, day) : new Date(iso)
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date)
}
