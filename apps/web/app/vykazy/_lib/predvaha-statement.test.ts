import { describe, expect, it } from "vitest"

import type { DenikRow } from "./denik"
import {
  buildPredvahaStatement,
  predvahaCsv,
  type PredvahaLine,
} from "./predvaha-statement"

/** Minimal deník row: only md / dal / castka drive the předvaha. */
function row(md: string, dal: string, castka: number): DenikRow {
  return {
    datum: "",
    tpUD: "",
    zdroj: "",
    cislo: "",
    text: "",
    md,
    dal,
    castka,
  }
}

/** A tiny balanced book:
 *  - opening balances booked against 701 (Počáteční účet rozvažný),
 *  - two turnover postings. */
const BOOK: DenikRow[] = [
  row("211001", "701000", 1000), // opening: cash 1000 on MD
  row("701000", "321000", 400), //  opening: payable 400 on Dal
  row("211001", "602000", 500), // turnover: cash sale
  row("518000", "321000", 300), // turnover: service expense on credit
]

function find(lines: PredvahaLine[], predicate: (l: PredvahaLine) => boolean) {
  const hit = lines.find(predicate)
  if (!hit) throw new Error("line not found")
  return hit
}

describe("buildPredvahaStatement", () => {
  it("is empty for no rows", () => {
    const s = buildPredvahaStatement([])
    expect(s.empty).toBe(true)
    expect(s.lines).toHaveLength(0)
    expect(s.balanced).toBe(true)
  })

  it("splits 701 postings into Počáteční stav and the rest into Obrat", () => {
    const s = buildPredvahaStatement(BOOK)
    const cash = find(s.lines, (l) => l.kind === "ucet" && l.ucet === "211001")
    // 211001: PS MD 1000 (from 701), Obrat MD 500 (sale), KS MD = 1500.
    expect(cash.totals.psMD).toBe(1000)
    expect(cash.totals.obratMD).toBe(500)
    expect(cash.totals.ksMD).toBe(1500)
    expect(cash.totals.ksDal).toBe(0)

    // Net zůstatek: debit balance is positive, credit balance negative.
    expect(cash.totals.zustatek).toBe(1500)

    const payable = find(
      s.lines,
      (l) => l.kind === "ucet" && l.ucet === "321000",
    )
    // 321000: PS Dal 400 (from 701), Obrat Dal 300, KS Dal = 700.
    expect(payable.totals.psDal).toBe(400)
    expect(payable.totals.obratDal).toBe(300)
    expect(payable.totals.ksDal).toBe(700)
    expect(payable.totals.zustatek).toBe(-700)
  })

  it("balances all three column pairs at the grand total", () => {
    const s = buildPredvahaStatement(BOOK)
    expect(s.total.psMD).toBe(1400)
    expect(s.total.psDal).toBe(1400)
    expect(s.total.obratMD).toBe(800)
    expect(s.total.obratDal).toBe(800)
    expect(s.total.ksMD).toBe(2200)
    expect(s.total.ksDal).toBe(2200)
    // A balanced book nets to a zero closing balance overall.
    expect(s.total.zustatek).toBe(0)
    expect(s.balanced).toBe(true)
  })

  it("emits SU, třída and grand subtotals plus the grand total", () => {
    const s = buildPredvahaStatement(BOOK)
    const su211 = find(
      s.lines,
      (l) => l.kind === "su" && l.label === "celkem SU 211",
    )
    expect(su211.totals.ksMD).toBe(1500)

    const trida2 = find(
      s.lines,
      (l) => l.kind === "trida" && l.label === "za třídu 2",
    )
    expect(trida2.totals.ksMD).toBe(1500)

    // Rozvahové účty = třídy 0–4 (here 211001 + 321000).
    const rozvahove = find(
      s.lines,
      (l) => l.kind === "grand" && l.label === "Rozvahové účty",
    )
    expect(rozvahove.totals.ksMD).toBe(1500)
    expect(rozvahove.totals.ksDal).toBe(700)

    // Výsledkové účty = třídy 5–6, Závěrkové = 7+.
    expect(
      s.lines.some((l) => l.kind === "grand" && l.label === "Výsledkové účty"),
    ).toBe(true)
    expect(
      s.lines.some((l) => l.kind === "grand" && l.label === "Závěrkové účty"),
    ).toBe(true)

    const celkem = find(s.lines, (l) => l.kind === "celkem")
    expect(celkem.totals.ksMD).toBe(2200)
    expect(celkem.totals.ksDal).toBe(2200)
  })
})

describe("predvahaCsv", () => {
  it("is BOM-prefixed, semicolon-delimited, comma-decimal", () => {
    const csv = predvahaCsv(buildPredvahaStatement(BOOK))
    expect(csv.startsWith("\uFEFF")).toBe(true)
    expect(csv).toContain('"Účet";"Název";"PS Má dáti"')
    expect(csv).toContain('"KS Dal";"Zůstatek"')
    expect(csv).toContain("211001")
    expect(csv).toContain('"1000,00"')
    // Credit balances export with their sign, in exact Kč (never rounded).
    expect(csv).toContain('"-700,00"')
    expect(csv).toContain("Celkový obrat účtů")
  })
})
