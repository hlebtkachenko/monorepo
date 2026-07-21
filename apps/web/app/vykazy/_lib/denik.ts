// Client-side parser for a POHODA "účetní deník" exported to XLSX. An .xlsx is a
// zip of XML: we unzip with fflate, read xl/sharedStrings.xml + the first
// xl/worksheets/sheet*.xml, resolve shared strings, and rebuild the cell grid by
// hand (no heavy xlsx lib, no fast-xml-parser). Columns are matched BY HEADER
// NAME (row 1), so column order and the ~40 empty státní-správa columns are
// irrelevant. Pure: bytes in, DenikParseResult out. No React, no I/O.

import { strFromU8, unzipSync } from "fflate"

export interface DenikRow {
  datum: string
  tpUD: string
  zdroj: string
  cislo: string
  text: string
  md: string
  dal: string
  castka: number
  ciziMena?: string
  stredisko?: string
  zakazka?: string
  cinnost?: string
  parsym?: string
  firma?: string
  ic?: string
}

export interface DenikParseResult {
  rows: DenikRow[]
  ignoredColumns: string[]
  warnings: string[]
  headerOk: boolean
  missingHeaders: string[]
}

/** Internal grid cell: shared-string / inline text, number, or empty. */
type Cell = string | number | null

/** Field key on DenikRow a header maps to. "_jmeno" folds into `firma`. */
type FieldKey =
  | "datum"
  | "tpUD"
  | "zdroj"
  | "cislo"
  | "text"
  | "md"
  | "dal"
  | "castka"
  | "ciziMena"
  | "stredisko"
  | "zakazka"
  | "cinnost"
  | "parsym"
  | "firma"
  | "ic"
  | "_jmeno"

// Header string (row 1, exact Czech) -> DenikRow field.
const REQUIRED_HEADERS: Record<string, FieldKey> = {
  Datum: "datum",
  TpUD: "tpUD",
  Zdroj: "zdroj",
  Číslo: "cislo",
  Text: "text",
  MD: "md",
  DAL: "dal",
  Částka: "castka",
}

const OPTIONAL_HEADERS: Record<string, FieldKey> = {
  "Cizí měna": "ciziMena",
  Středisko: "stredisko",
  Zakázka: "zakazka",
  Činnost: "cinnost",
  Pársym: "parsym",
  Firma: "firma",
  Jméno: "_jmeno",
  IČ: "ic",
}

const REQUIRED_HEADER_NAMES = Object.keys(REQUIRED_HEADERS)

// --- XML helpers -------------------------------------------------------------

// Optional element namespace prefix (Excel writes none; some tools write "x:").
const P = "(?:[A-Za-z_][\\w.-]*:)?"

function decodeXmlEntities(s: string): string {
  return s.replace(/&(#x?[0-9A-Fa-f]+|[A-Za-z]+);/g, (whole, code: string) => {
    if (code[0] === "#") {
      const num =
        code[1] === "x" || code[1] === "X"
          ? Number.parseInt(code.slice(2), 16)
          : Number.parseInt(code.slice(1), 10)
      return Number.isFinite(num) && num >= 0 && num <= 0x10ffff
        ? String.fromCodePoint(num)
        : whole
    }
    switch (code) {
      case "amp":
        return "&"
      case "lt":
        return "<"
      case "gt":
        return ">"
      case "quot":
        return '"'
      case "apos":
        return "'"
      default:
        return whole
    }
  })
}

/** Concatenate every <t> run inside a fragment (shared-string <si> or <is>). */
function collectText(fragment: string): string {
  const re = new RegExp(`<${P}t\\b[^>]*>([\\s\\S]*?)</${P}t>`, "g")
  let out = ""
  let m: RegExpExecArray | null
  while ((m = re.exec(fragment)) !== null) out += decodeXmlEntities(m[1] ?? "")
  return out
}

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = []
  const re = new RegExp(
    `<${P}si\\b[^>]*>([\\s\\S]*?)</${P}si>|<${P}si\\b[^>]*/>`,
    "g",
  )
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) strings.push(collectText(m[1] ?? ""))
  return strings
}

/** "B2" -> 0-based column index (B -> 1). Row part ignored; -1 if malformed. */
function columnIndex(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref.toUpperCase())?.[1] ?? ""
  if (!letters) return -1
  let index = 0
  for (const ch of letters) {
    index = index * 26 + (ch.charCodeAt(0) - 64)
    if (index > 16384) return -1 // beyond the XFD column ceiling
  }
  return index - 1
}

function extractV(body: string): string {
  const m = new RegExp(`<${P}v\\b[^>]*>([\\s\\S]*?)</${P}v>`).exec(body)
  return m ? (m[1] ?? "") : ""
}

