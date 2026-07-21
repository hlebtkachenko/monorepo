// Document (de)serialization for the Výkazy builder: the whole editable state
// as one JSON blob, plus JSON file export/import and localStorage persistence.
// External input (imported files, stored blobs) is normalized at this boundary.

import type { ColKey, OrgConfig, Rozsah, VykazValues } from "./types"
import type { DenikRow } from "./denik"

export const DOC_VERSION = 2
const STORAGE_KEY = "vykazy-doc"
const VALUE_COLS: ColKey[] = ["brutto", "korekce", "netto", "bezne", "minule"]

/** Which statement a values map belongs to (matches each VykazStatement.id). */
export type StatementKey = "rozvaha-aktiva" | "rozvaha-pasiva" | "vzz"

/**
 * Per-statement value maps. Rozvaha aktiva + pasiva are kept in separate maps:
 * their řádek numbers overlap (both have "001", "022", "046", …) and while the
 * běžné columns are disjoint (aktiva writes brutto/korekce, pasiva writes bezne),
 * the `minule` column is shared, so one map would collide there.
 */
export interface VykazValuesByStatement {
  rozvahaAktiva: VykazValues
  rozvahaPasiva: VykazValues
  vzz: VykazValues
}

/** camelCase key of the values map that a StatementKey selects. */
export const VALUES_KEY: Record<StatementKey, keyof VykazValuesByStatement> = {
  "rozvaha-aktiva": "rozvahaAktiva",
  "rozvaha-pasiva": "rozvahaPasiva",
  vzz: "vzz",
}

/** The full editable document, matching the exported JSON shape. */
export interface VykazyDoc {
  version: number
  org: OrgConfig
  values: VykazValuesByStatement
  rozsah: Rozsah
  /** Raw parsed deník rows (absent when no deník is loaded). Předvaha is rebuilt
   * from these on import; the mapped výkaz numbers already live in `values`. */
  denik?: DenikRow[]
  /** Per-statement `${rada}:${col}` keys the user overrode back to editable
   * (a sourced/deník-derived leaf flipped to a normal input). Absent = none. */
  overrides?: {
    rozvahaAktiva: string[]
    rozvahaPasiva: string[]
    vzz: string[]
  }
}

/**
 * Prior-year ("minulé období") import file — fills ONLY the `minule` column of
 * every statement, independent of the deník import. Each map is keyed by the
 * line's `rada`; the engine derives the totals from these leaf values.
 */
export interface MinuleJson {
  version: 1
  kind: "vykazy-minule"
  minule: {
    rozvahaAktiva: Record<string, number>
    rozvahaPasiva: Record<string, number>
    vzz: Record<string, number>
  }
}

/** All-empty identification block — no org or personal data hardcoded. */
export function emptyOrg(): OrgConfig {
  return {
    nazev: "",
    ico: "",
    sidlo: "",
    psc: "",
    obec: "",
    stat: "Česká republika",
    pravniForma: "",
    predmetPodnikani: "",
    rok: "",
    mesic: "",
    keDni: "",
    sestavenoDne: "",
    schvalenoDne: "",
    vTisicich: true,
  }
}

/** A fresh, empty document. */
export function emptyDoc(): VykazyDoc {
  return {
    version: DOC_VERSION,
    org: emptyOrg(),
    values: { rozvahaAktiva: {}, rozvahaPasiva: {}, vzz: {} },
    rozsah: "plny",
  }
}

// --- boundary coercion -------------------------------------------------------

function asString(v: unknown): string {
  return typeof v === "string" ? v : ""
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

function coerceOrg(input: unknown): OrgConfig {
  const base = emptyOrg()
  if (!isRecord(input)) return base
  return {
    nazev: asString(input.nazev),
    ico: asString(input.ico),
    sidlo: asString(input.sidlo),
    psc: asString(input.psc),
    obec: asString(input.obec),
    stat: input.stat === undefined ? base.stat : asString(input.stat),
    pravniForma: asString(input.pravniForma),
    predmetPodnikani: asString(input.predmetPodnikani),
    rok: asString(input.rok),
    mesic: asString(input.mesic),
    keDni: asString(input.keDni),
    sestavenoDne: asString(input.sestavenoDne),
    schvalenoDne: asString(input.schvalenoDne),
    vTisicich: typeof input.vTisicich === "boolean" ? input.vTisicich : true,
  }
}

function coerceValues(input: unknown): VykazValues {
  const out: VykazValues = {}
  if (!isRecord(input)) return out
  for (const [rada, cells] of Object.entries(input)) {
    if (!isRecord(cells)) continue
    const row: Partial<Record<ColKey, number>> = {}
    for (const col of VALUE_COLS) {
      const v = cells[col]
      if (typeof v === "number" && Number.isFinite(v)) row[col] = v
    }
    if (Object.keys(row).length > 0) out[rada] = row
  }
  return out
}

/** Optional string fields on a DenikRow (kept only when non-empty). */
const DENIK_OPTIONAL_KEYS = [
  "ciziMena",
  "stredisko",
  "zakazka",
  "cinnost",
  "parsym",
  "firma",
  "ic",
] as const

/** Coerce one untrusted entry into a DenikRow, or drop it (non-object). */
function coerceDenikRow(input: unknown): DenikRow | null {
  if (!isRecord(input)) return null
  const row: DenikRow = {
    datum: asString(input.datum),
    tpUD: asString(input.tpUD),
    zdroj: asString(input.zdroj),
    cislo: asString(input.cislo),
    text: asString(input.text),
    md: asString(input.md),
    dal: asString(input.dal),
    castka:
      typeof input.castka === "number" && Number.isFinite(input.castka)
        ? input.castka
        : 0,
  }
  for (const key of DENIK_OPTIONAL_KEYS) {
    const v = input[key]
    if (typeof v === "string" && v !== "") row[key] = v
  }
  return row
}

/** Coerce the `denik` field to a DenikRow[] (dropping malformed rows). Returns
 * undefined when absent, not an array, or empty after filtering (= no deník). */
function coerceDenik(input: unknown): DenikRow[] | undefined {
  if (!Array.isArray(input)) return undefined
  const rows: DenikRow[] = []
  for (const raw of input) {
    const row = coerceDenikRow(raw)
    if (row) rows.push(row)
  }
  return rows.length > 0 ? rows : undefined
}

function coerceStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return input.filter((x): x is string => typeof x === "string")
}

