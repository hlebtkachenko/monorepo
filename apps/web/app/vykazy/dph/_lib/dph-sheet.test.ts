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

function sheet(rows: Cell[][], date1904 = false): WorkbookSheets {
  return {
    grids: new Map([["DPH", rows]]),
    names: ["DPH"],
    ok: true,
    date1904,
  }
}

const NO_SHEETS: WorkbookSheets = {
  grids: new Map(),
  names: [],
  ok: true,
  date1904: false,
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
    const doklad = index.get("vydane faktury|001")
    expect(doklad?.zaklad.toString()).toBe("100000")
    expect(doklad?.dan.toString()).toBe("21000")
  })

  it("handles the received side, where the daň sits on MD", () => {
    const index = indexDenikByDoklad(receivedInvoice("FP001", 50000, 10500))
    const doklad = index.get("prijate faktury|fp001")
    expect(doklad?.zaklad.toString()).toBe("50000")
    expect(doklad?.dan.toString()).toBe("10500")
  })

  it("keeps FV 001 and FP 001 apart", () => {
    const index = indexDenikByDoklad([
      ...issuedInvoice("001", 100000, 21000),
      ...receivedInvoice("001", 50000, 10500),
    ])
    expect(index.get("vydane faktury|001")?.zaklad.toString()).toBe("100000")
    expect(index.get("prijate faktury|001")?.zaklad.toString()).toBe("50000")
  })

  it("ignores a 343↔343 leg, which moves daň without creating any", () => {
    const index = indexDenikByDoklad([
      ...issuedInvoice("001", 100000, 21000),
      denikRow({ cislo: "001", md: "343999", dal: "343001", castka: 21000 }),
    ])
    expect(index.get("vydane faktury|001")?.dan.toString()).toBe("21000")
  })
})

