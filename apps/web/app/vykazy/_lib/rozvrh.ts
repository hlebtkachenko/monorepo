// Účetní rozvrh — the entity's OWN chart of accounts, layered on top of the
// směrná účtová osnova (_data/osnova.ts).
//
// Division of ownership, straight from § 14 zákona o účetnictví:
//   - Syntetický účet (the "XXX" / "XXX000" base) is given by the směrná účtová
//     osnova. Its name and its výkaz placement are law, not user data, so both
//     are read-only here — an imported row that tries to change them is warned
//     about and dropped.
//   - Analytický účet ("311100", "395002", …) is the účetní jednotka's own. Its
//     name AND its výkaz placement belong to the user: the same synthetic can
//     carry analytics that report on different řádky (395 vnitřní zúčtování is
//     the classic one — some analytics are a pohledávka, others a závazek).
//
// This module is the single place that answers, for ANY account number appearing
// in the deník:
//   resolveNazev()     — what is it called (rozvrh -> osnova exact -> synthetic)
//   resolveTarget()    — where does it report (rozvrh override -> law mapping,
//                        applied in mapping.ts, which owns the law table)
//   resolveOpravkovy() — is it a correction account (rozvrh -> osnova)
//
// The rozvrh travels inside VykazyDoc (JSON export + localStorage) and moves in
// and out as CSV — semicolon-delimited, UTF-8 with BOM, same conventions as the
// deník CSV.

import { OSNOVA } from "../_data/osnova"
import { rozvahaAktiva, rozvahaPasiva } from "../_data/rozvaha"
import { VZZ } from "../_data/vzz"
import { splitCsvLine } from "./denik"
import type { StatementKey } from "./storage"
import type { CasoveRozliseni } from "./types"

/** One line of the účetní rozvrh. */
export interface RozvrhAccount {
  /** Account number as it is booked in the deník, e.g. "311100". */
  ucet: string
  /** The entity's own name. Empty = fall back to the osnova name. */
  nazev: string
  /** Placement override — which statement this account reports on. Analytické
   * účty only; absent = the law mapping of its syntetický účet. */
  vykaz?: StatementKey
  /** Leaf řádek inside `vykaz` (e.g. "067"). Set together with `vykaz`. */
  rada?: string
  /** Correction account (oprávky / opravné položky): reports in the korekce
   * column of its asset leaf instead of brutto. */
  opravkovy?: boolean
}

export interface RozvrhParseResult {
  accounts: RozvrhAccount[]
  warnings: string[]
  headerOk: boolean
  missingHeaders: string[]
  /** Header columns that were not recognized (ignored, not an error). */
  ignoredColumns: string[]
}

// --- account-number shape ----------------------------------------------------

/** First three digits — the syntetický účet the number belongs to. */
export function syntetickyOf(ucet: string): string {
  return ucet.trim().slice(0, 3)
}

/**
 * Is this the syntetický účet itself (law-owned), rather than an analytika?
 * "311" and the "XXX000" base form both are; "311100" is not.
 */
export function isSynteticky(ucet: string): boolean {
  const clean = ucet.trim()
  return clean.length <= 3 || /^\d{3}0*$/.test(clean)
}

// --- osnova lookups ----------------------------------------------------------

const OSNOVA_BY_UCET = new Map(OSNOVA.map((acc) => [acc.ucet, acc]))
const OSNOVA_BY_SYNTETICKY = (() => {
  const out = new Map<string, (typeof OSNOVA)[number]>()
  for (const acc of OSNOVA) {
    const syn = acc.ucet.slice(0, 3)
    if (!out.has(syn)) out.set(syn, acc)
  }
  return out
})()

/** Osnova name for an account: exact 6-digit hit, else its syntetický účet. */
export function osnovaNazev(ucet: string): string {
  const clean = ucet.trim()
  return (
    OSNOVA_BY_UCET.get(clean)?.nazev ??
    OSNOVA_BY_SYNTETICKY.get(syntetickyOf(clean))?.nazev ??
    ""
  )
}

/** Osnova opravkovy flag: exact hit, else the syntetický účet's flag. */
export function osnovaOpravkovy(ucet: string): boolean {
  const clean = ucet.trim()
  return (
    OSNOVA_BY_UCET.get(clean)?.opravkovy ??
    OSNOVA_BY_SYNTETICKY.get(syntetickyOf(clean))?.opravkovy ??
    false
  )
}

// --- resolution over a loaded rozvrh -----------------------------------------

export type RozvrhIndex = Map<string, RozvrhAccount>

