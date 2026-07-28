// Účtový rozvrh (§ 14 zákona č. 563/1991 Sb.) — the accounting unit's OWN chart
// of accounts, imported as CSV. The směrná účtová osnova in _data/osnova.ts is
// synthetic-only reference data, so an analytical account like 475017 falls back
// to its synthetic's generic name ("Dlouhodobé přijaté zálohy") wherever a name
// is rendered. A loaded rozvrh supplies the real one ("Byt 17, ...").
//
// § 14 also splits the ownership of a placement. A syntetický účet's výkaz řádek
// is given by vyhláška 500/2002 Sb. and is not the user's to change. An
// analytický účet's is: the same synthetic can carry analytics that report on
// different řádky — 395 vnitřní zúčtování is the classic one, some analytics are
// a pohledávka and others a závazek. Those overrides ride in the same CSV and
// are resolved by `buildPlacementLookup`, which `mapping.ts` consults before its
// own law table.
//
// Pure: text in, accounts out. No React, no I/O.

import { OSNOVA } from "../_data/osnova"
import { rozvahaAktiva, rozvahaPasiva } from "../_data/rozvaha"
import { VZZ } from "../_data/vzz"
import { csvField, detectDelimiter, splitCsvLine } from "./csv"
import { findHeaderRow, findSheets, headerText, type Cell, type WorkbookSheets } from "./denik" // prettier-ignore
import type { StatementKey } from "./storage"
import type { CasoveRozliseni } from "./types"

export interface RozvrhAccount {
  /** Full account number as it appears in the deník (usually 6 digits). */
  ucet: string
  nazev: string
  /** Účet oprávek / opravných položek — its balance belongs in the korekce column. */
  opravkovy?: boolean
  /** Placement override: which statement this account reports on. Analytické
   * účty only; absent = the vyhláška's placement of its syntetický účet. */
  vykaz?: StatementKey
  /** Leaf řádek inside `vykaz` (e.g. "067"). Only meaningful together with it. */
  rada?: string
}

export interface RozvrhParseResult {
  accounts: RozvrhAccount[]
  ignoredColumns: string[]
  duplicates: string[]
  /** Rows dropped for want of an account number or a name, with their line. */
  skipped: string[]
  /** Placement overrides dropped as not the user's to make, with their line. */
  rejectedPlacements: string[]
  headerOk: boolean
  missingHeaders: string[]
}

type FieldKey = "ucet" | "nazev" | "opravkovy" | "vykaz" | "rada"

