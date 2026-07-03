import { describe, expect, it } from "vitest"
import { strToU8 } from "fflate"
import { parseCsv } from "./csv"
import type { ParseContext } from "./types"

const ctx: ParseContext = {
  orgRef: "org-1",
  sourcePath: "dump/bank.csv",
  ingestedAt: "2026-07-01T00:00:00.000Z",
}

describe("parseCsv", () => {
  it("parses a semicolon-delimited CZ bank export (auto-detected delimiter)", () => {
    const csv =
      "datum;částka;měna;VS\n" +
      "2025-01-15;1 234,56;CZK;12345\n" +
      "2025-01-16;-500,00;CZK;\n"
    const { records, warnings } = parseCsv(strToU8(csv), ctx)
    expect(warnings).toHaveLength(0)
    expect(records).toHaveLength(2)
    const first = records[0]!
    if (first.record_type !== "bank_transaction") throw new Error("type")
    expect(first.amount_minor).toBe(123456n)
    expect(first.currency).toBe("CZK")
    expect(first.variable_symbol).toBe("12345")
  })

  it("strips a UTF-8 BOM before parsing the header", () => {
    const csv = "﻿datum,částka\n2025-01-01,10,00\n".replace("10,00", "10.00")
    const { records } = parseCsv(strToU8(csv), ctx)
    expect(records).toHaveLength(1)
    const rec = records[0]!
    if (rec.record_type !== "bank_transaction") throw new Error("type")
    expect(rec.amount_minor).toBe(1000n)
  })
})
