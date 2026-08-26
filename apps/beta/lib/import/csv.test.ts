/**
 * The tokenizer and the value shapes, against the input a Czech office actually
 * produces.
 *
 * Every case here is a file the office could plausibly hand over on the month
 * the agent is down — Excel's BOM, a semicolon export, a quoted account name
 * with a semicolon in it, `1 234,50` with a non-breaking space. A parser that
 * only handles the tidy case is a fallback that does not fall back.
 */
import { describe, expect, it } from "vitest"

import {
  cell,
  detectDelimiter,
  indexColumns,
  normalizeHeader,
  parseBooleanCell,
  parseDecimalCell,
  parseIntegerCell,
  readCsv,
} from "./csv"

const BOM = "﻿"
const NBSP = " "
const NARROW_NBSP = " "

function documentOf(text: string) {
  const read = readCsv(text)
  if (!read.ok)
    throw new Error(`expected a readable document, got ${read.code}`)
  return read.document
}

describe("detectDelimiter", () => {
  it("picks the semicolon a cs-CZ export writes", () => {
    expect(detectDelimiter("Účet;Název;Konečný zůstatek")).toBe(";")
  })

  it("picks the comma when the file is comma-separated", () => {
    expect(detectDelimiter("account,name,closing")).toBe(",")
  })

  it("picks the tab when the file is tab-separated", () => {
    expect(detectDelimiter("ucet\tnazev\tks")).toBe("\t")
  })

  it("ignores separators INSIDE a quoted header", () => {
    // One real comma, three semicolons that live inside quotes.
    expect(detectDelimiter('"Účet;analytika";"Název;popis"')).toBe(";")
    expect(detectDelimiter('"a;b;c",name')).toBe(",")
  })

  it("falls back to the semicolon for a single-column file", () => {
    expect(detectDelimiter("Účet")).toBe(";")
  })
})

describe("readCsv", () => {
  it("strips a UTF-8 BOM before anything reads the header", () => {
    const document = documentOf(`${BOM}Účet;Název\n211;Pokladna\n`)
    expect(document.header.values[0]).toBe("Účet")
    expect(document.rows).toHaveLength(1)
  })

  it("reads quoted fields containing the delimiter, and doubled quotes", () => {
    const document = documentOf(
      'Účet;Název\n518;"Ostatní služby; drobné"\n521;"Mzdy ""hrubé"""\n',
    )
    expect(document.rows[0]!.values[1]).toBe("Ostatní služby; drobné")
    expect(document.rows[1]!.values[1]).toBe('Mzdy "hrubé"')
  })

  it("keeps a newline inside a quoted field and still advances the line number", () => {
    const document = documentOf(
      'Účet;Název\n211;"Pokladna\nkorunová"\n311;Odběratelé\n',
    )
    expect(document.rows[0]!.values[1]).toBe("Pokladna\nkorunová")
    expect(document.rows[0]!.line).toBe(2)
    // The embedded newline is a physical line: the next record is line 4.
    expect(document.rows[1]!.line).toBe(4)
  })

  it("reads CRLF, LF and a missing trailing newline identically", () => {
    for (const text of [
      "a;b\r\n1;2\r\n",
      "a;b\n1;2\n",
      "a;b\n1;2",
      "a;b\r1;2",
    ]) {
      const document = documentOf(text)
      expect(document.rows).toHaveLength(1)
      expect(document.rows[0]!.values).toEqual(["1", "2"])
    }
  })

  it("drops blank lines without renumbering the rows after them", () => {
    const document = documentOf("a;b\n1;2\n\n3;4\n\n")
    expect(document.rows).toHaveLength(2)
    expect(document.rows[1]!.line).toBe(4)
  })

  it("refuses an empty file", () => {
    expect(readCsv("")).toEqual({ ok: false, code: "empty_file" })
    expect(readCsv("   \n\n")).toEqual({ ok: false, code: "empty_file" })
  })

  it("refuses a header with no data rows", () => {
    expect(readCsv("Účet;Název\n")).toEqual({ ok: false, code: "no_data_rows" })
  })

  it("refuses an unterminated quote rather than swallowing the rest of the file", () => {
    expect(readCsv('Účet;Název\n211;"Pokladna\n311;Odběratelé\n')).toEqual({
      ok: false,
      code: "unterminated_quote",
    })
  })
})

