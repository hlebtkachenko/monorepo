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

/**
 * A statutory rate a doklad can carry.
 *
 * 21 and 12 are the rates in force from 1.1.2024. 15 and 10 exist only for a
 * plnění s DPPD do 31.12.2023 — an oprava of an older doklad still has to be
 * filed at the rate that applied then, and the kontrolní hlášení keeps a third
 * bucket for exactly that.
 */
export type DphSazba = 21 | 15 | 12 | 10 | 0

/** Which KH rate bucket a sazba files into (1 základní, 2 první snížená, 3 druhá). */
export function sazbaBucket(sazba: DphSazba): 1 | 2 | 3 | 0 {
  if (sazba === 21) return 1
  if (sazba === 15 || sazba === 12) return 2
  if (sazba === 10) return 3
  return 0
}

/** Rates retired on 31.12.2023 — valid only on an oprava of an older doklad. */
export const SAZBY_DO_2023: ReadonlySet<DphSazba> = new Set<DphSazba>([15, 10])

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
  sazba: DphSazba
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
  /** Storno row of a NÁSLEDNÉ souhrnné hlášení (`k_storno="A"`). FÚ matches it
   *  against the original on (k_stat, c_vat, k_pln_eu), so a storno and its
   *  replacement carry the same triple and must not be merged together. */
  shStorno?: boolean
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
  /** Which DPH cadence the plátce is on. A přiznání carrying both a měsíc and a
   *  čtvrtletí is rejected, so the two inputs are an either/or, not both. */
  obdobi?: "mesic" | "ctvrt"
  /** Kontrolní hlášení is monthly for a právnická osoba regardless of the DPH
   *  cadence (§ 101e odst. 1), so it carries its own month. */
  khMesic?: string
  /** § 101e odst. 2: a fyzická osoba on a quarterly zdaňovací období files the KH
   *  quarterly too, so the KH cadence is its own choice — not always monthly. */
  khCtvrt?: string
  khObdobi?: "mesic" | "ctvrt"
  /** Souhrnné hlášení cadence follows § 102 odst. 5–6, not the DPH cadence. */
  shMesic?: string
  shCtvrt?: string
  /** Which SH cadence the filer chose. Explicit, because a hlášení carrying both
   *  a měsíc and a čtvrtletí is rejected, and a fallback chain emits both. */
  shObdobi?: "mesic" | "ctvrt"
  /** Kód územního finančního orgánu — `use="required"` on VetaP of all three forms. */
  cUfo?: string
  /** Plátce's own DIČ. Not derivable from IČO: a fyzická osoba registers under a
   *  rodné číslo and a skupinová registrace under CZ699…. */
  dic?: string
  /** Typ daňového subjektu: "P" právnická / "F" fyzická. Required on VetaP. */
  typDs?: "P" | "F"
  /** Druh podání. Each form has its OWN alphabet and they do not overlap:
   *  přiznání B/O/D/E, kontrolní hlášení B/O/N, souhrnné hlášení R/N. */
  forma?: string
  khForma?: string
  shForma?: string
  /** Datum zjištění důvodů — required on a dodatečné přiznání and on a následné
   *  kontrolní hlášení, ignored otherwise. The SH has no equivalent: there a
   *  correction is a následné hlášení carrying storno rows. */
  dZjist?: string
  /** Číslo jednací výzvy, and the reason for answering it (kontrolní hlášení
   *  podané v reakci na výzvu správce daně). */
  cJedVyzvy?: string
  vyzvaOdp?: string
  /** Call-off stock records (§ 18) filed on the souhrnné hlášení as VetaS. */
  callOff?: DphCallOffRow[]
}

/**
 * One call-off stock record (§ 18 ZDPH) — VetaS of the souhrnné hlášení.
 *
 * A separate obligation carried on the same hlášení as the recap rows, and NOT
 * a kód plnění: it has no value, only a counterparty and what happened to the
 * goods.
 */
export interface DphCallOffRow {
  id: string
  /** DIČ předpokládaného pořizovatele, incl. country prefix. */
  dic: string
  /** "1" přeprava do skladu · "2" vrácení nebo oprava chyby · "3" změna pořizovatele. */
  kod: string
  /** DIČ PŮVODNÍHO pořizovatele — required by the schema when kód is "3". */
  dicPuvodni?: string
}

