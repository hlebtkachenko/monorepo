import { describe, expect, it } from "vitest"
import { zipSync, strToU8 } from "fflate"
import { parseXlsx } from "./xlsx"
import type { ParseContext } from "./types"

const ctx: ParseContext = {
  orgRef: "org-1",
  sourcePath: "dump/bank.xlsx",
  ingestedAt: "2026-07-01T00:00:00.000Z",
}

// Header cells + the "platba" message reference the shared-string table by index (t="s").
const sharedStrings = `<?xml version="1.0"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="6" uniqueCount="6">
  <si><t>datum</t></si>
  <si><t>castka</t></si>
  <si><t>mena</t></si>
  <si><t>VS</t></si>
  <si><t>2025-01-15</t></si>
  <si><t>platba</t></si>
</sst>`

// Row 1 = header (all shared strings). Row 2 = a data row; the date is a shared string, the amount a number,
// currency an inline string, VS a number, and column F skipped to exercise gap-filling with null.
const sheet = `<?xml version="1.0"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>0</v></c>
      <c r="B1" t="s"><v>1</v></c>
      <c r="C1" t="s"><v>2</v></c>
      <c r="D1" t="s"><v>3</v></c>
      <c r="E1" t="inlineStr"><is><t>zprava</t></is></c>
    </row>
    <row r="2">
      <c r="A2" t="s"><v>4</v></c>
      <c r="B2"><v>1234.56</v></c>
      <c r="C2" t="inlineStr"><is><t>CZK</t></is></c>
      <c r="D2"><v>12345</v></c>
      <c r="E2" t="s"><v>5</v></c>
    </row>
  </sheetData>
</worksheet>`

function buildXlsx(): Uint8Array {
  return zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "xl/workbook.xml": strToU8("<workbook/>"),
    "xl/sharedStrings.xml": strToU8(sharedStrings),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
  })
}

describe("parseXlsx", () => {
  it("reconstructs the grid, resolves shared strings, and emits a BankTransaction", () => {
    const { records, warnings } = parseXlsx(buildXlsx(), ctx)
    expect(warnings).toHaveLength(0)
    expect(records).toHaveLength(1)
    const rec = records[0]!
    if (rec.record_type !== "bank_transaction") throw new Error("type")
    expect(rec.amount_minor).toBe(123456n)
    expect(rec.currency).toBe("CZK")
    expect(rec.variable_symbol).toBe("12345")
    expect(rec.booking_date).toBe("2025-01-15")
    expect(rec.message).toBe("platba")
    expect(rec.source).toBe("xlsx")
    expect(rec.source_locator).toBe("dump/bank.xlsx#row=1")
  })

  it("warns when the archive has no worksheet", () => {
    const zip = zipSync({ "xl/workbook.xml": strToU8("<workbook/>") })
    const { records, warnings } = parseXlsx(zip, ctx)
    expect(records).toHaveLength(0)
    expect(warnings.some((w) => /no worksheet/.test(w.message))).toBe(true)
  })

  it("skips a cell with an out-of-range column ref instead of OOM gap-filling", () => {
    // A crafted r="ZZZZZZZZ1" (~217 billion columns) must be skipped, not expanded to null-fill.
    const craftedSheet = `<?xml version="1.0"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>0</v></c>
      <c r="B1" t="s"><v>1</v></c>
      <c r="ZZZZZZZZ1" t="s"><v>2</v></c>
    </row>
    <row r="2">
      <c r="A2" t="s"><v>4</v></c>
      <c r="B2"><v>1234.56</v></c>
    </row>
  </sheetData>
</worksheet>`
    const zip = zipSync({
      "[Content_Types].xml": strToU8("<Types/>"),
      "xl/workbook.xml": strToU8("<workbook/>"),
      "xl/sharedStrings.xml": strToU8(sharedStrings),
      "xl/worksheets/sheet1.xml": strToU8(craftedSheet),
    })
    const { records, warnings } = parseXlsx(zip, ctx)
    // The A/B columns (datum + castka) still map to one bank transaction; the crafted cell is dropped.
    expect(records).toHaveLength(1)
    const rec = records[0]!
    if (rec.record_type !== "bank_transaction") throw new Error("type")
    expect(rec.amount_minor).toBe(123456n)
    expect(
      warnings.some((w) => /out-of-range column ref/.test(w.message)),
    ).toBe(true)
  })
})