const CSV_HEADERS: Record<string, FieldKey> = {
  Účet: "ucet",
  Ucet: "ucet",
  Název: "nazev",
  Nazev: "nazev",
  Oprávkový: "opravkovy",
  Opravkovy: "opravkovy",
  Výkaz: "vykaz",
  Vykaz: "vykaz",
  Řádek: "rada",
  Radek: "rada",
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
const TEMPLATE_HEADERS = [
  "Účet",
  "Název",
  "Oprávkový",
  "Výkaz",
  "Řádek",
] as const

/** "Ano" / "Ne" as the Czech accounting software writes it, plus the usual aliases. */
function parseOpravkovy(v: string): boolean {
  const s = v.trim().toLowerCase()
  return s === "ano" || s === "true" || s === "1" || s === "yes"
}

/** Statement label as the CSV carries it. Empty = the vyhláška's placement. */
const VYKAZ_LABEL: Record<StatementKey, string> = {
  "rozvaha-aktiva": "Aktiva",
  "rozvaha-pasiva": "Pasiva",
  vzz: "VZZ",
}

const VYKAZ_BY_LABEL: Record<string, StatementKey> = {
  aktiva: "rozvaha-aktiva",
  "rozvaha-aktiva": "rozvaha-aktiva",
  pasiva: "rozvaha-pasiva",
  "rozvaha-pasiva": "rozvaha-pasiva",
  vzz: "vzz",
  výsledovka: "vzz",
  vysledovka: "vzz",
}

export function rozvrhCsvTemplate(): string {
  const examples = [
    ["221003", "Bankovní účet EUR: Raiffeisenbank (devizový)", "Ne", "", ""],
    ["475017", "Dlouhodobé přijaté zálohy: Byt 17", "Ne", "", ""],
    ["391001", "Opravná položka k pohledávkám", "Ano", "", ""],
    ["395002", "Vnitřní zúčtování: závazky", "Ne", "Pasiva", "062"],
  ]
  const lines = [
    TEMPLATE_HEADERS.join(";"),
    ...examples.map((r) => r.map((f) => csvField(f)).join(";")),
  ]
  return `\uFEFF${lines.join("\r\n")}\r\n`
}

/** The loaded chart as CSV, in the template's own columns, so an edit made here
 *  can be carried back into the účtový rozvrh sheet it came from. */
export function rozvrhCsv(accounts: readonly RozvrhAccount[]): string {
  const lines = [
    TEMPLATE_HEADERS.join(";"),
    ...[...accounts]
      .sort((a, b) => a.ucet.localeCompare(b.ucet, "cs"))
      .map((a) =>
        [
          a.ucet,
          a.nazev,
          a.opravkovy ? "Ano" : "Ne",
          a.vykaz ? VYKAZ_LABEL[a.vykaz] : "",
          a.vykaz ? (a.rada ?? "") : "",
        ]
          .map((f) => csvField(f))
          .join(";"),
      ),
  ]
  return `﻿${lines.join("\r\n")}\r\n`
}

/**
 * The leaf řádky an account may be placed on, per statement. LEAVES ONLY: a
 * calculated řádek is the sum of its children, so posting an account straight
 * onto one would double-count it. Both časové-rozlišení layouts are collected,
 * since `mapping.ts` moves a "D" target onto its "C" counterpart when that
 * layout is in force.
 */
const LEAF_RADKY: Record<StatementKey, Set<string>> = {
  "rozvaha-aktiva": new Set(
    [...rozvahaAktiva("D").lines, ...rozvahaAktiva("C").lines]
      .filter((line) => line.kind === "input")
      .map((line) => line.rada),
  ),
  "rozvaha-pasiva": new Set(
    [...rozvahaPasiva("D").lines, ...rozvahaPasiva("C").lines]
      .filter((line) => line.kind === "input")
      .map((line) => line.rada),
  ),
  vzz: new Set(
    VZZ.lines.filter((line) => line.kind === "input").map((line) => line.rada),
  ),
}

export function isLeafRada(vykaz: StatementKey, rada: string): boolean {
  return LEAF_RADKY[vykaz].has(rada)
}

/** A syntetický účet is the bare 3-digit number, or a 6-digit one ending 000. */
function isSynteticky(ucet: string): boolean {
  const clean = ucet.trim()
  return clean.length === 3 || /^\d{3}0+$/.test(clean)
}

/**
 * Why a placement override cannot be accepted, or null when it can.
 *
 * Three ways to get it wrong, and the reason each is refused rather than
 * silently corrected: a syntetický účet's řádek is the vyhláška's, not the
 * user's (§ 14); half a placement says nothing; and a non-leaf řádek would be
 * double-counted against the children it sums.
 */
function placementProblem(
  ucet: string,
  vykazRaw: string,
  radaRaw: string,
): string | null {
  const vykaz = VYKAZ_BY_LABEL[vykazRaw.toLowerCase()]
  if (vykazRaw !== "" && vykaz === undefined) {
    return `neznámý výkaz "${vykazRaw}"`
  }
  if (vykaz === undefined || radaRaw === "") {
    return `účet ${ucet}: zařazení vyžaduje výkaz i řádek`
  }
  if (isSynteticky(ucet)) {
    return `účet ${ucet}: syntetický účet zařazuje vyhláška, nelze přepsat`
  }
  if (!isLeafRada(vykaz, radaRaw)) {
    return `účet ${ucet}: řádek ${radaRaw} není součtový list výkazu ${VYKAZ_LABEL[vykaz]}`
  }
  return null
}

/** One selectable placement target: the leaf řádek as the form prints it. */
export interface LeafOption {
  rada: string
  /** "C.II.2.4.6 Jiné pohledávky (067)" — označení, text, číslo řádku. */
  label: string
}

/** The leaf řádky of one statement in the given layout, as picker options. */
export function leafOptions(
  vykaz: StatementKey,
  crVariant: CasoveRozliseni,
): LeafOption[] {
  const statement =
    vykaz === "rozvaha-aktiva"
      ? rozvahaAktiva(crVariant)
      : vykaz === "rozvaha-pasiva"
        ? rozvahaPasiva(crVariant)
        : VZZ
  return statement.lines
    .filter((line) => line.kind === "input")
    .map((line) => ({
      rada: line.rada,
      label: `${line.ozn} ${line.text} (${line.rada})`.trim(),
    }))
}

/** Short name of a statement, for the picker and the "dle vyhlášky" hint. */
export const VYKAZ_NAZEV: Record<StatementKey, string> = VYKAZ_LABEL

export function parseRozvrhCsv(text: string): RozvrhParseResult {
  const ignoredColumns: string[] = []
  const duplicates: string[] = []
  const skipped: string[] = []
  const rejectedPlacements: string[] = []
  const rawLines = text.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/)
  const headerLine = rawLines[0] ?? ""
  if (headerLine.trim() === "") {
    return {
      accounts: [],
      ignoredColumns,
      duplicates,
      skipped,
      rejectedPlacements,
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
      rejectedPlacements,
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

    const vykazRaw = at(f, cols.vykaz)
    const radaRaw = at(f, cols.rada)
    if (vykazRaw !== "" || radaRaw !== "") {
      const reason = placementProblem(ucet, vykazRaw, radaRaw)
      if (reason !== null) {
        rejectedPlacements.push(`\u0159\u00E1dek ${i + 1}: ${reason}`)
      } else {
        account.vykaz = VYKAZ_BY_LABEL[vykazRaw.toLowerCase()]
        account.rada = radaRaw
      }
    }
    accounts.push(account)
  }

  return {
    accounts,
    ignoredColumns,
    duplicates,
    skipped,
    rejectedPlacements,
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

/**
 * Resolve an account's placement override: the loaded rozvrh's exact account, or
 * undefined when the vyhláška's placement of its syntetický účet applies.
 *
 * Exact-match only, like `buildNameLookup` and for the same reason — an
 * analytika's placement describes that one account, and lending it to an
 * unlisted sibling would file a number on the wrong řádek. An override that no
 * longer names a leaf (the CSV was hand-edited, or the layout changed) is
 * dropped here too, so a stale document degrades to the law rather than to a
 * cell that does not exist.
 */
export function buildPlacementLookup(
  rozvrh?: readonly RozvrhAccount[],
): (ucet: string) => { vykaz: StatementKey; rada: string } | undefined {
  const own = new Map<string, { vykaz: StatementKey; rada: string }>()
  for (const acc of rozvrh ?? []) {
    if (acc.vykaz === undefined || acc.rada === undefined) continue
    if (isSynteticky(acc.ucet) || !isLeafRada(acc.vykaz, acc.rada)) continue
    if (!own.has(acc.ucet))
      own.set(acc.ucet, { vykaz: acc.vykaz, rada: acc.rada })
  }
  return (ucet) => own.get(ucet)
}

/** Sheet-tab names accepted for the účtový rozvrh in a multi-sheet workbook. */
const ROZVRH_SHEET_NAMES = [
  "rozvrh",
  "účtový rozvrh",
  "uctovy rozvrh",
  "účtová osnova",
  "uctova osnova",
] as const

/**
 * Read the účtový rozvrh from a sheet of the same workbook that carries the
 * deník, instead of a separate CSV upload.
 *
 * The grid is rendered back to CSV text and handed to `parseRozvrhCsv` rather
 * than re-implementing the column matching: that keeps ONE place where a header
 * name maps to a field, where duplicates are detected and where the known-unused
 * columns of a full rozvrh sheet are tolerated. Cells are quoted so a name
 * containing a semicolon survives the round trip.
 */
export function parseRozvrhSheet(
  sheets: WorkbookSheets,
): RozvrhParseResult & { found: boolean } {
  const found = findSheets(sheets, ROZVRH_SHEET_NAMES)[0]
  if (!found) {
    return {
      accounts: [],
      ignoredColumns: [],
      duplicates: [],
      skipped: [],
      rejectedPlacements: [],
      headerOk: false,
      missingHeaders: [],
      found: false,
    }
  }
  // Same title-band problem as the deník: the header is not row 1. Slice from
  // it before handing the grid to the CSV parser, which does its own matching.
  const headerRow = findHeaderRow(found.grid, (row) => {
    const names = new Set(row.map(headerText))
    return REQUIRED_NAMES.every((n) => names.has(n))
  })
  const csv = found.grid
    .slice(Math.max(headerRow, 0))
    .map((row: Cell[]) =>
      row
        .map((cell: Cell) =>
          cell === null || cell === undefined ? "" : String(cell).trim(),
        )
        .map((v: string) => csvField(v))
        .join(";"),
    )
    .join("\r\n")
  return { ...parseRozvrhCsv(csv), found: true }
}