export function blankCallOffRow(id: string): DphCallOffRow {
  return { id, dic: "", kod: "1" }
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

// "Daň" is required as a COLUMN (its cells may legitimately be blank on
// osvobozená plnění). Without it a header typo like "Daň celkem" was silently
// ignored and every daň filed as zero, while the kontrolní vazby — which compare
// only the základ — stayed green.
const REQUIRED = ["Směr", "DPPD", "Řádek", "Základ", "Daň"]

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

/** The KH sections a row may name \u2014 anything else is a typo, not a section. */
export const KH_SEKCE_SET: ReadonlySet<string> = new Set<KhSekce>([
  "A1", "A2", "A4", "A5", "B1", "B2", "B3",
]) // prettier-ignore

/**
 * Normalize a sazba cell to a statutory rate.
 *
 * Both the CSV and the workbook feed this. A cell formatted as a PERCENTAGE is
 * stored by Excel as the fraction `0.21`, and the module used to strip
 * non-digits, turn that into "021", fail an `=== "21"` comparison and fall
 * through to 0 \u2014 which drops the doklad out of the kontroln\u00ED hl\u00E1\u0161en\u00ED while the
 * p\u0159izn\u00E1n\u00ED keeps it, the exact mismatch EPO issues a v\u00FDzva for. Anything between
 * 0 and 1 is therefore read as a fraction.
 *
 * `ok: false` marks a non-empty cell that is not a rate the law recognises. From
 * 1.1.2024 there are two: 21 % and a single sn\u00ED\u017Een\u00E1 12 %.
 */
export function parseSazba(v: string): { sazba: DphSazba; ok: boolean } {
  const text = v.replace(/[\s\u00A0\u202F%]/g, "").replace(",", ".")
  if (text === "") return { sazba: 0, ok: true }
  const n = Number(text)
  if (!Number.isFinite(n)) return { sazba: 0, ok: false }
  const pct = n > 0 && n < 1 ? n * 100 : n
  const rounded = Math.round(pct)
  if (rounded === 21) return { sazba: 21, ok: true }
  if (rounded === 15) return { sazba: 15, ok: true }
  if (rounded === 12) return { sazba: 12, ok: true }
  if (rounded === 10) return { sazba: 10, ok: true }
  if (rounded === 0) return { sazba: 0, ok: true }
  return { sazba: 0, ok: false }
}

/**
 * Parse an amount cell as written by a human in Czech Excel.
 *
 * `value: undefined` means the cell was blank; `ok: false` means it held
 * something that is not a number. The distinction matters: a blank amount is
 * inherited from the den\u00EDk, whereas an unparseable one used to silently become 0
 * and file an understated return.
 *
 * Accepted: "1 234,50" (incl. nbsp / narrow nbsp), "1.234,50", "1,234.50",
 * "1 234,50 K\u010D", "(1 234,50)" as negative, and a plain machine "1234.5".
 */
export function parseAmount(v: string): { value?: string; ok: boolean } {
  let text = v.replace(/[\s\u00A0\u202F]/g, "")
  if (text === "") return { ok: true }
  // A trailing currency token is what a \u010Dlovek types, not a parse failure.
  text = text.replace(/(k\u010D|kc|czk)$/i, "")
  // Accounting parentheses are a minus sign.
  let negative = false
  const wrapped = /^\((.*)\)$/.exec(text)
  if (wrapped?.[1] !== undefined) {
    negative = true
    text = wrapped[1]
  }
  if (text.startsWith("-")) {
    negative = !negative
    text = text.slice(1)
  } else if (text.startsWith("+")) {
    text = text.slice(1)
  }
  if (text === "") return { ok: true }

  const lastComma = text.lastIndexOf(",")
  const lastDot = text.lastIndexOf(".")
  let decimalSep = ""
  if (lastComma >= 0 && lastDot >= 0) {
    // Whichever comes last is the decimal separator; the other groups thousands.
    decimalSep = lastComma > lastDot ? "," : "."
  } else if (lastComma >= 0) {
    decimalSep = ","
  } else if (lastDot >= 0) {
    // A lone dot with exactly three digits behind it is Czech thousands
    // grouping ("1.234"), not a decimal \u2014 Czech Excel writes decimals with a
    // comma. Two digits ("100.50") is a machine-written decimal.
    decimalSep = /\.\d{3}$/.test(text) ? "" : "."
  }

  const whole =
    decimalSep === ""
      ? text.replace(/[.,]/g, "")
      : text.slice(0, text.lastIndexOf(decimalSep)).replace(/[.,]/g, "")
  const frac =
    decimalSep === "" ? "" : text.slice(text.lastIndexOf(decimalSep) + 1)

  if (!/^\d+$/.test(whole) || (frac !== "" && !/^\d+$/.test(frac))) {
    return { ok: false }
  }
  const abs = frac === "" ? whole : `${whole}.${frac}`
  return { value: negative ? `-${abs}` : abs, ok: true }
}

/**
 * Neutralize a spreadsheet formula trigger before a free-text value goes into an
 * exported CSV. The names and pozn\u00E1mky here come from third-party files the user
 * imports, and a cell starting `=`/`+`/`-`/`@` executes when the export is
 * reopened in Excel or LibreOffice.
 */
function safeText(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
}

/**
 * Parse the evidence CSV. Pure: text in, rows out.
 *
 * `idPrefix` namespaces the generated row ids. The caller passes a fresh one per
 * import, because importing a second file appends to the existing evidence and a
 * parse-local index alone would regenerate ids that already exist — two unrelated
 * dokladu would then edit and delete as one.
 */
export function parseDphEvidenceCsv(
  text: string,
  idPrefix = "csv",
): DphEvidenceParseResult {
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

    const sazba = parseSazba(at(f, cols.sazba))
    if (!sazba.ok) {
      skipped.push(
        `Řádek ${i + 1}: sazba „${at(f, cols.sazba)}“ není 21 %, 12 % ani nula — řádek je vynechán.`,
      )
      continue
    }
    const zaklad = parseAmount(at(f, cols.zaklad))
    const dan = parseAmount(at(f, cols.dan))
    if (!zaklad.ok || !dan.ok) {
      skipped.push(
        `Řádek ${i + 1}: základ nebo daň není číslo — řádek je vynechán, aby se nezaložil nulou.`,
      )
      continue
    }

    const row: DphEvidenceRow = {
      id: `${idPrefix}-${i}`,
      smer,
      dppd: at(f, cols.dppd),
      evc: at(f, cols.evc),
      dic: at(f, cols.dic).replace(/\s/g, "").toUpperCase(),
      radek,
      sazba: sazba.sazba,
      zaklad: zaklad.value ?? "",
      dan: dan.value ?? "",
    }
    const nazev = at(f, cols.nazev)
    if (nazev) row.nazev = nazev
    // Every dot, not just the first: "B.2." used to normalize to "B2." and then
    // match no section at all, dropping the doklad out of the kontrolní hlášení.
    const kh = at(f, cols.khSekce).toUpperCase().replace(/\./g, "")
    if (kh && !KH_SEKCE_SET.has(kh)) {
      skipped.push(
        `Řádek ${i + 1}: „${at(f, cols.khSekce)}“ není sekce kontrolního hlášení — řádek je vynechán.`,
      )
      continue
    }
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
      safeText(r.evc),
      safeText(r.dic),
      safeText(r.nazev ?? ""),
      r.radek,
      r.sazba === 0 ? "" : String(r.sazba),
      r.zaklad,
      r.dan,
      r.khSekce ?? "",
      safeText(r.kodPredPl ?? ""),
      safeText(r.kodRezimPl ?? ""),
      r.zdph44 ?? "",
      r.pomer ?? "",
      r.shKod ?? "",
      safeText(r.poznamka ?? ""),
    ]
      .map((v) => csvField(v))
      .join(";"),
  )
  return `\uFEFF${[CSV_TEMPLATE_HEADERS.join(";"), ...body].join("\r\n")}\r\n`
}
