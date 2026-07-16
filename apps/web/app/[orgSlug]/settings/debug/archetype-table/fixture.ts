/**
 * Minimal, self-contained sample data for the ArchetypeTable debug reference
 * page. NOT the domain model — `amount` / `vat` are plain display numbers, not
 * the `Money<Currency>` type the real ledger uses. Eight rows cover all four
 * kinds and all four statuses so the view tabs, status filter, and kind filter
 * are never empty. Lives beside the page (a dev-only reference surface) rather
 * than in a shared component.
 */

export type InvoiceKind =
  "advance" | "tax-document" | "credit-note" | "settlement"

export type InvoiceStatus = "New" | "To approve" | "Approved" | "Posted"

export interface InvoiceRow {
  id: string
  document: string
  partner: string
  /** Display amount in CZK (not the domain Money type). */
  amount: number
  /** Display VAT amount in CZK. */
  vat: number
  /** ISO date — sorted/formatted in the cell. */
  date: string
  status: InvoiceStatus
  kind: InvoiceKind
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
    status: "New",
    kind: "tax-document",
  },
  {
    id: "2",
    document: "FP-2026-0002",
    partner: "ČEZ Prodej a.s.",
    amount: 8600,
    vat: 1492,
    date: "2026-06-03",
    status: "To approve",
    kind: "tax-document",
  },
  {
    id: "3",
    document: "ZAL-2026-0007",
    partner: "O2 Czech Republic a.s.",
    amount: 5000,
    vat: 0,
    date: "2026-06-05",
    status: "New",
    kind: "advance",
  },
  {
    id: "4",
    document: "ZAL-2026-0008",
    partner: "Seznam.cz a.s.",
    amount: 15000,
    vat: 0,
    date: "2026-06-08",
    status: "Approved",
    kind: "advance",
  },
  {
    id: "5",
    document: "DOB-2026-0003",
    partner: "Alza.cz a.s.",
    amount: -2400,
    vat: -416,
    date: "2026-06-11",
    status: "Approved",
    kind: "credit-note",
  },
  {
    id: "6",
    document: "DOB-2026-0004",
    partner: "Notino s.r.o.",
    amount: -1200,
    vat: -208,
    date: "2026-06-13",
    status: "Posted",
    kind: "credit-note",
  },
  {
    id: "7",
    document: "VYR-2026-0012",
    partner: "Rohlík.cz s.r.o.",
    amount: 3300,
    vat: 429,
    date: "2026-06-16",
    status: "To approve",
    kind: "settlement",
  },
  {
    id: "8",
    document: "VYR-2026-0013",
    partner: "Kaufland Česká republika v.o.s.",
    amount: 9800,
    vat: 1274,
    date: "2026-06-19",
    status: "Posted",
    kind: "settlement",
  },
]