function resolveCell(
  type: string | undefined,
  body: string,
  shared: string[],
): Cell {
  if (type === "s") {
    const idx = Number(extractV(body))
    return Number.isInteger(idx) ? (shared[idx] ?? null) : null
  }
  if (type === "inlineStr") {
    return collectText(body) || null
  }
  const raw = extractV(body)
  if (raw === "") return null
  if (type === undefined || type === "n") {
    const num = Number(raw)
    return Number.isFinite(num) ? num : decodeXmlEntities(raw)
  }
  // t="str" (cached formula string), t="b", t="e" -> keep as text.
  return decodeXmlEntities(raw)
}

/** Rebuild the sheet as a dense row-major grid, honoring r="A1" cell refs. */
function parseSheet(xml: string, shared: string[]): Cell[][] {
  const grid: Cell[][] = []
  const rowRe = new RegExp(
    `<${P}row\\b[^>]*>([\\s\\S]*?)</${P}row>|<${P}row\\b[^>]*/>`,
    "g",
  )
  const cellRe = new RegExp(
    `<${P}c\\b([^>]*?)/>|<${P}c\\b([^>]*?)>([\\s\\S]*?)</${P}c>`,
    "g",
  )
  let rowMatch: RegExpExecArray | null
  while ((rowMatch = rowRe.exec(xml)) !== null) {
    const inner = rowMatch[1] ?? ""
    const row: Cell[] = []
    let auto = 0
    let cellMatch: RegExpExecArray | null
    cellRe.lastIndex = 0
    while ((cellMatch = cellRe.exec(inner)) !== null) {
      const attrs = cellMatch[1] ?? cellMatch[2] ?? ""
      const body = cellMatch[3] ?? ""
      const refAttr = /\br="([A-Za-z]+\d+)"/.exec(attrs)?.[1]
      const typeAttr = /\bt="([^"]+)"/.exec(attrs)?.[1]
      const col = refAttr ? columnIndex(refAttr) : auto
      if (col < 0) continue
      auto = col + 1
      const value =
        cellMatch[1] !== undefined ? null : resolveCell(typeAttr, body, shared)
      while (row.length < col) row.push(null)
      row[col] = value
    }
    grid.push(row)
  }
  return grid
}

function firstSheetXml(
  files: Record<string, Uint8Array>,
): Uint8Array | undefined {
  const names = Object.keys(files)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort(
      (a, b) =>
        Number(/sheet(\d+)\.xml$/.exec(a)?.[1] ?? 0) -
        Number(/sheet(\d+)\.xml$/.exec(b)?.[1] ?? 0),
    )
  const first = names[0]
  return first ? files[first] : undefined
}

// --- value coercion ----------------------------------------------------------

function cellString(row: Cell[], col: number | undefined): string {
  if (col === undefined) return ""
  const v = row[col]
  if (v === null || v === undefined) return ""
  return typeof v === "string" ? v.trim() : String(v)
}

/**
 * Excel serial number -> "DD.MM.YYYY". Excel's 1900 date system with the well
 * known 1900 leap-year bug means serial day 0 = 1899-12-30; every accounting
 * date is well past the bug boundary so this is exact.
 */
function excelSerialToDate(serial: number): string {
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000
  const d = new Date(ms)
  const dd = String(d.getUTCDate()).padStart(2, "0")
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
  return `${dd}.${mm}.${d.getUTCFullYear()}`
}

function parseDatum(row: Cell[], col: number | undefined): string {
  if (col === undefined) return ""
  const v = row[col]
  if (typeof v === "number" && Number.isFinite(v)) return excelSerialToDate(v)
  if (typeof v === "string") return v.trim()
  return ""
}

