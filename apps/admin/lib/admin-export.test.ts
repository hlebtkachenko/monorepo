import { describe, expect, it } from "vitest"

import { escapeCsvCell, exportRowsAsCsv } from "./admin-export"

describe("escapeCsvCell", () => {
  it("returns empty string for null and undefined", () => {
    expect(escapeCsvCell(null)).toBe("")
    expect(escapeCsvCell(undefined)).toBe("")
  })

  it("returns plain text when no quoting is needed", () => {
    expect(escapeCsvCell("hello")).toBe("hello")
    expect(escapeCsvCell(42)).toBe("42")
    expect(escapeCsvCell(true)).toBe("true")
  })

  it("quotes and escapes when text contains comma, quote, or newline", () => {
    expect(escapeCsvCell("a,b")).toBe('"a,b"')
    expect(escapeCsvCell('he said "hi"')).toBe('"he said ""hi"""')
    expect(escapeCsvCell("line1\nline2")).toBe('"line1\nline2"')
    expect(escapeCsvCell("with\r\nCRLF")).toBe('"with\r\nCRLF"')
  })

  it("serialises Date to ISO-8601 UTC", () => {
    const d = new Date(Date.UTC(2026, 4, 20, 12, 0, 0))
    expect(escapeCsvCell(d)).toBe("2026-05-20T12:00:00.000Z")
  })

  it("serialises objects via JSON", () => {
    expect(escapeCsvCell({ a: 1 })).toBe('"{""a"":1}"')
  })
})

describe("exportRowsAsCsv", () => {
  interface Row {
    id: string
    label: string
    count: number
  }

  const columns: Array<{ key: keyof Row & string; label: string }> = [
    { key: "id", label: "ID" },
    { key: "label", label: "Label" },
    { key: "count", label: "Count" },
  ]

  it("emits header + zero rows for empty input", () => {
    expect(exportRowsAsCsv<Row>([], columns)).toBe("ID,Label,Count")
  })

  it("emits header + one row", () => {
    const rows: Row[] = [{ id: "a", label: "foo", count: 7 }]
    expect(exportRowsAsCsv(rows, columns)).toBe("ID,Label,Count\r\na,foo,7")
  })

  it("escapes commas inside cells", () => {
    const rows: Row[] = [{ id: "a", label: "foo,bar", count: 1 }]
    expect(exportRowsAsCsv(rows, columns)).toBe(
      'ID,Label,Count\r\na,"foo,bar",1',
    )
  })

  it("uses RFC-4180 CRLF row terminator", () => {
    const rows: Row[] = [
      { id: "a", label: "x", count: 1 },
      { id: "b", label: "y", count: 2 },
    ]
    const out = exportRowsAsCsv(rows, columns)
    expect(out.split("\r\n")).toEqual(["ID,Label,Count", "a,x,1", "b,y,2"])
  })
})
