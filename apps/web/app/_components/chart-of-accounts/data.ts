/**
 * Účtový rozvrh (chart of accounts) page data. `AccountRow` mirrors the public
 * API shape of a chart-of-accounts read (see `packages/shared/src/api/accounting.ts`
 * / the generated SDK once the endpoint lands). Fixture stands in until wired.
 *
 * TODO(epic4-wire): chart-of-accounts SDK call (endpoint TBD)
 */

export type AccountNature =
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
  isAnalytic: boolean
  active: boolean
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

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`

const RAW: Array<Omit<AccountRow, "accountId">> = [
  {
    accountNumber: "211000",
    accountName: "Pokladna",
    nature: "ASSET",
    normalBalance: "DEBIT",
    isAnalytic: true,
    active: true,
  },
  {
    accountNumber: "221000",
    accountName: "Bankovní účty",
    nature: "ASSET",
    normalBalance: "DEBIT",
    isAnalytic: true,
    active: true,
  },
  {
    accountNumber: "311000",
    accountName: "Odběratelé",
    nature: "ASSET",
    normalBalance: "DEBIT",
    isAnalytic: true,
    active: true,
  },
  {
    accountNumber: "321000",
    accountName: "Dodavatelé",
    nature: "LIABILITY",
    normalBalance: "CREDIT",
    isAnalytic: true,
    active: true,
  },
  {
    accountNumber: "343000",
    accountName: "DPH",
    nature: "LIABILITY",
    normalBalance: "CREDIT",
    isAnalytic: true,
    active: true,
  },
  {
    accountNumber: "501100",
    accountName: "Spotřeba materiálu",
    nature: "EXPENSE",
    normalBalance: "DEBIT",
    isAnalytic: true,
    active: true,
  },
  {
    accountNumber: "518100",
    accountName: "Ostatní služby",
    nature: "EXPENSE",
    normalBalance: "DEBIT",
    isAnalytic: true,
    active: true,
  },
  {
    accountNumber: "518300",
    accountName: "Nájemné",
    nature: "EXPENSE",
    normalBalance: "DEBIT",
    isAnalytic: true,
    active: true,
  },
  {
    accountNumber: "538000",
    accountName: "Ostatní daně a poplatky",
    nature: "EXPENSE",
    normalBalance: "DEBIT",
    isAnalytic: false,
    active: false,
  },
  {
    accountNumber: "602000",
    accountName: "Tržby z služeb",
    nature: "REVENUE",
    normalBalance: "CREDIT",
    isAnalytic: true,
    active: true,
  },
  {
    accountNumber: "604000",
    accountName: "Tržby za zboží",
    nature: "REVENUE",
    normalBalance: "CREDIT",
    isAnalytic: false,
    active: false,
  },
  {
    accountNumber: "411000",
    accountName: "Základní kapitál",
    nature: "EQUITY",
    normalBalance: "CREDIT",
    isAnalytic: false,
    active: true,
  },
  {
    accountNumber: "431000",
    accountName: "Výsledek hospodaření ve schvalovacím řízení",
    nature: "EQUITY",
    normalBalance: null,
    isAnalytic: false,
    active: true,
  },
  {
    accountNumber: "701000",
    accountName: "Počáteční účet rozvažný",
    nature: "CLOSING",
    normalBalance: null,
    isAnalytic: false,
    active: true,
  },
]

export const ACCOUNT_ROWS: AccountRow[] = RAW.map((r, i) => ({
  ...r,
  accountId: uuid(6000 + i),
}))
