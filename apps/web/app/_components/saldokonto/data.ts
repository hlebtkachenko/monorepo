/**
 * Saldokonto (open items) page data. `OpenItemRow` mirrors the public API shape
 * `GET /v1/accounting/open-items` → `items[]` (see
 * `packages/shared/src/api/accounting.ts` / the generated SDK). Money is a
 * decimal STRING. Fixture stands in until wired.
 *
 * TODO(epic4-wire): getAccountingOpenItems SDK call — replace OPEN_ITEM_ROWS
 * with a fetch through the generated `@afframe/sdk` client.
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

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`

const cpty = (n: number) =>
  `11111111-0000-4000-8000-${String(n).padStart(12, "0")}`

const RAW: Array<Omit<OpenItemRow, "id" | "counterpartyId">> = [
  {
    accountNumber: "311000",
    direction: "RECEIVABLE",
    variableSymbol: "20250042",
    originalAmount: "60500.00",
    settledAmount: "0.00",
    remainingAmount: "60500.00",
    isSettled: false,
    currencyCode: "CZK",
    issueDate: "2026-05-04",
    dueDate: "2026-05-18",
  },
  {
    accountNumber: "311000",
    direction: "RECEIVABLE",
    variableSymbol: "20250043",
    originalAmount: "24200.00",
    settledAmount: "24200.00",
    remainingAmount: "0.00",
    isSettled: true,
    currencyCode: "CZK",
    issueDate: "2026-05-06",
    dueDate: "2026-05-20",
  },
  {
    accountNumber: "311000",
    direction: "RECEIVABLE",
    variableSymbol: "20250051",
    originalAmount: "12100.00",
    settledAmount: "5000.00",
    remainingAmount: "7100.00",
    isSettled: false,
    currencyCode: "CZK",
    issueDate: "2026-05-12",
    dueDate: "2026-05-26",
  },
  {
    accountNumber: "311000",
    direction: "RECEIVABLE",
    variableSymbol: "20250058",
    originalAmount: "8470.00",
    settledAmount: "0.00",
    remainingAmount: "8470.00",
    isSettled: false,
    currencyCode: "CZK",
    issueDate: "2026-05-19",
    dueDate: null,
  },
  {
    accountNumber: "311000",
    direction: "RECEIVABLE",
    variableSymbol: "20250064",
    originalAmount: "36300.00",
    settledAmount: "0.00",
    remainingAmount: "36300.00",
    isSettled: false,
    currencyCode: "CZK",
    issueDate: "2026-05-23",
    dueDate: "2026-06-06",
  },
  {
    accountNumber: "321000",
    direction: "PAYABLE",
    variableSymbol: "2026001177",
    originalAmount: "18150.00",
    settledAmount: "0.00",
    remainingAmount: "18150.00",
    isSettled: false,
    currencyCode: "CZK",
    issueDate: "2026-05-02",
    dueDate: "2026-05-16",
  },
  {
    accountNumber: "321000",
    direction: "PAYABLE",
    variableSymbol: "2026001185",
    originalAmount: "9680.00",
    settledAmount: "9680.00",
    remainingAmount: "0.00",
    isSettled: true,
    currencyCode: "CZK",
    issueDate: "2026-05-07",
    dueDate: "2026-05-21",
  },
  {
    accountNumber: "321000",
    direction: "PAYABLE",
    variableSymbol: "2026001190",
    originalAmount: "42350.00",
    settledAmount: "20000.00",
    remainingAmount: "22350.00",
    isSettled: false,
    currencyCode: "CZK",
    issueDate: "2026-05-11",
    dueDate: "2026-05-25",
  },
  {
    accountNumber: "321000",
    direction: "PAYABLE",
    variableSymbol: "2026001204",
    originalAmount: "6050.00",
    settledAmount: "0.00",
    remainingAmount: "6050.00",
    isSettled: false,
    currencyCode: "CZK",
    issueDate: "2026-05-15",
    dueDate: "2026-05-29",
  },
  {
    accountNumber: "321000",
    direction: "PAYABLE",
    variableSymbol: "2026001219",
    originalAmount: "14520.00",
    settledAmount: "0.00",
    remainingAmount: "14520.00",
    isSettled: false,
    currencyCode: "CZK",
    issueDate: "2026-05-21",
    dueDate: null,
  },
]

export const OPEN_ITEM_ROWS: OpenItemRow[] = RAW.map((r, i) => ({
  ...r,
  direction: r.direction as OpenItemDirection,
  id: uuid(6000 + i),
  counterpartyId: cpty(6000 + i),
}))