describe("normalizeHeader", () => {
  it("folds case, diacritics and separators to one comparable form", () => {
    for (const spelling of ["Účet", "ucet", "ÚČET", " Účet ", "Účet:"]) {
      expect(normalizeHeader(spelling)).toBe("ucet")
    }
    expect(normalizeHeader("Konečný zůstatek")).toBe("konecny_zustatek")
    expect(normalizeHeader("Obrat MD")).toBe("obrat_md")
    expect(normalizeHeader("Obrat-MD")).toBe("obrat_md")
  })

  it("keeps a separator INSIDE a word significant", () => {
    // Folding is about spelling, not about word boundaries: an office header
    // that really says "Ú-ČET" is a different column name, and silently
    // matching it to `ucet` would be the reader inventing an alias.
    expect(normalizeHeader("Ú-ČET")).toBe("u_cet")
  })
})

describe("indexColumns", () => {
  const aliases = {
    accountCode: ["ucet", "cislo_uctu"],
    closingBalance: ["konecny_zustatek"],
  }

  it("finds a column under any accepted spelling and records the header as written", () => {
    const document = documentOf("Číslo účtu;Konečný zůstatek\n211;10\n")
    const columns = indexColumns(document.header, aliases)

    expect(columns.index.get("accountCode")).toBe(0)
    expect(columns.matched["accountCode"]).toBe("Číslo účtu")
    expect(cell(document.rows[0]!, columns, "accountCode")).toBe("211")
  })

  it("leaves a declared field absent when the file has no such column", () => {
    const document = documentOf("Účet\n211\n")
    const columns = indexColumns(document.header, aliases)

    expect(columns.index.has("closingBalance")).toBe(false)
    // An absent COLUMN is null, distinct from an empty CELL, which is "".
    expect(cell(document.rows[0]!, columns, "closingBalance")).toBeNull()
  })
})

describe("parseDecimalCell", () => {
  it("reads the Czech decimal comma with space thousands separators", () => {
    expect(parseDecimalCell("1 234,50")).toEqual({ ok: true, value: "1234.50" })
    expect(parseDecimalCell(`1${NBSP}234,50`)).toEqual({
      ok: true,
      value: "1234.50",
    })
    expect(parseDecimalCell(`1${NARROW_NBSP}234 567,05`)).toEqual({
      ok: true,
      value: "1234567.05",
    })
  })

  it("reads dot thousands separators when a comma marks the decimal", () => {
    expect(parseDecimalCell("1.234.567,89")).toEqual({
      ok: true,
      value: "1234567.89",
    })
  })

  it("treats a dot as decimal when the cell has no comma", () => {
    expect(parseDecimalCell("1234.50")).toEqual({ ok: true, value: "1234.50" })
    expect(parseDecimalCell("1 234.50")).toEqual({ ok: true, value: "1234.50" })
    expect(parseDecimalCell("1234")).toEqual({ ok: true, value: "1234" })
  })

  it("keeps a negative sign — korekce is printed negative on the form", () => {
    expect(parseDecimalCell("-1 234,50")).toEqual({
      ok: true,
      value: "-1234.50",
    })
    expect(parseDecimalCell("+120,00")).toEqual({ ok: true, value: "120.00" })
  })

  it("reads an empty cell as an absent value, never as a zero", () => {
    expect(parseDecimalCell("")).toEqual({ ok: true, value: null })
    expect(parseDecimalCell("   ")).toEqual({ ok: true, value: null })
  })

  it("refuses anything that is not a numeric(14,2)", () => {
    for (const bad of [
      "x",
      "1,2,3",
      "1,234",
      "12 345 678 901 234,00",
      "1 234,-",
      "(1 234,50)",
      "--5",
    ]) {
      expect(parseDecimalCell(bad).ok).toBe(false)
    }
  })
})

describe("parseIntegerCell", () => {
  it("reads a whole number inside the range, and empty as absent", () => {
    expect(parseIntegerCell("3", { min: 0, max: 8 })).toEqual({
      ok: true,
      value: 3,
    })
    expect(parseIntegerCell("", { min: 0, max: 8 })).toEqual({
      ok: true,
      value: null,
    })
  })

  it("refuses out-of-range and non-integer cells", () => {
    expect(parseIntegerCell("9", { min: 0, max: 8 }).ok).toBe(false)
    expect(parseIntegerCell("1.5", { min: 0, max: 8 }).ok).toBe(false)
    expect(parseIntegerCell("-1", { min: 0, max: 8 }).ok).toBe(false)
  })
})

describe("parseBooleanCell", () => {
  it("reads the spellings a Czech office types, and nothing else", () => {
    for (const truthy of ["1", "ano", "ANO", "true", "x", "X", "A"]) {
      expect(parseBooleanCell(truthy)).toBe(true)
    }
    for (const falsy of ["", "0", "ne", "false", "-"]) {
      expect(parseBooleanCell(falsy)).toBe(false)
    }
  })
})
