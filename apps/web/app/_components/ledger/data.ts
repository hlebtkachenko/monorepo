/**
 * Hlavní kniha / obratová předvaha page data. `LedgerRow` mirrors the public
 * API shape `GET /v1/accounting/periods/{id}/ledger` → `accounts[]` (see
 * `packages/shared/src/api/accounting.ts` / the generated SDK). Money is a
 * decimal STRING. The real page (`[orgSlug]/accounting/ledger/page.tsx`)
 * fetches rows server-side via `_lib/accounting-data`.
 */

type AccountNature =
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