function parseCastka(row: Cell[], col: number | undefined): number {
  if (col === undefined) return 0
  const v = row[col]
  if (typeof v === "number") return Number.isFinite(v) ? v : 0
  if (typeof v !== "string") return 0
  const cleaned = v.replace(/[\s ]/g, "").replace(",", ".")
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

// --- public API --------------------------------------------------------------

export function parseDenikXlsx(buf: ArrayBuffer): DenikParseResult {
  const warnings: string[] = []
  const ignoredColumns: string[] = []

  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(new Uint8Array(buf))
  } catch {
    return {
      rows: [],
      ignoredColumns,
      warnings: ["Soubor se nepodařilo rozbalit — není to platný XLSX."],
      headerOk: false,
      missingHeaders: REQUIRED_HEADER_NAMES,
    }
  }

  const sharedEntry = files["xl/sharedStrings.xml"]
  const shared = sharedEntry ? parseSharedStrings(strFromU8(sharedEntry)) : []

  const sheetEntry = firstSheetXml(files)
  if (!sheetEntry) {
    return {
      rows: [],
      ignoredColumns,
      warnings: ["XLSX neobsahuje žádný list."],
      headerOk: false,
      missingHeaders: REQUIRED_HEADER_NAMES,
    }
  }

  const sheetCount = Object.keys(files).filter((name) =>
    /^xl\/worksheets\/sheet\d+\.xml$/.test(name),
  ).length
  if (sheetCount > 1) {
    warnings.push(`Sešit má ${sheetCount} listy — načten je pouze první.`)
  }

  const grid = parseSheet(strFromU8(sheetEntry), shared)
  const header = grid[0] ?? []

  // Map every header cell to a field, collecting unknown headers to ignore.
  const cols: Partial<Record<FieldKey, number>> = {}
  header.forEach((cell, idx) => {
    const name =
      typeof cell === "string"
        ? cell.trim()
        : cell === null
          ? ""
          : String(cell).trim()
    if (name === "") return
    const field = REQUIRED_HEADERS[name] ?? OPTIONAL_HEADERS[name]
    if (field === undefined) {
      ignoredColumns.push(name)
      return
    }
    if (cols[field] === undefined) cols[field] = idx
  })

  const missingHeaders = REQUIRED_HEADER_NAMES.filter(
    (name) => cols[REQUIRED_HEADERS[name] as FieldKey] === undefined,
  )
  if (missingHeaders.length > 0) {
    return {
      rows: [],
      ignoredColumns,
      warnings,
      headerOk: false,
      missingHeaders,
    }
  }

  const rows: DenikRow[] = []
  for (let r = 1; r < grid.length; r++) {
    const gridRow = grid[r]
    if (!gridRow) continue

    const datum = parseDatum(gridRow, cols.datum)
    const tpUD = cellString(gridRow, cols.tpUD)
    const zdroj = cellString(gridRow, cols.zdroj)
    const cislo = cellString(gridRow, cols.cislo)
    const text = cellString(gridRow, cols.text)
    const md = cellString(gridRow, cols.md)
    const dal = cellString(gridRow, cols.dal)
    const castka = parseCastka(gridRow, cols.castka)

    // Skip fully-empty rows (padding rows carry only style, no values).
    if (
      datum === "" &&
      tpUD === "" &&
      zdroj === "" &&
      cislo === "" &&
      text === "" &&
      md === "" &&
      dal === "" &&
      castka === 0
    ) {
      continue
    }

    const firma =
      cellString(gridRow, cols.firma) || cellString(gridRow, cols._jmeno)
    const row: DenikRow = { datum, tpUD, zdroj, cislo, text, md, dal, castka }
    const ciziMena = cellString(gridRow, cols.ciziMena)
    if (ciziMena) row.ciziMena = ciziMena
    const stredisko = cellString(gridRow, cols.stredisko)
    if (stredisko) row.stredisko = stredisko
    const zakazka = cellString(gridRow, cols.zakazka)
    if (zakazka) row.zakazka = zakazka
    const cinnost = cellString(gridRow, cols.cinnost)
    if (cinnost) row.cinnost = cinnost
    const parsym = cellString(gridRow, cols.parsym)
    if (parsym) row.parsym = parsym
    if (firma) row.firma = firma
    const ic = cellString(gridRow, cols.ic)
    if (ic) row.ic = ic

    rows.push(row)
  }

  return { rows, ignoredColumns, warnings, headerOk: true, missingHeaders: [] }
}

// --- CSV template + import ----------------------------------------------------
// A clean, minimal deník shape (no POHODA státní-správa noise). Semicolon-
// delimited (Czech Excel default), UTF-8 with BOM. Header matched by name, so
// column order and extra columns don't matter; only Datum / MD / DAL / Částka
// are required.

/** Ordered columns of the downloadable CSV template. */
export const DENIK_CSV_TEMPLATE_HEADERS = [
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
] as const

/** CSV header name -> DenikRow field (accepts a few spelling variants). */
const CSV_HEADERS: Record<string, FieldKey> = {
  Datum: "datum",
  Číslo: "cislo",
  Zdroj: "zdroj",
  Text: "text",
  MD: "md",
  DAL: "dal",
  Dal: "dal",
  Částka: "castka",
  PárSym: "parsym",
  Pársym: "parsym",
  Firma: "firma",
  Jméno: "_jmeno",
  IČ: "ic",
  Středisko: "stredisko",
  Zakázka: "zakazka",
  Činnost: "cinnost",
}