describe("parseDphSheet", () => {
  it("reports no sheet without treating it as an error", () => {
    const result = parseDphSheet(NO_SHEETS, [])
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

  // A doklad with no 343 leg at all — osvobozené plnění § 64/§ 66, the PDP
  // dodavatel side, ř.20/21/22/25. Both derived totals are zero, so the old
  // "zaklad.isZero() && !dan.isZero()" guard could never fire and the row was
  // filed as a zero with every kontrolní vazba green.
  it("errors instead of filing a zero when the base cannot be derived", () => {
    const result = parseDphSheet(
      sheet([
        HEADER,
        ["Vydané faktury", "V1", "SK1234567890", "15.06.2026", "", "20", "", "", "", "0"], // prettier-ignore
      ]),
      [denikRow({ cislo: "V1", md: "311000", dal: "604001", castka: 500000 })],
    )
    expect(result.rows[0]?.zaklad).toBe("")
    expect(result.issues.some((i) => i.severity === "error" && i.message.includes("odvodit nedá"))).toBe(true) // prettier-ignore
  })

  it("does not let a doklad listed twice inherit the full total twice", () => {
    const result = parseDphSheet(
      sheet([
        HEADER,
        ["Vydané faktury", "001", "CZ99999999", "15.06.2026", "", "1", "21", "", "A4", ""], // prettier-ignore
        ["Vydané faktury", "001", "CZ99999999", "15.06.2026", "", "2", "12", "", "A4", ""], // prettier-ignore
      ]),
      issuedInvoice("001", 100000, 21000),
    )
    // NEITHER row inherits. The first used to take the whole doklad's total, so
    // typing the second row's base — exactly what the message asks for —
    // overstated the filing by that amount with every check green.
    expect(result.rows[0]?.zaklad).toBe("")
    expect(result.rows[1]?.zaklad).toBe("")
    expect(result.issues.some((i) => i.severity === "error" && i.message.includes("vícekrát"))).toBe(true) // prettier-ignore
  })

  // Excel stores a percentage-formatted cell as the fraction. Stripping
  // non-digits turned 0.21 into "021", missed an === "21" test, fell through to
  // sazba 0, and the doklad vanished from the kontrolní hlášení while the
  // přiznání kept it — the exact mismatch EPO issues a výzva for.
  it("reads a percentage-formatted sazba cell", () => {
    const result = parseDphSheet(
      sheet([
        HEADER,
        ["Vydané faktury", "001", "CZ99999999", "15.06.2026", "", "1", 0.21, "", "A4", ""], // prettier-ignore
      ]),
      issuedInvoice("001", 100000, 21000),
    )
    expect(result.rows[0]?.sazba).toBe(21)
  })

  // 19 %, not 15 %: the retired 15 % and 10 % are statutory rates that a pre-2024
  // oprava still carries, so they must NOT be rejected.
  it("drops a row whose sazba is not a statutory rate, loudly", () => {
    const result = parseDphSheet(
      sheet([
        HEADER,
        ["Vydané faktury", "001", "CZ99999999", "15.06.2026", "", "1", "19", "", "A4", ""], // prettier-ignore
      ]),
      issuedInvoice("001", 100000, 21000),
    )
    expect(result.rows).toHaveLength(0)
    expect(result.issues.some((i) => i.severity === "error" && i.message.includes("sazba"))).toBe(true) // prettier-ignore
  })

  it("matches a doklad Excel stripped the leading zeros from, and says so", () => {
    const result = parseDphSheet(
      sheet([
        HEADER,
        ["Vydané faktury", 1, "CZ99999999", "15.06.2026", "", "1", "21", "", "A4", ""], // prettier-ignore
      ]),
      issuedInvoice("001", 100000, 21000),
    )
    expect(result.rows[0]?.zaklad).toBe("100000")
    expect(result.issues.some((i) => i.message.includes("vodicí nuly"))).toBe(true) // prettier-ignore
  })

  it("folds diacritics and doubled spaces in the Zdroj half of the key", () => {
    const result = parseDphSheet(
      sheet([
        HEADER,
        ["prijate  faktury", "FP001", "CZ88888888", "20.06.2026", "F-9", "40", "21", "", "B2", ""], // prettier-ignore
      ]),
      receivedInvoice("FP001", 50000, 10500),
    )
    expect(result.rows[0]?.zaklad).toBe("50000")
  })

  it("rejects an unknown řádek and an unknown KH sekce", () => {
    const result = parseDphSheet(
      sheet([
        HEADER,
        ["Vydané faktury", "001", "CZ99999999", "15.06.2026", "", "01", "21", "", "A4", ""], // prettier-ignore
        ["Vydané faktury", "002", "CZ99999999", "15.06.2026", "", "1", "21", "", "X9", ""], // prettier-ignore
      ]),
      issuedInvoice("001", 100000, 21000),
    )
    expect(result.rows).toHaveLength(0)
    expect(result.issues.some((i) => i.message.includes("není řádek přiznání"))).toBe(true) // prettier-ignore
  })

  it("normalizes a KH sekce written with trailing dots", () => {
    const result = parseDphSheet(
      sheet([
        HEADER,
        ["Vydané faktury", "001", "CZ99999999", "15.06.2026", "", "1", "21", "", "A.4.", ""], // prettier-ignore
      ]),
      issuedInvoice("001", 100000, 21000),
    )
    expect(result.rows[0]?.khSekce).toBe("A4")
  })

  it("shifts an Excel serial by 1462 days in a 1904-system workbook", () => {
    const result = parseDphSheet(
      sheet(
        [
          HEADER,
          ["Vydané faktury", "001", "CZ99999999", 46188, "", "1", "21", "", "A4", ""], // prettier-ignore
        ],
        true,
      ),
      issuedInvoice("001", 100000, 21000),
    )
    expect(result.rows[0]?.dppd).toBe("16.6.2030")
  })

  it("demands the supplier's own evidenční číslo for a B.2 row", () => {
    const noEvc: Cell[] = [
      "Zdroj",
      "Číslo",
      "DIČ",
      "DPPD",
      "Řádek",
      "Sazba",
      "KH sekce",
    ]
    const result = parseDphSheet(
      sheet([
        noEvc,
        ["Přijaté faktury", "FP001", "CZ88888888", "20.06.2026", "40", "21", "B2"], // prettier-ignore
      ]),
      receivedInvoice("FP001", 50000, 10500),
    )
    expect(result.issues.some((i) => i.severity === "error" && i.message.includes("Ev. číslo dodavatele"))).toBe(true) // prettier-ignore
  })
})

describe("doklad identity in messages", () => {
  it("reports the deník's own spelling, not the folded join key", () => {
    const result = parseDphSheet(
      sheet([HEADER]),
      issuedInvoice("A|B/001", 100000, 21000),
    )
    // A číslo carrying a "|" must survive intact: the join key folds case and
    // joins its two halves with "|", so rebuilding the label out of that key
    // both lower-cased the doklad and split it at the wrong place.
    expect(result.issues.some((i) => i.message.includes("Vydané faktury A|B/001"))).toBe(true) // prettier-ignore
  })
})

describe("dobropis", () => {
  // Two conventions exist and nothing in ČÚS or vyhláška 500/2002 Sb. mandates
  // either. A NEGATIVE částka on the original accounts needs nothing special.
  // The swapped-sides form is a different matter: it is indistinguishable from
  // an ordinary refakturace, so the shape is detected but the SIGN is refused.
  it("carries a negative-amount dobropis straight through", () => {
    const index = indexDenikByDoklad([
      denikRow({ cislo: "D1", md: "311000", dal: "602001", castka: -10000 }),
      denikRow({ cislo: "D1", md: "311000", dal: "343001", castka: -2100 }),
    ])
    const d = index.get("vydane faktury|d1")
    expect(d?.zaklad.toString()).toBe("-10000")
    expect(d?.dan.toString()).toBe("-2100")
    expect(d?.signAmbiguous).toBe(false)
  })

  // The reason the sign is never guessed. A refakturace of a cost books
  // 311 MD / 518 DAL + 311 MD / 343 DAL — an ordinary ISSUED invoice — and a
  // received dobropis booked by swapping books 321 MD / 501 DAL + 321 MD /
  // 343 DAL. Same account classes; only the settlement account differs, and that
  // varies by chart of accounts. Negating on this signal turned a routine
  // refakturace into −100 000 / −21 000 on ř.1, XSD-valid and vazby green.
  it("refuses to derive a sign when the sides are the other way round", () => {
    const refakturace = indexDenikByDoklad([
      denikRow({ cislo: "R1", md: "311000", dal: "518000", castka: 100000 }),
      denikRow({ cislo: "R1", md: "311000", dal: "343001", castka: 21000 }),
    ])
    const r = refakturace.get("vydane faktury|r1")
    expect(r?.signAmbiguous).toBe(true)
    // NOT negated — the amount is reported as booked, and the row must be typed.
    expect(r?.zaklad.toString()).toBe("100000")

    const dobropis = indexDenikByDoklad([
      denikRow({ zdroj: "Přijaté faktury", cislo: "D3", md: "321000", dal: "501000", castka: 5000 }), // prettier-ignore
      denikRow({ zdroj: "Přijaté faktury", cislo: "D3", md: "321000", dal: "343002", castka: 1050 }), // prettier-ignore
    ])
    expect(dobropis.get("prijate faktury|d3")?.signAmbiguous).toBe(true)
  })

  it("does not flag an ordinary invoice", () => {
    expect(indexDenikByDoklad(issuedInvoice("001", 100000, 21000)).get("vydane faktury|001")?.signAmbiguous).toBe(false) // prettier-ignore
    expect(indexDenikByDoklad(receivedInvoice("FP1", 50000, 10500)).get("prijate faktury|fp1")?.signAmbiguous).toBe(false) // prettier-ignore
  })

  it("blocks the row instead of inheriting a guessed sign", () => {
    const result = parseDphSheet(
      sheet([
        HEADER,
        ["Vydané faktury", "R1", "CZ99999999", "15.06.2026", "", "1", "21", "", "A4", ""], // prettier-ignore
      ]),
      [
        denikRow({ cislo: "R1", md: "311000", dal: "518000", castka: 100000 }),
        denikRow({ cislo: "R1", md: "311000", dal: "343001", castka: 21000 }),
      ],
    )
    // Nothing inherited, and an ERROR so the download stays blocked until the
    // filer types the signed amounts.
    expect(result.rows[0]?.zaklad).toBe("")
    expect(result.issues.some((i) => i.severity === "error" && i.message.includes("prohozenými stranami"))).toBe(true) // prettier-ignore
  })
})

describe("retired rates on the sheet", () => {
  it.each([15, 10] as const)("accepts %i %% for a pre-2024 oprava", (rate) => {
    const result = parseDphSheet(
      sheet([
        HEADER,
        ["Vydané faktury", "001", "CZ99999999", "15.06.2023", "", "2", String(rate), "", "A4", ""], // prettier-ignore
      ]),
      issuedInvoice("001", 100000, 21000),
    )
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]?.sazba).toBe(rate)
  })
})
