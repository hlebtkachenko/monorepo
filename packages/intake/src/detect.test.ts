import { describe, expect, it } from "vitest"
import { zipSync, strToU8 } from "fflate"
import { detectFormat } from "./detect"

function utf8(text: string): Uint8Array {
  return strToU8(text)
}

describe("detectFormat", () => {
  it("detects a pdf by magic bytes", () => {
    expect(detectFormat(utf8("%PDF-1.7\n..."), "doc.pdf")).toBe("pdf")
  })

  it("detects a pohoda dataPack XML by root element", () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n<dat:dataPack xmlns:dat="x"></dat:dataPack>'
    expect(detectFormat(utf8(xml), "export.xml")).toBe("pohoda_xml")
  })

  it("detects isdoc by Invoice root + namespace", () => {
    const xml =
      '<?xml version="1.0"?>\n<Invoice xmlns="http://isdoc.cz/namespace/2013"></Invoice>'
    expect(detectFormat(utf8(xml), "faktura.isdoc")).toBe("isdoc")
  })

  it("detects a .mdb native backup as pohoda_db (refuse marker)", () => {
    expect(detectFormat(new Uint8Array([0, 1, 2, 3]), "data.mdb")).toBe(
      "pohoda_db",
    )
  })

  it("detects an xlsx (zip containing xl/workbook.xml)", () => {
    const zip = zipSync({
      "xl/workbook.xml": strToU8("<workbook/>"),
      "[Content_Types].xml": strToU8("<Types/>"),
    })
    expect(detectFormat(zip, "book.xlsx")).toBe("xlsx")
  })

  it("detects a plain zip (no xlsx marker)", () => {
    const zip = zipSync({ "a.txt": strToU8("hello") })
    expect(detectFormat(zip, "dump.zip")).toBe("zip")
  })

  it("detects a zip that looks like a pohoda native backup as pohoda_db", () => {
    const zip = zipSync({ "Zaloha/data.mdb": strToU8("x") })
    expect(detectFormat(zip, "backup.zip")).toBe("pohoda_db")
  })

  it("detects csv by extension + delimiters", () => {
    const csv = "datum,castka\n2025-01-01,100\n"
    expect(detectFormat(utf8(csv), "export.csv")).toBe("csv")
  })

  it("falls back to unknown for an unrecognized blob", () => {
    expect(
      detectFormat(new Uint8Array([0xde, 0xad, 0xbe, 0xef]), "x.bin"),
    ).toBe("unknown")
  })

  it("tolerates a UTF-8 BOM before the XML declaration", () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf])
    const body = utf8('<?xml version="1.0"?><dataPack></dataPack>')
    const merged = new Uint8Array(bom.length + body.length)
    merged.set(bom)
    merged.set(body, bom.length)
    expect(detectFormat(merged, "e.xml")).toBe("pohoda_xml")
  })
})