export function buildRozvrhIndex(rozvrh: RozvrhAccount[]): RozvrhIndex {
  return new Map(rozvrh.map((acc) => [acc.ucet.trim(), acc]))
}

/** Display name: the entity's own name first, then the osnova. */
export function resolveNazev(ucet: string, index: RozvrhIndex): string {
  const own = index.get(ucet.trim())?.nazev.trim()
  return own !== undefined && own !== "" ? own : osnovaNazev(ucet)
}

/** Correction-account flag: the rozvrh wins, then the osnova. */
export function resolveOpravkovy(ucet: string, index: RozvrhIndex): boolean {
  const own = index.get(ucet.trim())
  return own?.opravkovy ?? osnovaOpravkovy(ucet)
}

/** The account's placement override, or null when the law mapping applies. */
export function resolvePlacement(
  ucet: string,
  index: RozvrhIndex,
): { vykaz: StatementKey; rada: string } | null {
  const own = index.get(ucet.trim())
  if (!own?.vykaz || !own.rada) return null
  if (isSynteticky(own.ucet)) return null // syntetický = law-placed
  return { vykaz: own.vykaz, rada: own.rada }
}

// --- valid placement targets -------------------------------------------------

/**
 * The leaf řádky an account may be placed on, per statement. Leaves only: a calc
 * řádek is the sum of its children, and posting an account straight onto it
 * would double-count. Both časové-rozlišení layouts are accepted (mapping.ts
 * moves a "D" target onto its "C" counterpart when that layout is selected).
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

/** Label of one leaf řádek, or "" when it is not part of that layout. */
export function leafLabel(
  vykaz: StatementKey,
  rada: string,
  crVariant: CasoveRozliseni,
): string {
  return leafOptions(vykaz, crVariant).find((o) => o.rada === rada)?.label ?? ""
}

/** Short name of a statement, for the picker and the "dle vyhlášky" hint. */
export const VYKAZ_NAZEV: Record<StatementKey, string> = {
  "rozvaha-aktiva": "Aktiva",
  "rozvaha-pasiva": "Pasiva",
  vzz: "VZZ",
}

// --- CSV ---------------------------------------------------------------------

/** CSV label <-> StatementKey. "Aktiva" / "Pasiva" / "VZZ", empty = law mapping. */
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

/** Ordered columns of the rozvrh CSV (export + template). */
export const ROZVRH_CSV_HEADERS = [
  "Účet",
  "Název",
  "Výkaz",
  "Řádek",
  "Opravkový",
] as const

type RozvrhField = "ucet" | "nazev" | "vykaz" | "rada" | "opravkovy"

/** CSV header name -> field (a few spelling variants accepted). */
const CSV_HEADERS: Record<string, RozvrhField> = {
  Účet: "ucet",
  Ucet: "ucet",
  "Číslo účtu": "ucet",
  Název: "nazev",
  Nazev: "nazev",
  Popis: "nazev",
  Výkaz: "vykaz",
  Vykaz: "vykaz",
  Řádek: "rada",
  Radek: "rada",
  "Číslo řádku": "rada",
  Opravkový: "opravkovy",
  Opravkovy: "opravkovy",
  Korekce: "opravkovy",
}

const CSV_REQUIRED_NAMES = ["Účet", "Název"]

function detectDelimiter(headerLine: string): string {
  const semis = (headerLine.match(/;/g) ?? []).length
  const commas = (headerLine.match(/,/g) ?? []).length
  return commas > semis ? "," : ";"
}

