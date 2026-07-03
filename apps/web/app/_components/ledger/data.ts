/**
 * Hlavní kniha / obratová předvaha page data. `LedgerRow` mirrors the public
 * API shape `GET /v1/accounting/periods/{id}/ledger` → `accounts[]` (see
 * `packages/shared/src/api/accounting.ts` / the generated SDK). Money is a
 * decimal STRING. The real page (`[orgSlug]/accounting/ledger/page.tsx`)
 * fetches rows server-side via `_lib/accounting-data`; `LEDGER_ROWS` below is
 * a demo fixture kept for reference.
 */

export type AccountNature =
  | "ASSET"
  | "LIABILITY"
  | "EQUITY"
  | "EXPENSE"
  | "REVENUE"
  | "CLOSING"

export interface LedgerRow {
  accountId: string
  accountNumber: string
  accountName: string
  nature: string
  normalBalance: "DEBIT" | "CREDIT" | null
  openingBalance: string
  turnoverDebit: string
  turnoverCredit: string
  closingBalance: string
}

/** Tabs cut the chart into rozvaha vs výsledovka; `natures` filters the rows. */
export interface LedgerTab {
  value: string
  label: string
  natures?: AccountNature[]
}

export const LEDGER_TABS: LedgerTab[] = [
  { value: "all", label: "All" },
  {
    value: "rozvaha",
    label: "Rozvaha",
    natures: ["ASSET", "LIABILITY", "EQUITY"],
  },
  {
    value: "vysledovka",
    label: "Výsledovka",
    natures: ["EXPENSE", "REVENUE"],
  },
]

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`

const RAW: Array<Omit<LedgerRow, "accountId">> = [
  {
    accountNumber: "211000",
    accountName: "Pokladna",
    nature: "ASSET",
    normalBalance: "DEBIT",
    openingBalance: "5000.00",
    turnoverDebit: "0.00",
    turnoverCredit: "1500.00",
    closingBalance: "3500.00",
  },
  {
    accountNumber: "221000",
    accountName: "Bankovní účty",
    nature: "ASSET",
    normalBalance: "DEBIT",
    openingBalance: "120000.00",
    turnoverDebit: "60500.00",
    turnoverCredit: "0.00",
    closingBalance: "180500.00",
  },
  {
    accountNumber: "311000",
    accountName: "Odběratelé",
    nature: "ASSET",
    normalBalance: "DEBIT",
    openingBalance: "0.00",
    turnoverDebit: "60500.00",
    turnoverCredit: "60500.00",
    closingBalance: "0.00",
  },
  {
    accountNumber: "321000",
    accountName: "Dodavatelé",
    nature: "LIABILITY",
    normalBalance: "CREDIT",
    openingBalance: "0.00",
    turnoverDebit: "0.00",
    turnoverCredit: "32641.00",
    closingBalance: "32641.00",
  },
  {
    accountNumber: "343000",
    accountName: "DPH",
    nature: "LIABILITY",
    normalBalance: "CREDIT",
    openingBalance: "0.00",
    turnoverDebit: "2541.00",
    turnoverCredit: "10500.00",
    closingBalance: "7959.00",
  },
  {
    accountNumber: "501100",
    accountName: "Spotřeba materiálu",
    nature: "EXPENSE",
    normalBalance: "DEBIT",
    openingBalance: "0.00",
    turnoverDebit: "18000.00",
    turnoverCredit: "0.00",
    closingBalance: "18000.00",
  },
  {
    accountNumber: "518100",
    accountName: "Ostatní služby",
    nature: "EXPENSE",
    normalBalance: "DEBIT",
    openingBalance: "0.00",
    turnoverDebit: "1500.00",
    turnoverCredit: "0.00",
    closingBalance: "1500.00",
  },
  {
    accountNumber: "518300",
    accountName: "Nájemné",
    nature: "EXPENSE",
    normalBalance: "DEBIT",
    openingBalance: "0.00",
    turnoverDebit: "12100.00",
    turnoverCredit: "0.00",
    closingBalance: "12100.00",
  },
  {
    accountNumber: "602000",
    accountName: "Tržby z služeb",
    nature: "REVENUE",
    normalBalance: "CREDIT",
    openingBalance: "0.00",
    turnoverDebit: "0.00",
    turnoverCredit: "50000.00",
    closingBalance: "50000.00",
  },
]

export const LEDGER_ROWS: LedgerRow[] = RAW.map((r, i) => ({
  ...r,
  accountId: uuid(5000 + i),
}))
