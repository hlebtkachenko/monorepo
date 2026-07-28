// Evidence pro účely DPH (§ 100 ZDPH) — the row model the whole DPH module reads.
//
// This is deliberately NOT derived from the účetní deník. The deník is an accounting
// record; § 100 odst. 1 requires a separate evidence "v členění potřebném pro
// sestavení daňového přiznání, souhrnného hlášení nebo kontrolního hlášení", and the
// facts the three filings need simply are not in a deník export: the counterparty's
// DIČ (a deník carries IČ at best), the DPPD as distinct from the účetní datum, the
// supplier's own evidenční číslo that KH B.2 demands, and the §92 kód předmětu
// plnění. A deník also cannot separate an EU acquisition from a domestic §92 PDP or
// a §108 residual — all three post 343 against 343.
//
// So the evidence is entered or imported directly, and the deník stays what it is
// good for: a cross-check (see `_lib/dph-vazby.ts`).
//
// ONE table feeds all three filings. Splitting it would let the přiznání and the
// kontrolní hlášení drift apart, and EPO cross-checks exactly that (Σ A.4 + A.5
// základ against ř.1 + ř.2).

import { csvField, detectDelimiter, splitCsvLine } from "../../_lib/csv"

/** Which side of the books a doklad sits on. */
export type DphSmer = "vystup" | "vstup"

/** Section of the kontrolní hlášení a row belongs to (§ 101c–101i). */
export type KhSekce = "A1" | "A2" | "A4" | "A5" | "B1" | "B2" | "B3"

/**
 * One doklad's VAT facts.
 *
 * Amounts are DECIMAL STRINGS, never `number`. KH files haléře
 * (fractionDigits=2) and 12 % of a float base rounds wrong at the haléř; the
 * formatters in @workspace/filing take strings for the same reason.
 */
export interface DphEvidenceRow {
  /** Stable key for React and for override tracking. */
  id: string
  smer: DphSmer
  /** Datum povinnosti přiznat daň (D.M.YYYY). NOT the účetní datum. */
  dppd: string
  /** Evidenční číslo daňového dokladu — the counterparty's own number on B.2. */
  evc: string
  /** DIČ including country prefix ("CZ12345678", "DE123456789"). */
  dic: string
  /** Název protistrany — never filed, carried so the table is readable. */
  nazev?: string
  /** Řádek přiznání this doklad lands on ("1", "40", "20", …). */
  radek: string
  sazba: 21 | 12 | 0
  /** Základ daně. */
  zaklad: string
  /** Daň. Zero for osvobozená plnění and for the PDP dodavatel side. */
  dan: string
  /** Section of the kontrolní hlášení, or absent when the doklad is not in KH. */
  khSekce?: KhSekce
  /** § 92 kód předmětu plnění (A.1 / B.1). */
  kodPredPl?: string
  /** Kód režimu plnění on A.4: "0" běžný, "1" § 89, "2" § 90. */
  kodRezimPl?: string
  /** § 44 oprava u pohledávek: "N" / "A" / "P". */
  zdph44?: string
  /** § 75 poměrný nárok on B.2: "N" / "A". */
  pomer?: string
  /** Kód plnění for the souhrnné hlášení: "0" / "1" / "2" / "3". */
  shKod?: string
  poznamka?: string
}

/** Values no doklad produces — the §76 koeficient block and the krácený column. */
type DphManualValues = Record<string, string>

/** The module's whole persisted state. */
export interface DphEvidence {
  version: 1
  rows: DphEvidenceRow[]
  manual: DphManualValues
  /** Zdaňovací období — filled from the org config, overridable per filing. */
  rok: string
  mesic?: string
  ctvrt?: string
  /** Kontrolní hlášení is monthly for a právnická osoba regardless of the DPH
   *  cadence (§ 101e odst. 1), so it carries its own month. */
  khMesic?: string
  /** Souhrnné hlášení cadence follows § 102 odst. 5–6, not the DPH cadence. */
  shMesic?: string
  shCtvrt?: string
}

export function emptyEvidence(rok: string): DphEvidence {
  return { version: 1, rows: [], manual: {}, rok }
}

