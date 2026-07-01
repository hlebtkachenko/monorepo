import type { LineRow } from "./line-items"

/**
 * Mock single-record data for the #425 demo. The record is an issued invoice
 * shown as an ABRA-style record workspace: three side-by-side panels (Document /
 * Party / Amounts), each with its own local tab strip, above a full-width
 * editable line-items grid. Totals (status bar + the right panel's VAT recap
 * table) derive live from the editable rows.
 */

/** cs-CZ number with plain-space thousands separators (no narrow no-break). */
export const formatNum = (n: number) =>
  n.toLocaleString("cs-CZ").replace(/[  ]/g, " ")

export interface LedgerTotals {
  base: number
  vat: number
  total: number
}

/** Sum a set of lines into base / VAT / total — the status bar reads this. */
export const ledgerTotals = (lines: LineRow[]): LedgerTotals => ({
  base: lines.reduce((s, l) => s + l.base, 0),
  vat: lines.reduce((s, l) => s + (l.total - l.base), 0),
  total: lines.reduce((s, l) => s + l.total, 0),
})

/** One VAT-rate row of the recap table (base / VAT / total incl. VAT). */
export interface VatRecapRow {
  rate: string
  base: number
  vat: number
  total: number
}

/**
 * Group the live line-items into a per-rate VAT recap — one row per rate in
 * `VAT_RATE_OPTIONS` (always shown, even at zero) so the right panel's recap
 * table is stable while the grid is edited.
 */
export const vatRecap = (lines: LineRow[]): VatRecapRow[] =>
  VAT_RATE_OPTIONS.map(({ value }) => {
    const forRate = lines.filter((l) => l.vatRate === value)
    const base = forRate.reduce((s, l) => s + l.base, 0)
    const total = forRate.reduce((s, l) => s + l.total, 0)
    return { rate: value, base, vat: total - base, total }
  })

/**
 * Derive a line's `base` + `total` from its editable inputs (qty · unit price ·
 * VAT rate). The editable grid stores whatever the user types; every change runs
 * back through here so base/total always reconcile with the recap + status bar
 * (values coerced defensively — a cleared cell reads as 0, not NaN).
 */
export const recomputeLine = (line: LineRow): LineRow => {
  const qty = Number(line.qty) || 0
  const unitPrice = Number(line.unitPrice) || 0
  // `vatRate` stays a string so it matches the select cell's option values
  // (`"21"` etc.); only its numeric value feeds the total.
  const rate = Number(line.vatRate) || 0
  const base = Math.round(qty * unitPrice)
  const total = Math.round(base * (1 + rate / 100))
  return { ...line, qty, unitPrice, base, total }
}

/** Editable-grid option lists — real select cells, not free text. */
export const WAREHOUSE_OPTIONS = [
  { value: "MAIN", label: "MAIN" },
  { value: "COLD", label: "COLD" },
  { value: "DRY", label: "DRY" },
]

export const UNIT_OPTIONS = [
  { value: "kg", label: "kg" },
  { value: "l", label: "l" },
  { value: "pc", label: "pc" },
  { value: "h", label: "h" },
]

export const VAT_RATE_OPTIONS = [
  { value: "21", label: "21 %" },
  { value: "12", label: "12 %" },
  { value: "0", label: "0 %" },
]

export const LINE_ITEMS: LineRow[] = [
  {
    id: "l1",
    code: "ARABICA",
    warehouse: "MAIN",
    name: "Arabica 100%",
    qty: 2,
    unit: "kg",
    unitPrice: 300,
    base: 600,
    vatRate: "21",
    total: 726,
  },
  {
    id: "l2",
    code: "BAILEYS",
    warehouse: "MAIN",
    name: "Baileys coffee",
    qty: 3,
    unit: "kg",
    unitPrice: 300,
    base: 900,
    vatRate: "21",
    total: 1089,
  },
  {
    id: "l3",
    code: "MILK",
    warehouse: "COLD",
    name: "Milk 1.5%",
    qty: 10,
    unit: "l",
    unitPrice: 25,
    base: 250,
    vatRate: "12",
    total: 280,
  },
  {
    id: "l4",
    code: "CUP",
    warehouse: "MAIN",
    name: "Paper cup 0.3l",
    qty: 50,
    unit: "pc",
    unitPrice: 8,
    base: 400,
    vatRate: "0",
    total: 400,
  },
]

/** Companies the party Combobox searches over. */
export const COMPANIES = [
  "Alza.cz a.s.",
  "Acme s.r.o.",
  "O2 Czech Republic a.s.",
  "Kofola ČeskoSlovensko a.s.",
]

/** Contact people the Combobox fields search over. */
export const CONTACTS = [
  "Jana Nováková",
  "Petr Svoboda",
  "Lucie Marková",
  "Tomáš Dvořák",
]
