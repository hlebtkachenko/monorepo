// Účtový rozvrh (§ 14 zákona č. 563/1991 Sb.) — the accounting unit's OWN chart
// of accounts, imported as CSV. The směrná účtová osnova in _data/osnova.ts is
// synthetic-only reference data, so an analytical account like 475017 falls back
// to its synthetic's generic name ("Dlouhodobé přijaté zálohy") wherever a name
// is rendered. A loaded rozvrh supplies the real one ("Byt 17, ...").
//
// Pure: text in, accounts out. No React, no I/O.

import { OSNOVA } from "../_data/osnova"
import { csvField, detectDelimiter, splitCsvLine } from "./csv"

export interface RozvrhAccount {
  /** Full account number as it appears in the deník (usually 6 digits). */
  ucet: string
  nazev: string
  /** Účet oprávek / opravných položek — its balance belongs in the korekce column. */
  opravkovy?: boolean
}

export interface RozvrhParseResult {
  accounts: RozvrhAccount[]
  ignoredColumns: string[]
  duplicates: string[]
  /** Rows dropped for want of an account number or a name, with their line. */
  skipped: string[]
  headerOk: boolean
  missingHeaders: string[]
}

type FieldKey = "ucet" | "nazev" | "opravkovy"

const CSV_HEADERS: Record<string, FieldKey> = {
  Účet: "ucet",
  Ucet: "ucet",
  Název: "nazev",
  Nazev: "nazev",
  Oprávkový: "opravkovy",
  Opravkovy: "opravkovy",
}

/**
 * Columns the účtový rozvrh sheet carries that this app has no use for. They are
 * recognized so an import of the full sheet does not report them as unknown, and
 * dropped so the document does not persist fields nothing renders.
 */
const KNOWN_UNUSED_HEADERS = new Set([
  "Název EN",
  "Nazev EN",
  "Alternativní název 1",
  "Druh",
  "Typ",
  "Podtyp",
  "Vnitropodnikový",
  "Technický",
  "Účet převodu",
  "Zdroj",
])

const REQUIRED_NAMES = ["Účet", "Název"]

/** Ordered columns of the downloadable template. A superset is accepted on
 * import: the full účtový rozvrh sheet imports as-is, extra columns and all. */
const TEMPLATE_HEADERS = ["Účet", "Název", "Oprávkový"] as const

/** "Ano" / "Ne" as the Czech accounting software writes it, plus the usual aliases. */
function parseOpravkovy(v: string): boolean {
  const s = v.trim().toLowerCase()
  return s === "ano" || s === "true" || s === "1" || s === "yes"
}

export function rozvrhCsvTemplate(): string {
  const examples = [
    ["221003", "Bankovní účet EUR: Raiffeisenbank (devizový)", "Ne"],
    ["475017", "Dlouhodobé přijaté zálohy: Byt 17", "Ne"],
    ["391001", "Opravná položka k pohledávkám", "Ano"],
  ]
  const lines = [
    TEMPLATE_HEADERS.join(";"),
    ...examples.map((r) => r.map((f) => csvField(f)).join(";")),
  ]
  return `\uFEFF${lines.join("\r\n")}\r\n`
}

