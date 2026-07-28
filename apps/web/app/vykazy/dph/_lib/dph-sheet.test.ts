import { describe, expect, it } from "vitest"

import { indexDenikByDoklad, parseDphSheet } from "./dph-sheet"
import type { Cell, DenikRow, WorkbookSheets } from "../../_lib/denik"

function denikRow(over: Partial<DenikRow> = {}): DenikRow {
  return {
    datum: "15.06.2026",
    tpUD: "",
    zdroj: "Vydané faktury",
    cislo: "001",
    text: "",
    md: "311000",
    dal: "602001",
    castka: 100000,
    ...over,
  }
}

/** An issued invoice: 311 MD / 602 DAL base + 343 DAL daň. */
function issuedInvoice(cislo: string, base: number, dan: number): DenikRow[] {
  return [
    denikRow({ cislo, md: "311000", dal: "602001", castka: base }),
    denikRow({ cislo, md: "311000", dal: "343001", castka: dan }),
  ]
}

/** A received invoice: 501 MD base + 343 MD daň, both against 321 DAL. */
function receivedInvoice(cislo: string, base: number, dan: number): DenikRow[] {
  return [
    denikRow({ zdroj: "Přijaté faktury", cislo, md: "501000", dal: "321000", castka: base }), // prettier-ignore
    denikRow({ zdroj: "Přijaté faktury", cislo, md: "343002", dal: "321000", castka: dan }), // prettier-ignore
  ]
}

function sheet(rows: Cell[][]): WorkbookSheets {
  return { grids: new Map([["DPH", rows]]), names: ["DPH"] }
}

const HEADER: Cell[] = [
  "Zdroj",
  "Číslo",
  "DIČ",
  "DPPD",
  "Ev. číslo dodavatele",
  "Řádek",
  "Sazba",
  "Základ",
  "KH sekce",
  "SH kód",
]

describe("indexDenikByDoklad", () => {
  it("reads the base from the side opposite the daň, not every non-343 leg", () => {
    // 311 MD 121 000 / 602 DAL 100 000 / 343 DAL 21 000. Counting every non-343
    // leg would add the 311 receivable to the 602 revenue and report 221 000.
    const index = indexDenikByDoklad(issuedInvoice("001", 100000, 21000))
    const doklad = index.get("vydané faktury|001")
    expect(doklad?.zaklad.toString()).toBe("100000")
    expect(doklad?.dan.toString()).toBe("21000")
  })

  it("handles the received side, where the daň sits on MD", () => {
    const index = indexDenikByDoklad(receivedInvoice("FP001", 50000, 10500))
    const doklad = index.get("přijaté faktury|fp001")
    expect(doklad?.zaklad.toString()).toBe("50000")
    expect(doklad?.dan.toString()).toBe("10500")
  })

  it("keeps FV 001 and FP 001 apart", () => {
    const index = indexDenikByDoklad([
      ...issuedInvoice("001", 100000, 21000),
      ...receivedInvoice("001", 50000, 10500),
    ])
    expect(index.get("vydané faktury|001")?.zaklad.toString()).toBe("100000")
    expect(index.get("přijaté faktury|001")?.zaklad.toString()).toBe("50000")
  })

  it("ignores a 343↔343 leg, which moves daň without creating any", () => {
    const index = indexDenikByDoklad([
      ...issuedInvoice("001", 100000, 21000),
      denikRow({ cislo: "001", md: "343999", dal: "343001", castka: 21000 }),
    ])
    expect(index.get("vydané faktury|001")?.dan.toString()).toBe("21000")
  })
})

