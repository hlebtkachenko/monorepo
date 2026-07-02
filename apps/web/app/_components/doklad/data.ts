import type { LineRow } from "./line-items"

/**
 * Mock single-record data for the doklad (invoice/document) editor. The record
 * is a Czech received invoice (faktura přijatá) shown as an ABRA-style record
 * workspace: three side-by-side panels (Document / Party / Amounts), each with
 * its own local tab strip, above a full-width editable line-items grid. Totals
 * (status bar + the Amounts panel's VAT recap table) derive live from the
 * editable rows.
 *
 * Money is transported as decimal STRINGS (e.g. "12100.00"), never JS numbers —
 * this mirrors the domain `Decimal` transport. The editable grid works in JS
 * numbers (see `LineRow`); `linesToRows` / `rowsToTotals` bridge the two, and
 * display goes through the `../_shared/accounting-format` formatters.
 *
 * TODO(epic4-wire): capture/post SDK call — replace this fixture with the
 * generated SDK read (GET doklad) + write (POST/PATCH doklad) once the API
 * document endpoints are live.
 */

/** Domain money transport: a decimal string (e.g. "12100.00"), never a number. */
export type Decimal = string

/** Header of the doklad — number, party, dates, symbols, currency. */
export interface DokladHeader {
  /** Document number (číslo dokladu). */
  number: string
  /** Variable symbol for the payment (variabilní symbol). */
  variableSymbol: string
  /** ISO issue date (datum vystavení). */
  issueDate: string
  /** ISO due date (datum splatnosti). */
  dueDate: string
  /** ISO tax-point date — DUZP (datum uskutečnění zdanitelného plnění). */
  taxPointDate: string
  /** ISO currency code (Kč default). */
  currency: string
}

/** The trading partner (dodavatel — supplier on a received invoice). */
export interface DokladParty {
  name: string
  street: string
  zip: string
  city: string
  country: string
  /** IČO — company registration number. */
  ico: string
  /** DIČ — VAT identification number. */
  dic: string
}

/**
 * One doklad line as stored in the fixture — all money as decimal strings. The
 * editable grid coerces these to numbers via `linesToRows`; `base`, `vat`, and
 * `total` re-derive from qty · unit price · VAT rate (see `recomputeLine`).
 */
export interface DokladLine {
  id: string
  code: string
  warehouse: string
  name: string
  qty: number
  unit: string
  /** Unit price, decimal string. */
  unitPrice: Decimal
  /** Tax base (základ daně), decimal string — derived. */
  base: Decimal
  /** VAT amount (DPH), decimal string — derived. */
  vat: Decimal
  /** Total incl. VAT, decimal string — derived. */
  total: Decimal
  /** VAT rate as a string so it matches the select cell's option values. */
  vatRate: string
}

/** One VAT-rate row of the recap table (base / VAT / total incl. VAT). */
export interface VatRecapRow {
  rate: string
  base: Decimal
  vat: Decimal
  total: Decimal
}

/** Base / VAT / total for the whole document. */
export interface DokladTotals {
  base: Decimal
  vat: Decimal
  total: Decimal
}

/* -------------------------------------------------------------------------- */
/* Editable-grid option lists — real select cells, not free text.             */
/* -------------------------------------------------------------------------- */

export const WAREHOUSE_OPTIONS = [
  { value: "MAIN", label: "MAIN" },
  { value: "COLD", label: "COLD" },
  { value: "DRY", label: "DRY" },
]

export const UNIT_OPTIONS = [
  { value: "kg", label: "kg" },
  { value: "l", label: "l" },
  { value: "pc", label: "ks" },
  { value: "h", label: "hod" },
]

/** Czech statutory VAT rates: 21 % základní, 12 % snížená, 0 % / osvobozeno. */
export const VAT_RATE_OPTIONS = [
  { value: "21", label: "21 %" },
  { value: "12", label: "12 %" },
  { value: "0", label: "0 %" },
]