const CSV_REQUIRED_NAMES = ["Datum", "MD", "DAL", "Částka"]

/** The template as a ready-to-download CSV string (BOM + header + 2 examples). */
export function denikCsvTemplate(): string {
  const header = DENIK_CSV_TEMPLATE_HEADERS.join(";")
  const examples = [
    [
      "01.01.2025",
      "",
      "Počáteční stavy účtů",
      "Počáteční stav rozvahových účtů",
      "221000",
      "701000",
      "100000",
      "",
      "",
      "",
    ],
    [
      "15.01.2025",
      "FP2025001",
      "Přijaté faktury",
      "Nákup materiálu",
      "501000",
      "321000",
      "12100",
      "2025001",
      "Dodavatel s.r.o.",
      "12345678",
    ],
  ]
  const lines = [header, ...examples.map((r) => r.join(";"))]
  return `\uFEFF${lines.join("\r\n")}\r\n`
}

function detectDelimiter(headerLine: string): string {
  const semis = (headerLine.match(/;/g) ?? []).length
  const commas = (headerLine.match(/,/g) ?? []).length
  return commas > semis ? "," : ";"
}

/** Split one CSV line, honoring "quoted ""fields"" with the delimiter inside". */
function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = []
  let cur = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === delim) {
      out.push(cur)
      cur = ""
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

function castkaFromString(v: string): number {
  const cleaned = v.replace(/[\s ]/g, "").replace(",", ".")
  if (cleaned === "" || cleaned === "-" || cleaned === "+") return 0
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

/** Parse the clean deník CSV (the downloadable template's shape). */
export function parseDenikCsv(text: string): DenikParseResult {
  const warnings: string[] = []
  const ignoredColumns: string[] = []
  const clean = text.replace(/^\uFEFF/, "")
  const rawLines = clean.split(/\r\n|\n|\r/)
  const headerLine = rawLines[0] ?? ""
  if (headerLine.trim() === "") {
    return {
      rows: [],
      ignoredColumns,
      warnings: ["Prázdný soubor."],
      headerOk: false,
      missingHeaders: CSV_REQUIRED_NAMES,
    }
  }

  const delim = detectDelimiter(headerLine)
  const header = splitCsvLine(headerLine, delim).map((h) => h.trim())
  const cols: Partial<Record<FieldKey, number>> = {}
  header.forEach((name, idx) => {
    if (name === "") return
    const field = CSV_HEADERS[name]
    if (field === undefined) {
      ignoredColumns.push(name)
      return
    }
    if (cols[field] === undefined) cols[field] = idx
  })

  const missingHeaders = CSV_REQUIRED_NAMES.filter(
    (name) => cols[CSV_HEADERS[name] as FieldKey] === undefined,
  )
  if (missingHeaders.length > 0) {
    return {
      rows: [],
      ignoredColumns,
      warnings,
      headerOk: false,
      missingHeaders,
    }
  }

  const at = (fields: string[], col: number | undefined): string =>
    col === undefined ? "" : (fields[col] ?? "").trim()

  const rows: DenikRow[] = []
  for (let i = 1; i < rawLines.length; i++) {
    const line = rawLines[i]
    if (line === undefined || line.trim() === "") continue
    const f = splitCsvLine(line, delim)

    const datum = at(f, cols.datum)
    const zdroj = at(f, cols.zdroj)
    const cislo = at(f, cols.cislo)
    const text2 = at(f, cols.text)
    const md = at(f, cols.md)
    const dal = at(f, cols.dal)
    const castka = castkaFromString(at(f, cols.castka))

    if (
      datum === "" &&
      zdroj === "" &&
      cislo === "" &&
      text2 === "" &&
      md === "" &&
      dal === "" &&
      castka === 0
    ) {
      continue
    }

    const row: DenikRow = {
      datum,
      tpUD: "",
      zdroj,
      cislo,
      text: text2,
      md,
      dal,
      castka,
    }
    const firma = at(f, cols.firma) || at(f, cols._jmeno)
    if (firma) row.firma = firma
    const parsym = at(f, cols.parsym)
    if (parsym) row.parsym = parsym
    const ic = at(f, cols.ic)
    if (ic) row.ic = ic
    const stredisko = at(f, cols.stredisko)
    if (stredisko) row.stredisko = stredisko
    const zakazka = at(f, cols.zakazka)
    if (zakazka) row.zakazka = zakazka
    const cinnost = at(f, cols.cinnost)
    if (cinnost) row.cinnost = cinnost

    rows.push(row)
  }

  return { rows, ignoredColumns, warnings, headerOk: true, missingHeaders: [] }
}