/** A blank row, ready for the table's "add" action. */
export function blankRow(id: string, smer: DphSmer): DphEvidenceRow {
  return {
    id,
    smer,
    dppd: "",
    evc: "",
    dic: "",
    radek: smer === "vystup" ? "1" : "40",
    sazba: 21,
    zaklad: "0",
    dan: "0",
    khSekce: smer === "vystup" ? "A4" : "B2",
  }
}

// --- CSV import / template ---------------------------------------------------
// Same shape as the deník + rozvrh imports the builder already has: semicolon
// delimited (Czech Excel default), UTF-8 with BOM, header matched BY NAME so column
// order and extra columns do not matter.

const CSV_HEADERS: Record<string, keyof DphEvidenceRow> = {
  Směr: "smer",
  Smer: "smer",
  DPPD: "dppd",
  "Ev. číslo": "evc",
  "Evidenční číslo": "evc",
  DIČ: "dic",
  DIC: "dic",
  Název: "nazev",
  Řádek: "radek",
  Radek: "radek",
  Sazba: "sazba",
  Základ: "zaklad",
  Zaklad: "zaklad",
  Daň: "dan",
  Dan: "dan",
  "KH sekce": "khSekce",
  "Kód předmětu plnění": "kodPredPl",
  "Kód režimu": "kodRezimPl",
  "§44": "zdph44",
  Poměr: "pomer",
  "SH kód": "shKod",
  Poznámka: "poznamka",
}

const CSV_TEMPLATE_HEADERS = [
  "Směr",
  "DPPD",
  "Ev. číslo",
  "DIČ",
  "Název",
  "Řádek",
  "Sazba",
  "Základ",
  "Daň",
  "KH sekce",
  "Kód předmětu plnění",
  "Kód režimu",
  "§44",
  "Poměr",
  "SH kód",
  "Poznámka",
] as const

const REQUIRED = ["Směr", "DPPD", "Řádek", "Základ"]

export interface DphEvidenceParseResult {
  rows: DphEvidenceRow[]
  ignoredColumns: string[]
  skipped: string[]
  headerOk: boolean
  missingHeaders: string[]
}

/**
 * The downloadable CSV template: BOM + header + two worked examples.
 *
 * The DIČ cells carry `CZxxxxxxxx` placeholders rather than plausible numbers.
 * This repo is public and a DIČ is personal data (for an OSVČ it is the rodné
 * číslo), so the repo's own gitleaks rule treats a DIČ-shaped literal as a
 * finding — correctly, even for an invented one. The placeholder still shows the
 * expected shape.
 */
export function dphEvidenceCsvTemplate(): string {
  const examples = [
    ["vystup", "15.06.2026", "2026001", "CZxxxxxxxx", "Odběratel s.r.o.", "1", "21", "100000", "21000", "A4", "", "0", "N", "", "", ""], // prettier-ignore
    ["vstup", "20.06.2026", "FP-42", "CZyyyyyyyy", "Dodavatel a.s.", "40", "21", "50000", "10500", "B2", "", "", "N", "N", "", ""], // prettier-ignore
  ]
  const lines = [
    CSV_TEMPLATE_HEADERS.join(";"),
    ...examples.map((r) => r.map((v) => csvField(v)).join(";")),
  ]
  return `\uFEFF${lines.join("\r\n")}\r\n`
}

function normalizeSazba(v: string): 21 | 12 | 0 {
  const n = Number(v.replace(/[^\d]/g, ""))
  return n === 21 ? 21 : n === 12 ? 12 : 0
}

/** Normalize a Czech-formatted amount to a plain decimal string. */
function normalizeAmount(v: string): string {
  const cleaned = v.replace(/[\s\u00A0]/g, "").replace(",", ".")
  if (cleaned === "" || cleaned === "-" || cleaned === "+") return "0"
  return /^-?\d+(\.\d+)?$/.test(cleaned) ? cleaned : "0"
}

