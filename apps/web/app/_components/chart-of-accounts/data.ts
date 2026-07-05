/**
 * Účtový rozvrh (chart of accounts) page data types. `AccountRow` mirrors the
 * period's `account` table read (`fetchChartAccounts` in
 * `app/[orgSlug]/_lib/accounting-data.ts`), camelCased for the UI. Rows are
 * fetched server-side by the page and passed down as props.
 */

type AccountNature =
  | "ASSET"
  | "LIABILITY"
  | "EQUITY"
  | "EXPENSE"
  | "REVENUE"
  | "CLOSING"

export interface AccountRow {
  accountId: string
  accountNumber: string
  accountName: string
  nature: string
  normalBalance: "DEBIT" | "CREDIT" | null
  tracksOpenItems: boolean
}

/** Tabs cut the chart into rozvaha vs výsledovka; `natures` filters the rows. */
export interface AccountTab {
  value: string
  label: string
  natures?: AccountNature[]
}

export const ACCOUNT_TABS: AccountTab[] = [
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