/** A cell that may contain a delimiter/quote is quoted, CSV-style. */
function csvCell(value: string): string {
  return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function parseBool(value: string): boolean {
  return /^(1|ano|true|x|y|yes)$/i.test(value.trim())
}

/** Serialize a rozvrh as CSV (BOM + header + one line per account). */
export function rozvrhCsv(accounts: RozvrhAccount[]): string {
  const lines = [ROZVRH_CSV_HEADERS.join(";")]
  for (const acc of accounts) {
    lines.push(
      [
        acc.ucet,
        acc.nazev,
        acc.vykaz ? VYKAZ_LABEL[acc.vykaz] : "",
        acc.rada ?? "",
        acc.opravkovy ? "ano" : "",
      ]
        .map(csvCell)
        .join(";"),
    )
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`
}

/**
 * Parse a rozvrh CSV. Header matched by name, so column order and extra columns
 * don't matter; only Účet + Název are required.
 *
 * Rows are dropped (with a warning) when the account number is not 3–6 digits.
 * A placement is dropped, keeping the row, when it names an unknown statement, a
 * řádek that is not a leaf of it, or an account that is a syntetický účet — the
 * law places those, so the file cannot move them.
 */
export function parseRozvrhCsv(text: string): RozvrhParseResult {
  const warnings: string[] = []
  const ignoredColumns: string[] = []
  const clean = text.replace(/^\uFEFF/, "")
  const rawLines = clean.split(/\r\n|\n|\r/)
  const headerLine = rawLines[0] ?? ""
  if (headerLine.trim() === "") {
    return {
      accounts: [],
      warnings: ["Prázdný soubor."],
      headerOk: false,
      missingHeaders: CSV_REQUIRED_NAMES,
      ignoredColumns,
    }
  }

  const delim = detectDelimiter(headerLine)
  const header = splitCsvLine(headerLine, delim).map((h) => h.trim())
  const cols: Partial<Record<RozvrhField, number>> = {}
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
    (name) => cols[CSV_HEADERS[name] as RozvrhField] === undefined,
  )
  if (missingHeaders.length > 0) {
    return {
      accounts: [],
      warnings,
      headerOk: false,
      missingHeaders,
      ignoredColumns,
    }
  }

  const at = (fields: string[], col: number | undefined): string =>
    col === undefined ? "" : (fields[col] ?? "").trim()

  const accounts: RozvrhAccount[] = []
  const seen = new Set<string>()
  for (let i = 1; i < rawLines.length; i++) {
    const line = rawLines[i]
    if (line === undefined || line.trim() === "") continue
    const fields = splitCsvLine(line, delim)

    const ucet = at(fields, cols.ucet).replace(/\s/g, "")
    if (ucet === "") continue
    if (!/^\d{3,6}$/.test(ucet)) {
      warnings.push(`Řádek ${i + 1}: "${ucet}" není číslo účtu (3–6 číslic).`)
      continue
    }
    if (seen.has(ucet)) {
      warnings.push(`Řádek ${i + 1}: účet ${ucet} je v souboru dvakrát.`)
      continue
    }
    seen.add(ucet)

    const account: RozvrhAccount = { ucet, nazev: at(fields, cols.nazev) }

    const opravkovy = at(fields, cols.opravkovy)
    if (opravkovy !== "" && parseBool(opravkovy)) account.opravkovy = true

    const vykazRaw = at(fields, cols.vykaz)
    const rada = at(fields, cols.rada).padStart(3, "0")
    if (vykazRaw !== "") {
      const vykaz = VYKAZ_BY_LABEL[vykazRaw.toLowerCase()]
      if (!vykaz) {
        warnings.push(
          `Řádek ${i + 1}: neznámý výkaz "${vykazRaw}" (Aktiva / Pasiva / VZZ).`,
        )
      } else if (isSynteticky(ucet)) {
        warnings.push(
          `Řádek ${i + 1}: účet ${ucet} je syntetický — zařazení do výkazu určuje vyhláška, nelze je přepsat.`,
        )
      } else if (!isLeafRada(vykaz, rada)) {
        warnings.push(
          `Řádek ${i + 1}: řádek ${rada} není vstupní položkou výkazu ${VYKAZ_LABEL[vykaz]}.`,
        )
      } else {
        account.vykaz = vykaz
        account.rada = rada
      }
    }

    accounts.push(account)
  }

  return {
    accounts,
    warnings,
    headerOk: true,
    missingHeaders: [],
    ignoredColumns,
  }
}

/**
 * The rozvrh to hand the user as a starting point: every account that appears in
 * the deník, merged with what the rozvrh already says about it, sorted. Names
 * fall back to the osnova so the exported file is readable and re-importable.
 */
export function seedRozvrh(
  ucty: string[],
  rozvrh: RozvrhAccount[],
): RozvrhAccount[] {
  const index = buildRozvrhIndex(rozvrh)
  const numbers = new Set([...ucty, ...rozvrh.map((acc) => acc.ucet)])
  return [...numbers]
    .map((ucet) => {
      const own = index.get(ucet)
      const account: RozvrhAccount = {
        ucet,
        nazev: own?.nazev?.trim() ? own.nazev : osnovaNazev(ucet),
      }
      if (own?.vykaz && own.rada) {
        account.vykaz = own.vykaz
        account.rada = own.rada
      }
      if (own?.opravkovy) account.opravkovy = true
      return account
    })
    .sort((a, b) => a.ucet.localeCompare(b.ucet, "cs"))
}
