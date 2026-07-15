// Field input contract — the canonical parse/normalize per XSD field TYPE, so a UI
// (the debug tester today, the real filing form tomorrow) accepts only values the
// schema can hold and coerces messy input toward the accepted style, instead of every
// screen re-inventing "does this parse". Mirrors the Czech number semantics of
// `@workspace/ui`'s `parseNumber` (space / NBSP / thin-space thousand separators,
// comma OR dot decimal) but ENFORCES each field's XSD facet (whole koruna, integer
// percent, digit-only DIČ, D.M.YYYY date). Pure + dependency-light so it lives with the
// schema it enforces; a UI binds each field to `fieldTypeFor(...)` → `parseField(...)`.
//
// This is INPUT normalization, not business validity — a value can be well-formed here
// (parses to a legal XML attribute) yet still wrong (bad DIČ checksum, out-of-range
// period). Those are `cz/business-validity.ts` + `cz/fu/dppo/checks.ts` (warn-only).

import Decimal from "decimal.js-light"

/** The XSD field kinds the DPPO forms use. */
export type FieldType =
  | "koruna" // whole-koruna amount (xs:decimal fractionDigits=0)
  | "sazba" // tax rate, whole percent (xs:decimal totalDigits=2)
  | "dic" // DIČ — digits, "CZ" prefix stripped
  | "date" // D.M.YYYY (dateInMultiFormat)
  | "nace" // CZ-NACE numeric code
  | "ufo" // finanční úřad code (numeric)
  | "code1" // single-char code (typ_*, forma)
  | "text" // free text

export interface FieldParse {
  /** The input produced a usable value (or was left empty). */
  ok: boolean
  /** Canonical value for the XML attribute; null when the field is empty. */
  value: string | null
  /** Normalized text to show back in the input box. */
  display: string
  /** Non-blocking normalization note (e.g. rounding applied), never an error. */
  note?: string
  /** Reason the input could not be parsed (set only when `ok` is false). */
  error?: string
}

const EMPTY: FieldParse = { ok: true, value: null, display: "" }

/** Strip Czech thousand separators (space / NBSP / thin space) and unify the decimal. */
function normalizeDecimalString(raw: string): string {
  return raw.replace(/\s/g, "").replace(",", ".")
}

function toDecimalOrNull(s: string): Decimal | null {
  try {
    return new Decimal(s)
  } catch {
    return null
  }
}

/** Whole-koruna amount: accepts messy separators, rounds a decimal to celé Kč. */
export function parseKoruna(raw: string): FieldParse {
  const s = normalizeDecimalString(raw.trim())
  if (s === "" || s === "-") return EMPTY
  const d = toDecimalOrNull(s)
  if (d === null) return { ok: false, value: null, display: raw.trim(), error: "Zadejte číslo." } // prettier-ignore
  const rounded = d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
  const value = rounded.toFixed(0)
  const note = rounded.equals(d) ? undefined : "Zaokrouhleno na celé Kč."
  return { ok: true, value, display: value, note }
}

/** Tax rate as a whole percent (0–99): "21", not "0.21" or "21%". */
export function parseSazba(raw: string): FieldParse {
  const s = normalizeDecimalString(raw.trim().replace(/%/g, ""))
  if (s === "") return EMPTY
  const d = toDecimalOrNull(s)
  if (d === null) return { ok: false, value: null, display: raw.trim(), error: "Zadejte sazbu." } // prettier-ignore
  if (!d.isInteger()) {
    // A fraction like 0.21 is the rate as a decimal — suggest the percent form.
    const asPct = d.times(100)
    const hint = asPct.isInteger() ? ` Nemysleli jste ${asPct.toFixed(0)}?` : ""
    return { ok: false, value: null, display: raw.trim(), error: `Sazba se zadává v celých procentech.${hint}` } // prettier-ignore
  }
  if (d.lt(0) || d.gt(99)) {
    return { ok: false, value: null, display: raw.trim(), error: "Sazba musí být 0–99 %." } // prettier-ignore
  }
  return { ok: true, value: d.toFixed(0), display: d.toFixed(0) }
}

/** DIČ → digits only ("CZ" prefix stripped). Validity (checksum) is a separate layer. */
export function parseDic(raw: string): FieldParse {
  const trimmed = raw.trim()
  if (trimmed === "") return EMPTY
  const digits = trimmed.replace(/^cz/i, "").replace(/\D/g, "")
  if (digits === "") return { ok: false, value: null, display: trimmed, error: "DIČ musí obsahovat číslice." } // prettier-ignore
  return { ok: true, value: digits, display: `CZ${digits}` }
}

