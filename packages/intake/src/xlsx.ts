// XLSX → IR. An xlsx is a zip of XML. Pure: bytes in, BankTransaction IR out. We unzip with fflate, parse
// xl/sharedStrings.xml + the first xl/worksheets/sheet*.xml with fast-xml-parser, reconstruct the cell grid
// (resolving t="s" shared strings, t="inlineStr", and numbers; honoring r="B2" refs to place cells in the
// right column and filling gaps with null), then hand rows to the shared tabular mapper. Common case only —
// one sheet, header + data rows; anything unusual becomes a warning rather than a guess. No heavy xlsx lib.

import { XMLParser } from "fast-xml-parser"
import type { ParseContext, ParseResult, ParseWarning } from "./types"
import { rowsToBankTransactions, type Cell } from "./tabular"
import { decodeUtf8, textOf } from "./text"
import { safeUnzip, ZipGuardError } from "./zip-guard"

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // xlsx XML carries no legitimate DTD entities — disabling internal-entity substitution removes the
  // internal-entity-injection surface.
  processEntities: false,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
})

/** The real XLSX column ceiling (XFD = 16384). A cell ref beyond this is malformed and is skipped. */
const MAX_XLSX_COLUMN = 16384

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

function decodeEntry(bytes: Uint8Array): string {
  return decodeUtf8(bytes)
}

/** Read the text run(s) of one <si> shared-string entry (handles plain <t> and rich <r><t> runs). */
function siText(si: unknown): string {
  if (si === null || typeof si !== "object")
    return typeof si === "string" ? si : ""
  const node = si as Record<string, unknown>
  const direct = node["t"]
  if (typeof direct === "string") return direct
  if (direct && typeof direct === "object") return textOf(direct)
  const runs = asArray(node["r"] as unknown)
  if (runs.length > 0) {
    return runs
      .map((run) => textOf((run as Record<string, unknown>)["t"]))
      .join("")
  }
  return ""
}

function parseSharedStrings(entry: Uint8Array | undefined): string[] {
  if (!entry) return []
  const doc = parser.parse(decodeEntry(entry)) as Record<string, unknown>
  const sst = doc["sst"] as Record<string, unknown> | undefined
  if (!sst) return []
  return asArray(sst["si"] as unknown).map(siText)
}

/**
 * "B2" → 0-based column index (B → 1). Ignores the row part. Returns -1 when the ref is beyond the real
 * XLSX column ceiling (a crafted ref like "ZZZZZZZZ1" would otherwise blow the gap-fill up to OOM).
 * Short-circuits inside the loop so we never build a huge intermediate number.
 */
function columnIndex(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref.toUpperCase())?.[1] ?? ""
  let index = 0
  for (const ch of letters) {
    index = index * 26 + (ch.charCodeAt(0) - 64)
    if (index > MAX_XLSX_COLUMN) return -1
  }
  return index - 1
}

function cellText(cell: Record<string, unknown>): string {
  const v = cell["v"]
  if (v === undefined) return ""
  return textOf(v)
}

/** Resolve one <c> cell to a Cell value using its t attribute + the shared-strings table. */
function resolveCell(cell: Record<string, unknown>, shared: string[]): Cell {
  const type = cell["@_t"]
  if (type === "s") {
    const idx = Number(cellText(cell))
    const resolved = Number.isInteger(idx) ? shared[idx] : undefined
    return resolved ?? null
  }
  if (type === "inlineStr") {
    const is = cell["is"]
    if (is && typeof is === "object") return siText(is) || null
    return null
  }
  const raw = cellText(cell)
  if (raw === "") return null
  if (type === undefined || type === "n") {
    const num = Number(raw)
    return Number.isFinite(num) ? num : raw
  }
  return raw
}

function firstSheetEntry(
  files: Record<string, Uint8Array>,
): Uint8Array | undefined {
  const sheetNames = Object.keys(files)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = Number(/sheet(\d+)\.xml$/.exec(a)?.[1] ?? 0)
      const nb = Number(/sheet(\d+)\.xml$/.exec(b)?.[1] ?? 0)
      return na - nb
    })
  const first = sheetNames[0]
  return first ? files[first] : undefined
}

function reconstructGrid(
  sheetXml: string,
  shared: string[],
): { rows: Cell[][]; skippedRefs: number } {
  const doc = parser.parse(sheetXml) as Record<string, unknown>
  const worksheet = doc["worksheet"] as Record<string, unknown> | undefined
  const sheetData = worksheet?.["sheetData"] as
    | Record<string, unknown>
    | undefined
  if (!sheetData) return { rows: [], skippedRefs: 0 }

  const rows: Cell[][] = []
  let skippedRefs = 0
  for (const rowNode of asArray(sheetData["row"] as unknown)) {
    const rowRecord = rowNode as Record<string, unknown>
    const cells = asArray(rowRecord["c"] as unknown)
    const gridRow: Cell[] = []
    cells.forEach((cellNode, position) => {
      const cell = cellNode as Record<string, unknown>
      const ref = typeof cell["@_r"] === "string" ? (cell["@_r"] as string) : ""
      const col = ref ? columnIndex(ref) : position
      // Out-of-range ref (beyond XFD): skip the cell rather than gap-fill millions of nulls.
      if (col < 0 || col > MAX_XLSX_COLUMN) {
        skippedRefs += 1
        return
      }
      while (gridRow.length < col) gridRow.push(null)
      gridRow[col] = resolveCell(cell, shared)
    })
    rows.push(gridRow)
  }
  return { rows, skippedRefs }
}

export function parseXlsx(bytes: Uint8Array, ctx: ParseContext): ParseResult {
  const warnings: ParseWarning[] = []
  let files: Record<string, Uint8Array>
  try {
    files = safeUnzip(bytes)
  } catch (error) {
    const reason =
      error instanceof ZipGuardError
        ? `xlsx rejected: ${error.message}`
        : `xlsx unzip failed: ${error instanceof Error ? error.message : "unknown"}`
    return {
      records: [],
      warnings: [{ path: ctx.sourcePath, message: reason }],
    }
  }

  const shared = parseSharedStrings(files["xl/sharedStrings.xml"])
  const sheetEntry = firstSheetEntry(files)
  if (!sheetEntry) {
    return {
      records: [],
      warnings: [{ path: ctx.sourcePath, message: "xlsx has no worksheet" }],
    }
  }

  const sheetNames = Object.keys(files).filter((name) =>
    /^xl\/worksheets\/sheet\d+\.xml$/.test(name),
  )
  if (sheetNames.length > 1) {
    warnings.push({
      path: ctx.sourcePath,
      message: `xlsx has ${sheetNames.length} sheets — only the first is parsed`,
    })
  }

  const { rows: grid, skippedRefs } = reconstructGrid(
    decodeEntry(sheetEntry),
    shared,
  )
  if (skippedRefs > 0) {
    warnings.push({
      path: ctx.sourcePath,
      message: `xlsx has ${skippedRefs} cell(s) with an out-of-range column ref (beyond XFD) — skipped`,
    })
  }
  const result = rowsToBankTransactions(grid, ctx, "xlsx")
  return {
    records: result.records,
    warnings: [...warnings, ...result.warnings],
  }
}
