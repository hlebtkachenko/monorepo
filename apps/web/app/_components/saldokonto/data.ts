/**
 * Saldokonto (open items) page data types. `OpenItemRow` mirrors the public API
 * shape `GET /v1/accounting/open-items` → `items[]` and `SaldoPartnerRow`
 * mirrors `GET /v1/accounting/saldokonto` → `partners[]` (see
 * `packages/shared/src/api/accounting.ts` / the generated SDK). Money is a
 * decimal STRING. Rows are fetched server-side by the page
 * (`app/[orgSlug]/_lib/accounting-data.ts`) and passed down as props.
 */

export type OpenItemDirection = "RECEIVABLE" | "PAYABLE"

export interface OpenItemRow {
  id: string
  counterpartyId: string
  accountNumber: string
  direction: OpenItemDirection
  variableSymbol: string | null
  originalAmount: string
  settledAmount: string
  remainingAmount: string
  isSettled: boolean
  currencyCode: string
  issueDate: string
  dueDate: string | null
}

/** Per-partner open balance (saldokonto gross view). */
export interface SaldoPartnerRow {
  counterpartyId: string
  accountNumber: string
  direction: OpenItemDirection
  openTotal: string
}

/** Tabs split open items by direction; `direction` filters the rows. */
export interface OpenItemTab {
  value: string
  label: string
  direction?: OpenItemDirection
}

export const OPEN_ITEM_TABS: OpenItemTab[] = [
  { value: "all", label: "All" },
  { value: "receivable", label: "Receivable", direction: "RECEIVABLE" },
  { value: "payable", label: "Payable", direction: "PAYABLE" },
]
