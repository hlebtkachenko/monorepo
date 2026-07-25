// Document (de)serialization for the Výkazy builder: the whole editable state
// as one JSON blob, plus JSON file export/import and localStorage persistence.
// External input (imported files, stored blobs) is normalized at this boundary.

import { rozvahaAktiva, rozvahaPasiva } from "../_data/rozvaha"
import { VZZ } from "../_data/vzz"
import { inRozsah } from "./rozsah"
import type {
  CasoveRozliseni,
  ColKey,
  OrgConfig,
  Rozsah,
  VykazLine,
  VykazStatement,
  VykazValues,
} from "./types"
import type { DenikRow } from "./denik"

/**
 * 3 — rozvaha renumbered onto the current příloha č. 1 (A.IV. merged into two
 *     položky, both časové-rozlišení variants numbered in place); `rozsah` split
 *     into the two zkrácený variants of § 3a odst. 2. Docs at version ≤ 2 are
 *     migrated by migrateRozvahaRadky() on import / hydration.
 */
export const DOC_VERSION = 3
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
  /** Which časové-rozlišení layout the rozvaha uses (§ 3 odst. 3 a 4 vyhlášky). */
  crVariant: CasoveRozliseni
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
  /** Označení + text per řádek, written by the downloadable template so the file
   * is fillable by hand. Documentation only — the import ignores it. */
  popis?: {
    rozvahaAktiva: Record<string, string>
    rozvahaPasiva: Record<string, string>
    vzz: Record<string, string>
  }
  minule: {
    rozvahaAktiva: Record<string, number>
    rozvahaPasiva: Record<string, number>
    vzz: Record<string, number>
  }
}

/** All-empty identification block — no org or personal data hardcoded. */
function emptyOrg(): OrgConfig {
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
    crVariant: "D",
  }
}

// --- v2 -> v3 řádek migration ------------------------------------------------

/**
 * Aktiva: everything from the old "C.III." (068) down shifted by +4 to make room
 * for the "C.II.3. Časové rozlišení aktiv" block at 068–071.
 */
const AKTIVA_V2_TO_V3: Record<string, string> = {
  "068": "072",
  "069": "073",
  "070": "074",
  "071": "075",
  "072": "076",
  "073": "077",
  "074": "078",
  "075": "079",
  "076": "080",
  "077": "081",
}

/**
 * Pasiva: the v2 doc still split A.IV into three položky (019 Nerozdělený zisk,
 * 020 Neuhrazená ztráta, 021 Jiný VH). The current form has two, so 019 and 020
 * are ADDED together onto 019, 021 becomes 020, everything up to the old 063
 * shifts one up, and the old "D." block (064–066) moves to 066–068 to leave room
 * for "C.III. Časové rozlišení pasiv".
 */
function pasivaV2ToV3(rada: string): string {
  const n = Number(rada)
  if (!Number.isInteger(n) || n < 1) return rada
  if (n <= 19) return rada
  if (n === 20) return "019"
  if (n <= 63) return String(n - 1).padStart(3, "0")
  if (n <= 66) return String(n + 2).padStart(3, "0")
  return rada
}

function remapValues(
  values: VykazValues,
  remap: (rada: string) => string,
): VykazValues {
  const out: VykazValues = {}
  for (const [rada, cells] of Object.entries(values)) {
    const target = remap(rada)
    const existing = out[target]
    if (!existing) {
      out[target] = { ...cells }
      continue
    }
    // Two old řádky merged into one (A.IV.1 + A.IV.2) — sum every column.
    for (const col of VALUE_COLS) {
      const add = cells[col]
      if (add === undefined) continue
      existing[col] = (existing[col] ?? 0) + add
    }
  }
  return out
}

/** Rewrite the `${rada}:${col}` override keys of one statement. */
function remapOverrides(
  keys: string[],
  remap: (rada: string) => string,
): string[] {
  const out = keys.map((key) => {
    const sep = key.indexOf(":")
    if (sep < 0) return key
    return `${remap(key.slice(0, sep))}${key.slice(sep)}`
  })
  return [...new Set(out)]
}

/**
 * Move a pre-v3 statement's `${rada}:${col}` override keys onto the current
 * řádek numbers. Exported because the deník blob keeps its own copy of these
 * sets, outside the VykazyDoc — see org-context loadDenikLocal.
 */
export function migrateOverrideKeys(
  keys: string[],
  statement: "rozvaha-aktiva" | "rozvaha-pasiva",
  version: number,
): string[] {
  if (version >= 3) return keys
  return remapOverrides(
    keys,
    statement === "rozvaha-aktiva"
      ? (rada) => AKTIVA_V2_TO_V3[rada] ?? rada
      : pasivaV2ToV3,
  )
}