/** Coerce the `overrides` field; undefined when absent/not an object. */
function coerceOverrides(input: unknown): VykazyDoc["overrides"] {
  if (!isRecord(input)) return undefined
  return {
    rozvahaAktiva: coerceStringArray(input.rozvahaAktiva),
    rozvahaPasiva: coerceStringArray(input.rozvahaPasiva),
    vzz: coerceStringArray(input.vzz),
  }
}

/** Coerce arbitrary parsed JSON into a well-formed VykazyDoc. Back-compatible:
 * a v1 doc with no `denik`/`overrides` normalizes to a doc with neither. */
export function normalizeDoc(input: unknown): VykazyDoc {
  const base = emptyDoc()
  if (!isRecord(input)) return base
  const values = isRecord(input.values) ? input.values : undefined
  const doc: VykazyDoc = {
    version: typeof input.version === "number" ? input.version : DOC_VERSION,
    org: coerceOrg(input.org),
    values: {
      rozvahaAktiva: coerceValues(values?.rozvahaAktiva),
      rozvahaPasiva: coerceValues(values?.rozvahaPasiva),
      vzz: coerceValues(values?.vzz),
    },
    rozsah: input.rozsah === "zkraceny" ? "zkraceny" : "plny",
  }
  const denik = coerceDenik(input.denik)
  if (denik) doc.denik = denik
  const overrides = coerceOverrides(input.overrides)
  if (overrides) doc.overrides = overrides
  return doc
}

// --- file export / import ----------------------------------------------------

function sanitizeFilename(name: string): string {
  const ascii = name.normalize("NFKD").replace(/[̀-ͯ]/g, "") // strip diacritics
  return ascii
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
}

function docFilename(doc: VykazyDoc): string {
  const base = [doc.org.nazev, doc.org.rok].filter(Boolean).join("-")
  const slug = sanitizeFilename(base)
  return `${slug || "vykazy"}.json`
}

/** Trigger a browser download of the document as pretty-printed JSON. */
export function exportJson(doc: VykazyDoc): void {
  const blob = new Blob([JSON.stringify(doc, null, 2)], {
    type: "application/json",
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = docFilename(doc)
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

/** Read + normalize a user-selected JSON file into a document. */
export async function importJson(file: File): Promise<VykazyDoc> {
  const text = await file.text()
  return normalizeDoc(JSON.parse(text))
}

// --- minulé období (prior-year) import ---------------------------------------

/** Shape guard for the prior-year import file (kind + version tag). */
export function isMinuleJson(input: unknown): input is MinuleJson {
  return (
    isRecord(input) &&
    input.kind === "vykazy-minule" &&
    input.version === 1 &&
    isRecord(input.minule)
  )
}

function coerceNumberMap(input: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (!isRecord(input)) return out
  for (const [rada, raw] of Object.entries(input)) {
    let n = Number.NaN
    if (typeof raw === "number") n = raw
    else if (typeof raw === "string" && raw.trim() !== "") n = Number(raw)
    if (Number.isFinite(n)) out[rada] = n
  }
  return out
}

/**
 * Read + validate a prior-year JSON file. Throws on a kind/version mismatch;
 * coerces every entry to a finite number and drops the rest.
 */
export async function parseMinuleJson(file: File): Promise<MinuleJson> {
  const parsed: unknown = JSON.parse(await file.text())
  if (!isMinuleJson(parsed)) {
    throw new Error("Neplatný soubor minulého období.")
  }
  return {
    version: 1,
    kind: "vykazy-minule",
    minule: {
      rozvahaAktiva: coerceNumberMap(parsed.minule.rozvahaAktiva),
      rozvahaPasiva: coerceNumberMap(parsed.minule.rozvahaPasiva),
      vzz: coerceNumberMap(parsed.minule.vzz),
    },
  }
}

// --- localStorage persistence ------------------------------------------------

export function saveLocal(doc: VykazyDoc): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(doc))
  } catch {
    // storage full / unavailable (private mode) — non-fatal.
  }
}

export function loadLocal(): VykazyDoc | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return normalizeDoc(JSON.parse(raw))
  } catch {
    return null
  }
}