/** Companies the party Combobox searches over. */
export const COMPANIES = [
  "Kávová Zásoba s.r.o.",
  "Alza.cz a.s.",
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

/* -------------------------------------------------------------------------- */
/* The fixture — a realistic Czech received invoice (faktura přijatá).         */
/* -------------------------------------------------------------------------- */

export const DOKLAD_HEADER: DokladHeader = {
  number: "FP2025/0042",
  variableSymbol: "2025000042",
  issueDate: "2025-06-12",
  dueDate: "2025-06-26",
  taxPointDate: "2025-06-12",
  currency: "CZK",
}

export const DOKLAD_PARTY: DokladParty = {
  name: "Kávová Zásoba s.r.o.",
  street: "Vodičkova 700/32",
  zip: "110 00",
  city: "Praha 1",
  country: "CZ",
  ico: "27604321",
  dic: "CZ27604321",
}

/**
 * Fixture line items — money as decimal strings. `base`/`vat`/`total` are
 * pre-derived here to match `recomputeLine`, so the initial render reconciles
 * with the recap + status bar before any edit.
 */
export const DOKLAD_LINES: DokladLine[] = [
  {
    id: "l1",
    code: "ARABICA",
    warehouse: "MAIN",
    name: "Arabica 100% pražená",
    qty: 20,
    unit: "kg",
    unitPrice: "480.00",
    base: "9600.00",
    vat: "2016.00",
    total: "11616.00",
    vatRate: "21",
  },
  {
    id: "l2",
    code: "ROBUSTA",
    warehouse: "MAIN",
    name: "Robusta směs",
    qty: 15,
    unit: "kg",
    unitPrice: "360.00",
    base: "5400.00",
    vat: "1134.00",
    total: "6534.00",
    vatRate: "21",
  },
  {
    id: "l3",
    code: "MILK",
    warehouse: "COLD",
    name: "Mléko trvanlivé 1,5%",
    qty: 120,
    unit: "l",
    unitPrice: "24.50",
    base: "2940.00",
    vat: "352.80",
    total: "3292.80",
    vatRate: "12",
  },
  {
    id: "l4",
    code: "CUP",
    warehouse: "MAIN",
    name: "Papírový kelímek 0,3 l",
    qty: 500,
    unit: "pc",
    unitPrice: "3.20",
    base: "1600.00",
    vat: "336.00",
    total: "1936.00",
    vatRate: "21",
  },
]

/* -------------------------------------------------------------------------- */
/* Money helpers — parse decimal strings, format back to fixed-2 strings.      */
/* -------------------------------------------------------------------------- */

/** Parse a decimal string to a number — arithmetic only, never for display. */
const toNumber = (value: Decimal): number => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/** Format a number back to a fixed-2 decimal string (the transport shape). */
const toDecimal = (value: number): Decimal => value.toFixed(2)

/* -------------------------------------------------------------------------- */
/* Bridge — fixture (decimal strings) ↔ editable grid rows (numbers).          */
/* -------------------------------------------------------------------------- */

/** Convert fixture lines (decimal strings) to editable grid rows (numbers). */
export const linesToRows = (lines: DokladLine[]): LineRow[] =>
  lines.map((l) => ({
    id: l.id,
    code: l.code,
    warehouse: l.warehouse,
    name: l.name,
    qty: l.qty,
    unit: l.unit,
    unitPrice: toNumber(l.unitPrice),
    base: toNumber(l.base),
    vat: toNumber(l.vat),
    total: toNumber(l.total),
    vatRate: l.vatRate,
  }))

/**
 * Derive a row's `base` / `vat` / `total` from its editable inputs (qty · unit
 * price · VAT rate). The editable grid stores whatever the user types; every
 * change runs back through here so base/vat/total always reconcile with the
 * recap + status bar (values coerced defensively — a cleared cell reads as 0).
 */
export const recomputeLine = (row: LineRow): LineRow => {
  const qty = Number(row.qty) || 0
  const unitPrice = Number(row.unitPrice) || 0
  // `vatRate` stays a string so it matches the select cell's option values.
  const rate = Number(row.vatRate) || 0
  const base = qty * unitPrice
  const vat = base * (rate / 100)
  const total = base + vat
  return { ...row, qty, unitPrice, base, vat, total }
}

/* -------------------------------------------------------------------------- */
/* Derivations — totals + per-rate VAT recap (both as decimal strings).        */
/* -------------------------------------------------------------------------- */

/** Sum a set of rows into base / VAT / total — decimal strings for display. */
export const rowsToTotals = (rows: LineRow[]): DokladTotals => ({
  base: toDecimal(rows.reduce((s, r) => s + r.base, 0)),
  vat: toDecimal(rows.reduce((s, r) => s + r.vat, 0)),
  total: toDecimal(rows.reduce((s, r) => s + r.total, 0)),
})

/**
 * Group the live rows into a per-rate VAT recap — one row per rate in
 * `VAT_RATE_OPTIONS` (always shown, even at zero) so the recap table stays
 * stable while the grid is edited. Each cell re-derives as a decimal string.
 */
export const vatRecap = (rows: LineRow[]): VatRecapRow[] =>
  VAT_RATE_OPTIONS.map(({ value }) => {
    const forRate = rows.filter((r) => r.vatRate === value)
    const base = forRate.reduce((s, r) => s + r.base, 0)
    const vat = forRate.reduce((s, r) => s + r.vat, 0)
    const total = forRate.reduce((s, r) => s + r.total, 0)
    return {
      rate: value,
      base: toDecimal(base),
      vat: toDecimal(vat),
      total: toDecimal(total),
    }
  })