export function parseRozvrhCsv(text: string): RozvrhParseResult {
  const ignoredColumns: string[] = []
  const duplicates: string[] = []
  const skipped: string[] = []
  const rawLines = text.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/)
  const headerLine = rawLines[0] ?? ""
  if (headerLine.trim() === "") {
    return {
      accounts: [],
      ignoredColumns,
      duplicates,
      skipped,
      headerOk: false,
      missingHeaders: REQUIRED_NAMES,
    }
  }

  const delim = detectDelimiter(headerLine)
  const cols: Partial<Record<FieldKey, number>> = {}
  splitCsvLine(headerLine, delim).forEach((raw, idx) => {
    const name = raw.trim()
    if (name === "" || KNOWN_UNUSED_HEADERS.has(name)) return
    const field = CSV_HEADERS[name]
    if (field === undefined) {
      ignoredColumns.push(name)
      return
    }
    if (cols[field] === undefined) cols[field] = idx
  })

  const missingHeaders = REQUIRED_NAMES.filter(
    (name) => cols[CSV_HEADERS[name] as FieldKey] === undefined,
  )
  if (missingHeaders.length > 0) {
    return {
      accounts: [],
      ignoredColumns,
      duplicates,
      skipped,
      headerOk: false,
      missingHeaders,
    }
  }

  const at = (fields: string[], col: number | undefined): string =>
    col === undefined ? "" : (fields[col] ?? "").trim()

  const accounts: RozvrhAccount[] = []
  const seen = new Set<string>()
  for (let i = 1; i < rawLines.length; i++) {
    const line = rawLines[i]
    if (line === undefined || line.trim() === "") continue
    const f = splitCsvLine(line, delim)

    const ucet = at(f, cols.ucet)
    const nazev = at(f, cols.nazev)
    if (ucet === "") {
      skipped.push(
        `\u0159\u00E1dek ${i + 1}: chyb\u00ED \u010D\u00EDslo \u00FA\u010Dtu`,
      )
      continue
    }
    if (nazev === "") {
      skipped.push(
        `\u0159\u00E1dek ${i + 1}: \u00FA\u010Det ${ucet} nem\u00E1 n\u00E1zev`,
      )
      continue
    }
    if (seen.has(ucet)) {
      duplicates.push(
        `\u0159\u00E1dek ${i + 1}: \u00FA\u010Det ${ucet} je uveden v\u00EDcekr\u00E1t`,
      )
      continue
    }
    seen.add(ucet)

    const account: RozvrhAccount = { ucet, nazev }
    if (cols.opravkovy !== undefined) {
      account.opravkovy = parseOpravkovy(at(f, cols.opravkovy))
    }
    accounts.push(account)
  }

  return {
    accounts,
    ignoredColumns,
    duplicates,
    skipped,
    headerOk: true,
    missingHeaders: [],
  }
}

const OSNOVA_EXACT = new Map(OSNOVA.map((a) => [a.ucet, a]))
const OSNOVA_BY_SYNTETICKY = (() => {
  const out = new Map<string, (typeof OSNOVA)[number]>()
  for (const acc of OSNOVA) {
    const syn = acc.ucet.slice(0, 3)
    if (!out.has(syn)) out.set(syn, acc)
  }
  return out
})()

/**
 * Resolve an account name: the loaded rozvrh's exact account, then the směrná
 * osnova's exact account, then the osnova's syntetický účet.
 *
 * There is deliberately no "rozvrh by synthetic" tier. An analytický účet's name
 * describes that one account — 475017 is one byt — so lending it to an unlisted
 * sibling of the same synthetic would state something false. An account the
 * rozvrh does not list falls back to the statutory name, which is generic but
 * never wrong.
 */
export function buildNameLookup(
  rozvrh?: readonly RozvrhAccount[],
): (ucet: string) => string {
  const own = new Map<string, string>()
  for (const acc of rozvrh ?? []) {
    if (acc.nazev !== "" && !own.has(acc.ucet)) own.set(acc.ucet, acc.nazev)
  }
  return (ucet) =>
    own.get(ucet) ??
    OSNOVA_EXACT.get(ucet)?.nazev ??
    OSNOVA_BY_SYNTETICKY.get(ucet.slice(0, 3))?.nazev ??
    ""
}

/**
 * Resolve the opravkovy flag: the rozvrh's exact account, then the osnova's
 * exact account, then its syntetický účet — an analytika of 08x is an oprávkový
 * účet because 08x is one.
 *
 * This flag redirects an account onto the korekce column of its asset leaf when
 * the mapping table points at a brutto cell, and every 07x/08x/09x/19x/29x/39x
 * synthetic is already mapped straight to korekce, so it changes no výkaz value
 * today. It is carried faithfully because it is part of the chart the user
 * imports and exports.
 */
export function buildOpravkovyLookup(
  rozvrh?: readonly RozvrhAccount[],
): (ucet: string) => boolean {
  const own = new Map<string, boolean>()
  for (const acc of rozvrh ?? []) {
    if (acc.opravkovy !== undefined && !own.has(acc.ucet)) {
      own.set(acc.ucet, acc.opravkovy)
    }
  }
  return (ucet) =>
    own.get(ucet) ??
    OSNOVA_EXACT.get(ucet)?.opravkovy ??
    OSNOVA_BY_SYNTETICKY.get(ucet.slice(0, 3))?.opravkovy ??
    false
}