/** Normalize a date to the EPO `D.M.YYYY` shape; accepts ISO or a Czech date. */
export function parseEpoDate(raw: string): FieldParse {
  const s = raw.trim()
  if (s === "") return EMPTY
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  const cz = /^(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})$/.exec(s)
  let d: number, m: number, y: number
  if (iso) {
    y = +iso[1]!
    m = +iso[2]!
    d = +iso[3]!
  } else if (cz) {
    d = +cz[1]!
    m = +cz[2]!
    y = +cz[3]!
  } else {
    return {
      ok: false,
      value: null,
      display: s,
      error: "Datum ve tvaru D.M.RRRR.",
    }
  }
  // Calendar validity — reject 31.2., 30.2., 31.4. etc. (the XSD date pattern is lenient).
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return { ok: false, value: null, display: s, error: "Neplatné datum." }
  }
  const value = `${d}.${m}.${y}`
  return { ok: true, value, display: value }
}

/** A numeric code of a bounded digit length (NACE, FÚ). */
function parseDigits(raw: string, maxLen: number, label: string): FieldParse {
  const s = raw.trim().replace(/\s/g, "")
  if (s === "") return EMPTY
  if (!/^\d+$/.test(s)) return { ok: false, value: null, display: s, error: `${label} musí být číslo.` } // prettier-ignore
  if (s.length > maxLen) return { ok: false, value: null, display: s, error: `${label} má nejvýše ${maxLen} číslic.` } // prettier-ignore
  return { ok: true, value: s, display: s }
}

/** A single-character code (typ_*, dapdpp_forma) — uppercased, trimmed to 1 char. */
export function parseCode1(raw: string): FieldParse {
  const s = raw.trim().toUpperCase()
  if (s === "") return EMPTY
  const one = s.slice(0, 1)
  const note = s.length > 1 ? "Jen první znak." : undefined
  return { ok: true, value: one, display: one, note }
}

/** Free text with a max length (from the XSD `maxLength` facet). */
export function parseText(raw: string, maxLen = 255): FieldParse {
  const s = raw.trim()
  if (s === "") return EMPTY
  if (s.length > maxLen) {
    return { ok: true, value: s.slice(0, maxLen), display: s.slice(0, maxLen), note: `Zkráceno na ${maxLen} znaků.` } // prettier-ignore
  }
  return { ok: true, value: s, display: s }
}

/** Parse a raw string against a field type. */
export function parseField(type: FieldType, raw: string): FieldParse {
  switch (type) {
    case "koruna":
      return parseKoruna(raw)
    case "sazba":
      return parseSazba(raw)
    case "dic":
      return parseDic(raw)
    case "date":
      return parseEpoDate(raw)
    case "nace":
      return parseDigits(raw, 6, "NACE")
    case "ufo":
      return parseDigits(raw, 4, "Kód FÚ")
    case "code1":
      return parseCode1(raw)
    case "text":
      return parseText(raw)
  }
}

const HEADER_DATE_ATTRS = new Set([
  "zdobd_od",
  "zdobd_do",
  "zdobd_od_hr",
  "d_zjist",
])
const HEADER_CODE1_ATTRS = new Set([
  "typ_dapdpp",
  "typ_zo",
  "typ_popldpp",
  "dapdpp_forma",
])

/**
 * The field type of a DPPO attribute by věta group + attribute name, so a UI can pick
 * the right parser without a hand-maintained per-field table. VetaO is a wall of
 * whole-koruna amounts with one exception (ř.280 sazba); the header/payer specials are
 * enumerated.
 */
export function fieldTypeFor(
  group: "header" | "payer" | "vetaO",
  attr: string,
): FieldType {
  if (group === "vetaO") {
    if (attr === "kc_ii270_280") return "sazba" // ř.280 sazba (integer percent)
    if (attr === "d_hospvysl") return "date" // datum výsledku hospodaření
    if (attr.startsWith("text_ii")) return "text" // label cells of "jiné úpravy" řádků
    return "koruna" // every kc_ii* amount
  }
  if (group === "payer") return attr === "dic" ? "dic" : "text"
  // header (VetaD)
  if (attr === "c_ufo_cil") return "ufo"
  if (attr === "c_nace") return "nace"
  if (HEADER_DATE_ATTRS.has(attr)) return "date"
  if (HEADER_CODE1_ATTRS.has(attr)) return "code1"
  return "text"
}
