/**
 * The three CSV contracts, read end to end.
 *
 * The cases are grouped by what the office would have done wrong: the right
 * file (happy), the wrong file (missing columns), the right file with a typo in
 * it (row issues), and a file too big to be the one they meant. The invariant
 * under all of them is the one the module header states — a file with any issue
 * yields NO rows at all, so a partial statement can never be published.
 */
import { describe, expect, it } from "vitest"

import { CSV_MAX_ROWS, isCsvDataset, readDatasetCsv } from "./datasets"

const BOM = "﻿"

function ok(result: ReturnType<typeof readDatasetCsv>) {
  if (!result.ok) {
    throw new Error(
      `expected a readable file, got ${JSON.stringify({
        structural: result.structural,
        missingColumns: result.missingColumns,
        issues: result.issues,
      })}`,
    )
  }
  return result
}

function rejected(result: ReturnType<typeof readDatasetCsv>) {
  if (result.ok) throw new Error("expected a refusal, got a readable file")
  return result
}

describe("isCsvDataset", () => {
  it("accepts the three form- and account-keyed datasets and nothing else", () => {
    expect(isCsvDataset("predvaha")).toBe(true)
    expect(isCsvDataset("rozvaha")).toBe(true)
    expect(isCsvDataset("vzz")).toBe(true)
    // AGENT-ONLY, and for two different reasons. `saldokonto` HAS a payload
    // table (PR 28) and is still refused here: its lines name a counterparty,
    // and resolving one into a partner row runs on `external_ref` and IČO, which
    // a fixed-header CSV cannot state without guessing at identity. `payroll`
    // has no payload table yet (PR 29).
    expect(isCsvDataset("saldokonto")).toBe(false)
    expect(isCsvDataset("payroll")).toBe(false)
  })
})

describe("readDatasetCsv — obratová předvaha", () => {
  const HAPPY = [
    `${BOM}Účet;Název;Počáteční stav;Obrat MD;Obrat Dal;Konečný zůstatek`,
    "211;Pokladna;12 000,00;3 500,50;1 200,00;14 300,50",
    '311;"Odběratelé; tuzemsko";0,00;250 000,00;180 000,00;70 000,00',
    "343;DPH;;;;-18 500,00",
    "",
  ].join("\n")

  it("reads a Money-style export verbatim, as strings", () => {
    const result = ok(readDatasetCsv("predvaha", HAPPY))
    expect(result.payload.dataset).toBe("predvaha")
    expect(result.rowCount).toBe(3)

    const lines =
      result.payload.dataset === "predvaha"
        ? result.payload.trialBalanceLines
        : []
    expect(lines[0]).toEqual({
      accountCode: "211",
      accountName: "Pokladna",
      openingBalance: "12000.00",
      turnoverDebit: "3500.50",
      turnoverCredit: "1200.00",
      closingBalance: "14300.50",
    })
    expect(lines[1]!.accountName).toBe("Odběratelé; tuzemsko")
    // Blank cells are absences, never zeroes (§0.4).
    expect(lines[2]).toMatchObject({
      accountCode: "343",
      openingBalance: null,
      turnoverDebit: null,
      closingBalance: "-18500.00",
    })
  })

  it("records the delimiter and the header each field was matched by", () => {
    const result = ok(readDatasetCsv("predvaha", HAPPY))
    expect(result.mapping).toMatchObject({
      dataset: "predvaha",
      delimiter: ";",
    })
    expect(result.mapping.columns["accountCode"]).toBe("Účet")
    expect(result.mapping.columns["closingBalance"]).toBe("Konečný zůstatek")
  })

  it("accepts a comma-separated file with plain decimals", () => {
    // A comma-DELIMITED export cannot also use a comma decimal, so this is the
    // one dialect where the dot is the decimal separator — and the sniffer has
    // to pick the delimiter before that reading is even possible.
    const result = ok(
      readDatasetCsv(
        "predvaha",
        "Účet,Název,Konečný zůstatek\n221,Bankovní účty,1234.50\n",
      ),
    )
    const lines =
      result.payload.dataset === "predvaha"
        ? result.payload.trialBalanceLines
        : []
    expect(lines[0]!.closingBalance).toBe("1234.50")
  })

  it("names the missing required columns instead of guessing", () => {
    const result = rejected(
      readDatasetCsv("predvaha", "Partner;Saldo\nACME;1000\n"),
    )
    expect(result.missingColumns).toEqual(["Účet", "Název"])
    expect(result.issues).toHaveLength(0)
  })

  it("reports the line and the column of every bad amount, and imports nothing", () => {
    const result = rejected(
      readDatasetCsv(
        "predvaha",
        [
          "Účet;Název;Konečný zůstatek",
          "211;Pokladna;12 000,00",
          "311;Odběratelé;x",
          "321;Dodavatelé;1,2,3",
          "",
        ].join("\n"),
      ),
    )
    expect(result.issues).toEqual([
      { line: 3, column: "Konečný zůstatek", code: "invalid_amount" },
      { line: 4, column: "Konečný zůstatek", code: "invalid_amount" },
    ])
  })

  it("reports a blank required cell rather than importing a nameless account", () => {
    const result = rejected(
      readDatasetCsv("predvaha", "Účet;Název\n211;Pokladna\n;Bez účtu\n"),
    )
    expect(result.issues).toEqual([
      { line: 3, column: "Účet", code: "missing_value" },
    ])
  })

  it("refuses a duplicated účet — the unique index would refuse one of them", () => {
    const result = rejected(
      readDatasetCsv("predvaha", "Účet;Název\n211;Pokladna\n211;Pokladna 2\n"),
    )
    expect(result.issues).toEqual([
      { line: 3, column: "Účet", code: "duplicate_row" },
    ])
  })

  it("refuses a row with more cells than the header has columns", () => {
    // An unquoted `;` inside the name shifts every column after it.
    const result = rejected(
      readDatasetCsv(
        "predvaha",
        "Účet;Název;Konečný zůstatek\n518;Ostatní služby; drobné;100,00\n",
      ),
    )
    expect(result.issues[0]).toEqual({
      line: 2,
      column: null,
      code: "ragged_row",
    })
  })

  it("refuses a file larger than one period's worth of accounts", () => {
    const rows = Array.from(
      { length: CSV_MAX_ROWS + 1 },
      (_, i) => `${100000 + i};Účet ${i};1,00`,
    )
    const result = rejected(
      readDatasetCsv(
        "predvaha",
        ["Účet;Název;Konečný zůstatek", ...rows, ""].join("\n"),
      ),
    )
    expect(result.structural).toBe("too_many_rows")
  })

  it("passes a structural refusal through unchanged", () => {
    expect(rejected(readDatasetCsv("predvaha", "")).structural).toBe(
      "empty_file",
    )
    expect(
      rejected(readDatasetCsv("predvaha", "Účet;Název\n")).structural,
    ).toBe("no_data_rows")
    expect(
      rejected(readDatasetCsv("predvaha", 'Účet;Název\n211;"Pokladna\n'))
        .structural,
    ).toBe("unterminated_quote")
  })
})