describe("parseDphSheet", () => {
  it("reports no sheet without treating it as an error", () => {
    const result = parseDphSheet({ grids: new Map(), names: [] }, [])
    expect(result.found).toBe(false)
    expect(result.issues).toEqual([])
  })

  it("inherits základ and daň from the deník when the columns are blank", () => {
    const result = parseDphSheet(
      sheet([
        HEADER,
        ["Vydané faktury", "001", "CZ99999999", "15.06.2026", "", "1", "21", "", "A4", ""], // prettier-ignore
      ]),
      issuedInvoice("001", 100000, 21000),
    )
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]?.zaklad).toBe("100000")
    expect(result.rows[0]?.dan).toBe("21000")
    expect(result.issues.filter((i) => i.severity === "error")).toEqual([])
  })

  it("warns when a typed základ disagrees with the books", () => {
    const result = parseDphSheet(
      sheet([
        HEADER,
        ["Vydané faktury", "001", "CZ99999999", "15.06.2026", "", "1", "21", "90000", "A4", ""], // prettier-ignore
      ]),
      issuedInvoice("001", 100000, 21000),
    )
    expect(result.rows[0]?.zaklad).toBe("90000")
    expect(result.issues.some((i) => i.message.includes("nesouhlasí se zaúčtováním"))).toBe(true) // prettier-ignore
  })

  it("errors when the evidence names a doklad the deník does not have", () => {
    const result = parseDphSheet(
      sheet([
        HEADER,
        ["Vydané faktury", "999", "CZ99999999", "15.06.2026", "", "1", "21", "1000", "A4", ""], // prettier-ignore
      ]),
      issuedInvoice("001", 100000, 21000),
    )
    expect(result.issues.some((i) => i.severity === "error" && i.message.includes("není v deníku"))).toBe(true) // prettier-ignore
  })

  it("errors when the deník books daň for a doklad the evidence omits", () => {
    const result = parseDphSheet(
      sheet([HEADER]),
      issuedInvoice("001", 100000, 21000),
    )
    expect(result.issues.some((i) => i.severity === "error" && i.message.includes("v evidenci DPH chybí"))).toBe(true) // prettier-ignore
  })

  it("proposes a DIČ from the deník IČ and says so", () => {
    const result = parseDphSheet(
      sheet([
        HEADER,
        [
          "Vydané faktury",
          "001",
          "",
          "15.06.2026",
          "",
          "1",
          "21",
          "",
          "A4",
          "",
        ],
      ]),
      issuedInvoice("001", 100000, 21000).map((r) => ({
        ...r,
        ic: "27074358",
        firma: "Odběratel s.r.o.",
      })),
    )
    expect(result.rows[0]?.dic).toBe("CZ27074358")
    expect(result.rows[0]?.nazev).toBe("Odběratel s.r.o.")
    expect(result.issues.some((i) => i.message.includes("Ověřte"))).toBe(true)
  })

  it("routes ř.40 to the vstup side and ř.1 to výstup", () => {
    const result = parseDphSheet(
      sheet([
        HEADER,
        ["Vydané faktury", "001", "CZ99999999", "15.06.2026", "", "1", "21", "", "A4", ""], // prettier-ignore
        ["Přijaté faktury", "FP001", "CZ88888888", "20.06.2026", "F-9", "40", "21", "", "B2", ""], // prettier-ignore
      ]),
      [...issuedInvoice("001", 100000, 21000), ...receivedInvoice("FP001", 50000, 10500)], // prettier-ignore
    )
    expect(result.rows.find((r) => r.radek === "1")?.smer).toBe("vystup")
    expect(result.rows.find((r) => r.radek === "40")?.smer).toBe("vstup")
  })

  it("keeps the supplier's own evidenční číslo when given, else falls back to the doklad", () => {
    const result = parseDphSheet(
      sheet([
        HEADER,
        ["Přijaté faktury", "FP001", "CZ88888888", "20.06.2026", "2026/447", "40", "21", "", "B2", ""], // prettier-ignore
      ]),
      receivedInvoice("FP001", 50000, 10500),
    )
    expect(result.rows[0]?.evc).toBe("2026/447")
  })

  it("converts an Excel date serial to the EPO day format", () => {
    const result = parseDphSheet(
      sheet([
        HEADER,
        ["Vydané faktury", "001", "CZ99999999", 46188, "", "1", "21", "", "A4", ""], // prettier-ignore
      ]),
      issuedInvoice("001", 100000, 21000),
    )
    expect(result.rows[0]?.dppd).toBe("15.6.2026")
  })

  it("rejects a sheet missing a required column", () => {
    const result = parseDphSheet(sheet([["Zdroj", "Číslo"]]), [])
    expect(result.headerOk).toBe(false)
    expect(result.missingHeaders).toContain("Řádek")
  })
})
