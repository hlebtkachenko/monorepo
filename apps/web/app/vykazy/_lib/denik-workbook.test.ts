import { zipSync, strToU8 } from "fflate"
import { describe, expect, it } from "vitest"

import { parseDenikXlsx, parseWorkbookSheets, findSheets } from "./denik"

// Shapes taken from a REAL hand-built účetní deník, not from what the parser
// wished for. Every one of these broke the reader the first time it met an
// actual workbook:
//
//   - the tabs are prefixed to order them and to name the company
//     ("1-BDN-Ucetni-denik"), so an equality test on the folded name missed
//     every sheet and silently fell back to the first one in the book;
//   - row 1 is a title band ("ÚČETNÍ DENÍK — <firma> — <období>") with blank
//     spacer rows under it, so the header sits several rows down;
//   - there is no `TpUD` column at all — that is a POHODA export artifact, and
//     requiring it rejected the whole file;
//   - one workbook carries THREE companies, each with its own deník and rozvrh.

function sheetXml(rows: (string | number)[][]): string {
  const cells = rows
    .map((row, r) => {
      const cs = row
        .map((v, c) => {
          const ref = `${String.fromCharCode(65 + c)}${r + 1}`
          return typeof v === "number"
            ? `<c r="${ref}"><v>${v}</v></c>`
            : v === ""
              ? ""
              : `<c r="${ref}" t="inlineStr"><is><t>${v}</t></is></c>`
        })
        .join("")
      return `<row r="${r + 1}">${cs}</row>`
    })
    .join("")
  return `<?xml version="1.0"?><worksheet><sheetData>${cells}</sheetData></worksheet>`
}

function workbook(tabs: { name: string; rows: (string | number)[][] }[]) {
  const files: Record<string, Uint8Array> = {
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0"?><workbook><sheets>${tabs
        .map((t, i) => `<sheet name="${t.name}" r:id="rId${i + 1}"/>`)
        .join("")}</sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0"?><Relationships>${tabs
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join("")}</Relationships>`,
    ),
  }
  tabs.forEach((t, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(t.rows))
  })
  const zipped = zipSync(files)
  return zipped.buffer.slice(
    zipped.byteOffset,
    zipped.byteOffset + zipped.byteLength,
  ) as ArrayBuffer
}

/** The real header, in the real order, without TpUD. */
const HEADER = [
  "Datum",
  "Číslo",
  "Zdroj",
  "Text",
  "MD",
  "DAL",
  "Částka",
  "PárSym",
  "Firma",
  "IČ",
]

/** Title band + spacer rows + header on the fourth row, as the real file has. */
function denikRows(firma: string): (string | number)[][] {
  return [
    [`ÚČETNÍ DENÍK — ${firma} — 01.01.2026–30.06.2026`],
    ["", "", "", ""],
    [""],
    HEADER,
    ["15.06.2026", "001", "Banka", "Úhrada", "321000", "221000", 121000, "", "Dodavatel s.r.o.", "27074358"], // prettier-ignore
  ]
}

describe("a real hand-built workbook", () => {
  it("finds a deník whose tab is prefixed with an index and a company code", () => {
    const buf = workbook([
      { name: "1-BDN-Ucetni-denik", rows: denikRows("BD Nehvizdy") },
    ])
    const sheets = parseWorkbookSheets(buf)
    expect(findSheets(sheets, ["ucetni denik"]).map((s) => s.name)).toEqual([
      "1-BDN-Ucetni-denik",
    ])
  })

  it("reads past the title band to the real header row", () => {
    const result = parseDenikXlsx(
      workbook([
        { name: "1-BDN-Ucetni-denik", rows: denikRows("BD Nehvizdy") },
      ]),
    )
    expect(result.missingHeaders).toEqual([])
    expect(result.headerOk).toBe(true)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]?.md).toBe("321000")
    expect(result.rows[0]?.castka).toBe(121000)
    // The title band is not a column.
    expect(result.ignoredColumns).not.toContain("Datum")
  })

  it("does not demand TpUD, which only a POHODA export has", () => {
    const result = parseDenikXlsx(
      workbook([
        { name: "1-BDN-Ucetni-denik", rows: denikRows("BD Nehvizdy") },
      ]),
    )
    expect(result.missingHeaders).not.toContain("TpUD")
    expect(result.headerOk).toBe(true)
  })

  it("names every deník when one workbook holds several companies", () => {
    const result = parseDenikXlsx(
      workbook([
        { name: "1-BDN-Ucetni-denik", rows: denikRows("BD Nehvizdy") },
        { name: "2-BDN-Uctovy-rozvrh", rows: [["ÚČTOVÝ ROZVRH"], ["Účet", "Název"]] }, // prettier-ignore
        { name: "4-HHC-Ucetni-denik", rows: denikRows("HENDERSON") },
        { name: "7-EFC-Ucetni-denik", rows: denikRows("EFC") },
      ]),
    )
    expect(result.headerOk).toBe(true)
    // Loud, because loading one company's books under another's DIČ is a wrong
    // tax filing that nothing downstream can detect.
    const warning = result.warnings.join(" ")
    expect(warning).toContain("3 deníků")
    expect(warning).toContain("4-HHC-Ucetni-denik")
    expect(warning).toContain("7-EFC-Ucetni-denik")
  })

  it("still reports a genuinely malformed file as malformed", () => {
    const notAZip = new TextEncoder().encode("<html>nope</html>")
      .buffer as ArrayBuffer
    const result = parseDenikXlsx(notAZip)
    expect(result.headerOk).toBe(false)
    expect(result.warnings.join(" ")).toContain("platný XLSX")
  })
})
