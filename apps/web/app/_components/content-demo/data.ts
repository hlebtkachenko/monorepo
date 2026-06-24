/**
 * TEMP preview data for the Content Panel build. Mock "Faktury přijaté" rows so
 * the header tabs / toolbar / status bar / action bar can be wired against a
 * real table. NOT the domain model — `castka` / `dph` are plain display numbers
 * here, NOT the `Money<Currency>` type the real ledger uses.
 */

export type FakturaKind = "zalohova" | "danovy-doklad" | "dobropis" | "zapocet"

export type FakturaStav = "Nová" | "Ke schválení" | "Schváleno" | "Zaúčtováno"

export interface FakturaRow {
  id: string
  doklad: string
  partner: string
  /** Mock display amount in CZK (not the domain Money type). */
  castka: number
  /** Mock display VAT amount in CZK. */
  dph: number
  /** ISO date — sorted/formatted in the cell. */
  datum: string
  stav: FakturaStav
  kind: FakturaKind
  /** Mock "needs matching to a bank line" flag, for the status-bar summary. */
  keSparovani: boolean
}

/** Tab → kind. The "vse" tab shows every row. */
export const FAKTURY_TABS: {
  value: string
  label: string
  kind?: FakturaKind
}[] = [
  { value: "vse", label: "Všechny" },
  { value: "zalohove", label: "Zálohové", kind: "zalohova" },
  { value: "danove", label: "Daňové doklady", kind: "danovy-doklad" },
  { value: "dobropisy", label: "Dobropisy", kind: "dobropis" },
  { value: "zapocty", label: "Zápočty", kind: "zapocet" },
]

export const FAKTURY_STAV_OPTIONS: { value: FakturaStav; label: string }[] = [
  { value: "Nová", label: "Nová" },
  { value: "Ke schválení", label: "Ke schválení" },
  { value: "Schváleno", label: "Schváleno" },
  { value: "Zaúčtováno", label: "Zaúčtováno" },
]

export const FAKTURY_ROWS: FakturaRow[] = [
  {
    id: "1",
    doklad: "FP-2026-0001",
    partner: "Alza.cz a.s.",
    castka: 12400,
    dph: 2152,
    datum: "2026-06-01",
    stav: "Zaúčtováno",
    kind: "danovy-doklad",
    keSparovani: false,
  },
  {
    id: "2",
    doklad: "FP-2026-0002",
    partner: "ČEZ Prodej s.r.o.",
    castka: 8650,
    dph: 1502,
    datum: "2026-06-03",
    stav: "Schváleno",
    kind: "danovy-doklad",
    keSparovani: true,
  },
  {
    id: "3",
    doklad: "ZAL-2026-0007",
    partner: "O2 Czech Republic",
    castka: 3000,
    dph: 0,
    datum: "2026-06-04",
    stav: "Ke schválení",
    kind: "zalohova",
    keSparovani: true,
  },
  {
    id: "4",
    doklad: "FP-2026-0003",
    partner: "Google Cloud EMEA",
    castka: 21980,
    dph: 0,
    datum: "2026-06-05",
    stav: "Nová",
    kind: "danovy-doklad",
    keSparovani: true,
  },
  {
    id: "5",
    doklad: "DOB-2026-0002",
    partner: "Alza.cz a.s.",
    castka: -1240,
    dph: -215,
    datum: "2026-06-06",
    stav: "Schváleno",
    kind: "dobropis",
    keSparovani: false,
  },
  {
    id: "6",
    doklad: "FP-2026-0004",
    partner: "Seznam.cz a.s.",
    castka: 5400,
    dph: 937,
    datum: "2026-06-08",
    stav: "Zaúčtováno",
    kind: "danovy-doklad",
    keSparovani: false,
  },
  {
    id: "7",
    doklad: "ZAP-2026-0001",
    partner: "Henderson Profese s.r.o.",
    castka: 9900,
    dph: 0,
    datum: "2026-06-09",
    stav: "Ke schválení",
    kind: "zapocet",
    keSparovani: false,
  },
  {
    id: "8",
    doklad: "ZAL-2026-0008",
    partner: "Rohlik.cz",
    castka: 1500,
    dph: 0,
    datum: "2026-06-10",
    stav: "Nová",
    kind: "zalohova",
    keSparovani: true,
  },
  {
    id: "9",
    doklad: "FP-2026-0005",
    partner: "Microsoft Ireland",
    castka: 33150,
    dph: 0,
    datum: "2026-06-11",
    stav: "Schváleno",
    kind: "danovy-doklad",
    keSparovani: false,
  },
  {
    id: "10",
    doklad: "DOB-2026-0003",
    partner: "Seznam.cz a.s.",
    castka: -540,
    dph: -94,
    datum: "2026-06-12",
    stav: "Nová",
    kind: "dobropis",
    keSparovani: true,
  },
  {
    id: "11",
    doklad: "FP-2026-0006",
    partner: "Kofola ČeskoSlovensko",
    castka: 7250,
    dph: 1259,
    datum: "2026-06-13",
    stav: "Zaúčtováno",
    kind: "danovy-doklad",
    keSparovani: false,
  },
  {
    id: "12",
    doklad: "ZAP-2026-0002",
    partner: "Notino s.r.o.",
    castka: 4300,
    dph: 0,
    datum: "2026-06-15",
    stav: "Ke schválení",
    kind: "zapocet",
    keSparovani: false,
  },
]

const czk = new Intl.NumberFormat("cs-CZ", {
  style: "currency",
  currency: "CZK",
  maximumFractionDigits: 0,
})

export function formatCzk(amount: number): string {
  return czk.format(amount)
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium" }).format(
    new Date(iso),
  )
}
