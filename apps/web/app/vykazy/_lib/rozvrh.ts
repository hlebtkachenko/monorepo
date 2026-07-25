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
  nameEn?: string
  druh?: string
  typ?: string
  /** Účet oprávek / opravných položek — its balance belongs in the korekce column. */
  opravkovy?: boolean
}

export interface RozvrhParseResult {
  accounts: RozvrhAccount[]
  ignoredColumns: string[]
  duplicates: string[]
  headerOk: boolean
  missingHeaders: string[]
}

type FieldKey = "ucet" | "nazev" | "nameEn" | "druh" | "typ" | "opravkovy"

const CSV_HEADERS: Record<string, FieldKey> = {
  Účet: "ucet",
  Ucet: "ucet",
  Název: "nazev",
  Nazev: "nazev",
  "Název EN": "nameEn",
  "Alternativní název 1": "nameEn",
  Druh: "druh",
  Typ: "typ",
  Oprávkový: "opravkovy",
  Opravkovy: "opravkovy",
}

const REQUIRED_NAMES = ["Účet", "Název"]

const TEMPLATE_HEADERS = [
  "Účet",
  "Název",
  "Název EN",
  "Druh",
  "Typ",
  "Oprávkový",
] as const

/** "Ano" / "Ne" as the Czech accounting software writes it, plus the usual aliases. */
function parseOpravkovy(v: string): boolean {
  const s = v.trim().toLowerCase()
  return s === "ano" || s === "true" || s === "1" || s === "yes"
}

export function rozvrhCsvTemplate(): string {
  const examples = [
    [
      "221003",
      "Bankovní účet EUR: Raiffeisenbank (devizový)",
      "",
      "Rozvahový",
      "Aktivní",
      "Ne",
    ],
    [
      "475017",
      "Dlouhodobé přijaté zálohy: Byt 17",
      "",
      "Rozvahový",
      "Pasivní",
      "Ne",
    ],
    [
      "391001",
      "Opravná položka k pohledávkám",
      "",
      "Rozvahový",
      "Aktivní",
      "Ano",
    ],
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
  const rawLines = text.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/)
  const headerLine = rawLines[0] ?? ""
  if (headerLine.trim() === "") {
    return {
      accounts: [],
      ignoredColumns,
      duplicates,
      headerOk: false,
      missingHeaders: REQUIRED_NAMES,
    }
  }

  const delim = detectDelimiter(headerLine)
  const cols: Partial<Record<FieldKey, number>> = {}
  splitCsvLine(headerLine, delim).forEach((raw, idx) => {
    const name = raw.trim()
    if (name === "") return
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
    if (ucet === "" || nazev === "") continue
    if (seen.has(ucet)) {
      duplicates.push(ucet)
      continue
    }
    seen.add(ucet)

    const account: RozvrhAccount = { ucet, nazev }
    const nameEn = at(f, cols.nameEn)
    if (nameEn) account.nameEn = nameEn
    const druh = at(f, cols.druh)
    if (druh) account.druh = druh
    const typ = at(f, cols.typ)
    if (typ) account.typ = typ
    if (cols.opravkovy !== undefined) {
      account.opravkovy = parseOpravkovy(at(f, cols.opravkovy))
    }
    accounts.push(account)
  }

  return {
    accounts,
    ignoredColumns,
    duplicates,
    headerOk: true,
    missingHeaders: [],
  }
}

interface Index {
  exact: Map<string, string>
  bySynteticky: Map<string, string>
}

function indexNames(
  accounts: readonly { ucet: string; nazev: string }[],
): Index {
  const exact = new Map<string, string>()
  const bySynteticky = new Map<string, string>()
  for (const acc of accounts) {
    if (!exact.has(acc.ucet)) exact.set(acc.ucet, acc.nazev)
    const syn = acc.ucet.slice(0, 3)
    if (!bySynteticky.has(syn)) bySynteticky.set(syn, acc.nazev)
  }
  return { exact, bySynteticky }
}

const OSNOVA_NAMES = indexNames(OSNOVA)

/**
 * Resolve an account name, most specific source first: the loaded rozvrh's exact
 * account, the směrná osnova's exact account, then the same two by 3-digit
 * synthetic prefix. An exact hit always beats a synthetic fallback, so a rozvrh
 * that lists only analytiky of one synthetic never shadows the osnova's own name
 * for a different account of that synthetic.
 */
export function buildNameLookup(
  rozvrh?: readonly RozvrhAccount[],
): (ucet: string) => string {
  if (!rozvrh || rozvrh.length === 0) {
    return (ucet) =>
      OSNOVA_NAMES.exact.get(ucet) ??
      OSNOVA_NAMES.bySynteticky.get(ucet.slice(0, 3)) ??
      ""
  }
  const own = indexNames(rozvrh)
  return (ucet) => {
    const syn = ucet.slice(0, 3)
    return (
      own.exact.get(ucet) ??
      OSNOVA_NAMES.exact.get(ucet) ??
      own.bySynteticky.get(syn) ??
      OSNOVA_NAMES.bySynteticky.get(syn) ??
      ""
    )
  }
}

const OSNOVA_OPRAVKOVY = new Map(OSNOVA.map((a) => [a.ucet, a.opravkovy]))

/**
 * Resolve the opravkovy flag by exact account only (a synthetic fallback would
 * mark every analytika of 39x as a correction account, which is what the direct
 * korekce mapping in mapping.ts already handles). Unknown account = false.
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
  return (ucet) => own.get(ucet) ?? OSNOVA_OPRAVKOVY.get(ucet) ?? false
}