describe("readDatasetCsv — rozvaha", () => {
  const HAPPY = [
    "Část;Ozn;Řádek;Text;Brutto;Korekce;Netto;Běžné;Minulé;Úroveň;Tučné",
    "aktiva;;001;AKTIVA CELKEM;5 000 000,00;-1 200 000,00;3 800 000,00;;3 500 000,00;0;ano",
    "aktiva;B.II.;037;Dlouhodobý hmotný majetek;4 000 000,00;-1 200 000,00;2 800 000,00;;2 600 000,00;1;",
    "pasiva;;001;PASIVA CELKEM;;;;3 800 000,00;3 500 000,00;0;ano",
    "pasiva;A.;002;Vlastní kapitál;;;;1 800 000,00;1 600 000,00;1;ano",
    "",
  ].join("\n")

  it("splits aktiva and pasiva into their own statement kinds", () => {
    const result = ok(readDatasetCsv("rozvaha", HAPPY))
    const lines =
      result.payload.dataset === "rozvaha" ? result.payload.statementLines : []

    expect(lines.map((line) => line.statementKind)).toEqual([
      "rozvaha_aktiva",
      "rozvaha_aktiva",
      "rozvaha_pasiva",
      "rozvaha_pasiva",
    ])
  })

  it("carries all four aktiva columns, negative korekce included, as strings", () => {
    const result = ok(readDatasetCsv("rozvaha", HAPPY))
    const lines =
      result.payload.dataset === "rozvaha" ? result.payload.statementLines : []

    expect(lines[0]).toMatchObject({
      ozn: null,
      rowCode: "001",
      rowLabel: "AKTIVA CELKEM",
      brutto: "5000000.00",
      korekce: "-1200000.00",
      netto: "3800000.00",
      bezne: null,
      minule: "3500000.00",
      isBold: true,
      indent: 0,
      sortOrder: 1,
    })
    expect(lines[1]).toMatchObject({ ozn: "B.II.", indent: 1, isBold: false })
  })

  it("carries the two pasiva columns and leaves the aktiva triplet null", () => {
    const result = ok(readDatasetCsv("rozvaha", HAPPY))
    const lines =
      result.payload.dataset === "rozvaha" ? result.payload.statementLines : []

    expect(lines[3]).toMatchObject({
      statementKind: "rozvaha_pasiva",
      ozn: "A.",
      bezne: "1800000.00",
      minule: "1600000.00",
      brutto: null,
      korekce: null,
      netto: null,
    })
  })

  it("keeps the file's own order as sortOrder, not the řádek number", () => {
    const result = ok(
      readDatasetCsv(
        "rozvaha",
        [
          "Část;Řádek;Text;Netto",
          "aktiva;037;Dlouhodobý hmotný majetek;100,00",
          "aktiva;001;AKTIVA CELKEM;100,00",
          "",
        ].join("\n"),
      ),
    )
    const lines =
      result.payload.dataset === "rozvaha" ? result.payload.statementLines : []
    expect(lines.map((line) => [line.rowCode, line.sortOrder])).toEqual([
      ["037", 1],
      ["001", 2],
    ])
  })

  it("refuses a row whose columns belong to the other side of the form", () => {
    const result = rejected(
      readDatasetCsv(
        "rozvaha",
        [
          "Část;Řádek;Text;Brutto;Běžné",
          "aktiva;001;AKTIVA CELKEM;100,00;100,00",
          "pasiva;001;PASIVA CELKEM;100,00;100,00",
          "",
        ].join("\n"),
      ),
    )
    expect(result.issues).toEqual([
      { line: 2, column: null, code: "column_shape" },
      { line: 3, column: null, code: "column_shape" },
    ])
  })

  it("refuses a část cell that is neither aktiva nor pasiva", () => {
    const result = rejected(
      readDatasetCsv("rozvaha", "Část;Řádek;Text\nvýsledovka;001;Cosi\n"),
    )
    expect(result.issues).toEqual([
      { line: 2, column: "Část", code: "unknown_section" },
    ])
  })

  it("refuses the same řádek twice within one side, and allows it across sides", () => {
    const both = ok(
      readDatasetCsv(
        "rozvaha",
        "Část;Řádek;Text\naktiva;001;AKTIVA CELKEM\npasiva;001;PASIVA CELKEM\n",
      ),
    )
    expect(both.rowCount).toBe(2)

    const twice = rejected(
      readDatasetCsv(
        "rozvaha",
        "Část;Řádek;Text\naktiva;001;AKTIVA CELKEM\naktiva;001;Znovu\n",
      ),
    )
    expect(twice.issues).toEqual([
      { line: 3, column: "Řádek", code: "duplicate_row" },
    ])
  })

  it("refuses an out-of-range indent instead of clamping it", () => {
    const result = rejected(
      readDatasetCsv(
        "rozvaha",
        "Část;Řádek;Text;Úroveň\naktiva;001;AKTIVA CELKEM;9\n",
      ),
    )
    expect(result.issues).toEqual([
      { line: 2, column: "Úroveň", code: "invalid_integer" },
    ])
  })

  it("names Část as missing when the file is a one-sided export", () => {
    const result = rejected(
      readDatasetCsv("rozvaha", "Ozn;Řádek;Text\nA.;001;Vlastní kapitál\n"),
    )
    expect(result.missingColumns).toEqual(["Část"])
  })
})

describe("readDatasetCsv — výsledovka", () => {
  it("reads every row as vzz and needs no Část column", () => {
    const result = ok(
      readDatasetCsv(
        "vzz",
        [
          "Ozn;Řádek;Text;Běžné;Minulé;Tučné",
          "I.;001;Tržby z prodeje výrobků a služeb;8 200 000,00;7 400 000,00;",
          "***;055;Výsledek hospodaření za účetní období (+/-);-350 000,00;120 000,00;ano",
          "",
        ].join("\n"),
      ),
    )
    const lines =
      result.payload.dataset === "vzz" ? result.payload.statementLines : []

    expect(lines).toHaveLength(2)
    expect(lines.every((line) => line.statementKind === "vzz")).toBe(true)
    expect(lines[1]).toMatchObject({
      ozn: "***",
      rowCode: "055",
      bezne: "-350000.00",
      minule: "120000.00",
      isBold: true,
    })
  })

  it("refuses a vzz row carrying rozvaha-aktiva columns", () => {
    const result = rejected(
      readDatasetCsv("vzz", "Řádek;Text;Brutto\n001;Tržby;100,00\n"),
    )
    expect(result.issues).toEqual([
      { line: 2, column: null, code: "column_shape" },
    ])
  })
})