/** Parse the evidence CSV. Pure: text in, rows out. */
export function parseDphEvidenceCsv(text: string): DphEvidenceParseResult {
  const ignoredColumns: string[] = []
  const skipped: string[] = []
  const clean = text.replace(/^\uFEFF/, "")
  const rawLines = clean.split(/\r\n|\n|\r/)
  const headerLine = rawLines[0] ?? ""
  if (headerLine.trim() === "") {
    return {
      rows: [],
      ignoredColumns,
      skipped,
      headerOk: false,
      missingHeaders: REQUIRED,
    }
  }

  const delim = detectDelimiter(headerLine)
  const header = splitCsvLine(headerLine, delim).map((h) => h.trim())
  const cols: Partial<Record<keyof DphEvidenceRow, number>> = {}
  header.forEach((name, idx) => {
    if (name === "") return
    const field = CSV_HEADERS[name]
    if (field === undefined) {
      ignoredColumns.push(name)
      return
    }
    if (cols[field] === undefined) cols[field] = idx
  })

  const missingHeaders = REQUIRED.filter(
    (name) => cols[CSV_HEADERS[name] as keyof DphEvidenceRow] === undefined,
  )
  if (missingHeaders.length > 0) {
    return {
      rows: [],
      ignoredColumns,
      skipped,
      headerOk: false,
      missingHeaders,
    }
  }

  const at = (f: string[], col: number | undefined): string =>
    col === undefined ? "" : (f[col] ?? "").trim()

  const rows: DphEvidenceRow[] = []
  for (let i = 1; i < rawLines.length; i++) {
    const line = rawLines[i]
    if (line === undefined || line.trim() === "") continue
    const f = splitCsvLine(line, delim)

    const radek = at(f, cols.radek)
    const smerRaw = at(f, cols.smer).toLowerCase()
    if (radek === "") {
      skipped.push(`Řádek ${i + 1}: chybí číslo řádku přiznání.`)
      continue
    }
    const smer: DphSmer = smerRaw.startsWith("vst") ? "vstup" : "vystup"

    const row: DphEvidenceRow = {
      id: `csv-${i}`,
      smer,
      dppd: at(f, cols.dppd),
      evc: at(f, cols.evc),
      dic: at(f, cols.dic).replace(/\s/g, "").toUpperCase(),
      radek,
      sazba: normalizeSazba(at(f, cols.sazba)),
      zaklad: normalizeAmount(at(f, cols.zaklad)),
      dan: normalizeAmount(at(f, cols.dan)),
    }
    const nazev = at(f, cols.nazev)
    if (nazev) row.nazev = nazev
    const kh = at(f, cols.khSekce).toUpperCase().replace(".", "")
    if (kh) row.khSekce = kh as KhSekce
    const kodPredPl = at(f, cols.kodPredPl)
    if (kodPredPl) row.kodPredPl = kodPredPl
    const kodRezimPl = at(f, cols.kodRezimPl)
    if (kodRezimPl) row.kodRezimPl = kodRezimPl
    const zdph44 = at(f, cols.zdph44)
    if (zdph44) row.zdph44 = zdph44.toUpperCase()
    const pomer = at(f, cols.pomer)
    if (pomer) row.pomer = pomer.toUpperCase()
    const shKod = at(f, cols.shKod)
    if (shKod) row.shKod = shKod
    const poznamka = at(f, cols.poznamka)
    if (poznamka) row.poznamka = poznamka

    rows.push(row)
  }

  return { rows, ignoredColumns, skipped, headerOk: true, missingHeaders: [] }
}

/** Serialize the evidence back to the same CSV shape (round-trips the import). */
export function dphEvidenceToCsv(rows: DphEvidenceRow[]): string {
  const body = rows.map((r) =>
    [
      r.smer,
      r.dppd,
      r.evc,
      r.dic,
      r.nazev ?? "",
      r.radek,
      r.sazba === 0 ? "" : String(r.sazba),
      r.zaklad,
      r.dan,
      r.khSekce ?? "",
      r.kodPredPl ?? "",
      r.kodRezimPl ?? "",
      r.zdph44 ?? "",
      r.pomer ?? "",
      r.shKod ?? "",
      r.poznamka ?? "",
    ]
      .map((v) => csvField(v))
      .join(";"),
  )
  return `\uFEFF${[CSV_TEMPLATE_HEADERS.join(";"), ...body].join("\r\n")}\r\n`
}