/** Move a pre-v3 document's rozvaha values onto the current řádek numbers. */
export function migrateRozvahaRadky(doc: VykazyDoc): VykazyDoc {
  if (doc.version >= 3) return doc
  const aktiva = (rada: string): string => AKTIVA_V2_TO_V3[rada] ?? rada
  const migrated: VykazyDoc = {
    ...doc,
    version: DOC_VERSION,
    values: {
      ...doc.values,
      rozvahaAktiva: remapValues(doc.values.rozvahaAktiva, aktiva),
      rozvahaPasiva: remapValues(doc.values.rozvahaPasiva, pasivaV2ToV3),
    },
  }
  if (doc.overrides) {
    migrated.overrides = {
      ...doc.overrides,
      rozvahaAktiva: remapOverrides(doc.overrides.rozvahaAktiva, aktiva),
      rozvahaPasiva: remapOverrides(doc.overrides.rozvahaPasiva, pasivaV2ToV3),
    }
  }
  return migrated
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

/**
 * A pre-v3 doc only knew "plny" | "zkraceny"; the zkrácený rozsah is now split
 * into the malá / mikro variants of § 3a odst. 2, and the old value maps onto
 * the malá one (the wider of the two).
 */
function coerceRozsah(input: unknown): Rozsah {
  if (input === "mikro") return "mikro"
  if (input === "mala" || input === "zkraceny") return "mala"
  return "plny"
}

/** Coerce arbitrary parsed JSON into a well-formed VykazyDoc. Back-compatible:
 * a v1 doc with no `denik`/`overrides` normalizes to a doc with neither, and a
 * pre-v3 doc is migrated onto the current rozvaha řádek numbers.
 *
 * Throws when `version` is missing or not a number: the version decides whether
 * the rozvaha řádky are migrated, so guessing it would silently reinterpret a v2
 * file's řádky as v3 položky. Every document this app has ever written carries a
 * numeric version, and both callers already handle the throw (the toolbar shows
 * an error, loadLocal falls back to null). */
function normalizeDoc(input: unknown): VykazyDoc {
  const base = emptyDoc()
  if (!isRecord(input)) return base
  if (typeof input.version !== "number") {
    throw new Error("Neplatný soubor výkazů: chybí verze dokumentu.")
  }
  const values = isRecord(input.values) ? input.values : undefined
  const doc: VykazyDoc = {
    version: input.version,
    org: coerceOrg(input.org),
    values: {
      rozvahaAktiva: coerceValues(values?.rozvahaAktiva),
      rozvahaPasiva: coerceValues(values?.rozvahaPasiva),
      vzz: coerceValues(values?.vzz),
    },
    rozsah: coerceRozsah(input.rozsah),
    crVariant: input.crVariant === "C" ? "C" : "D",
  }
  const denik = coerceDenik(input.denik)
  if (denik) doc.denik = denik
  const overrides = coerceOverrides(input.overrides)
  if (overrides) doc.overrides = overrides
  return migrateRozvahaRadky(doc)
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
function isMinuleJson(input: unknown): input is MinuleJson {
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

// --- minulé období template --------------------------------------------------

/** The `rada` tokens a calc line's signed-sum formula references. */
function formulaRefs(formula: string): string[] {
  return formula
    .split(/[+-]/)
    .map((token) => token.trim())
    .filter((token) => token !== "")
}

/**
 * The řádky a prior-year file has to carry for one statement in `rozsah`: every
 * visible leaf, plus every visible calc line that sums at least one řádek the
 * rozsah hides (in a zkrácený rozsah those aggregates are the only numbers the
 * prior-year form printed, and the engine honours an explicit value on a calc
 * line). A calc line whose refs are all visible stays out — it is derived.
 */
function templateLines(statement: VykazStatement, rozsah: Rozsah): VykazLine[] {
  const visible = statement.lines.filter((line) =>
    inRozsah(statement.id, line, rozsah),
  )
  const visibleRadky = new Set(visible.map((line) => line.rada))
  return visible.filter((line) => {
    if (line.kind === "input") return true
    if (!line.formula) return false
    return formulaRefs(line.formula).some((rada) => !visibleRadky.has(rada))
  })
}

function templatePopis(lines: VykazLine[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of lines) out[line.rada] = `${line.ozn} ${line.text}`.trim()
  return out
}

function templateZeros(lines: VykazLine[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const line of lines) out[line.rada] = 0
  return out
}

/**
 * A blank prior-year file for the current rozsah + časové-rozlišení layout:
 * every fillable řádek at 0, with a `popis` block naming each one. Ready to be
 * downloaded, filled in, and fed back through the "Import minulé (JSON)" button.
 */
export function minuleJsonTemplate(
  rozsah: Rozsah,
  crVariant: CasoveRozliseni,
): string {
  const aktiva = templateLines(rozvahaAktiva(crVariant), rozsah)
  const pasiva = templateLines(rozvahaPasiva(crVariant), rozsah)
  const vzz = templateLines(VZZ, rozsah)
  const template: MinuleJson = {
    version: 1,
    kind: "vykazy-minule",
    popis: {
      rozvahaAktiva: templatePopis(aktiva),
      rozvahaPasiva: templatePopis(pasiva),
      vzz: templatePopis(vzz),
    },
    minule: {
      rozvahaAktiva: templateZeros(aktiva),
      rozvahaPasiva: templateZeros(pasiva),
      vzz: templateZeros(vzz),
    },
  }
  return JSON.stringify(template, null, 2)
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
