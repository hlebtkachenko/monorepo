// FÚ EPO `<Pisemnost>` envelope core, shared by every daňový-portál form (DPHDP3,
// DPHKH1, later DPPO). Unlike ISDOC (element-centric), EPO věty are ATTRIBUTE-centric
// and self-closing: `<VetaD k_uladis="DPH" .../>`, never `<field>v</field>`. Values
// are carried in XML attributes; an absent/empty value omits the attribute entirely
// (never `attr=""` — the XSD facets reject empty decimals/dates).
//
// The schema files carry no namespace (elementFormDefault=unqualified, no
// targetNamespace), so the instance is emitted plain, UTF-8.

import Decimal from "decimal.js-light"
import { el, serialize, type XmlAttrs, type XmlNode } from "../../xml/build"

Decimal.set({ rounding: Decimal.ROUND_HALF_EVEN })

/** One attribute value on a věta, before formatting. `undefined`/`null`/"" → omitted. */
export type VetaValue = string | number | null | undefined

/**
 * A self-closing věta `<Tag a="1" b="2"/>`. Only attributes with a real value are
 * emitted; empty strings and nullish values are dropped so the XSD facets (decimal,
 * date, enum) never see an empty attribute.
 */
export function veta(tag: string, attrs: Record<string, VetaValue>): XmlNode {
  const out: XmlAttrs = {}
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue
    const s = typeof v === "number" ? String(v) : v
    if (s === "") continue
    out[k] = s
  }
  return el(tag, [], out)
}

/**
 * Serialize a full FÚ document: `<Pisemnost verzeSW nazevSW><Dokument verzePis>
 * …věty…</Dokument></Pisemnost>`. `documentTag` is `DPHDP3` / `DPHKH1` / …;
 * `vety` are the ordered self-closing children (build them with `veta(...)`).
 */
export function serializePisemnost(opts: {
  documentTag: string
  verzePis?: string
  verzeSW?: string
  nazevSW?: string
  vety: XmlNode[]
}): string {
  const docAttrs: XmlAttrs = {}
  if (opts.verzePis) docAttrs.verzePis = opts.verzePis
  const pisemnostAttrs: XmlAttrs = {}
  if (opts.verzeSW) pisemnostAttrs.verzeSW = opts.verzeSW
  if (opts.nazevSW) pisemnostAttrs.nazevSW = opts.nazevSW
  const document = el(opts.documentTag, opts.vety, docAttrs)
  return serialize(el("Pisemnost", [document], pisemnostAttrs))
}

// ── Value formatters (from the XSD facets, see .context/xml-filing-tier2-grounding.md) ──

/**
 * Whole-koruna integer string for DPHDP3 amounts (xs:decimal fractionDigits=0).
 * Statutory matematické zaokrouhlení (round half AWAY from zero), not banker's —
 * matches the DPH přiznání whole-koruna rule and other Czech software.
 */
export function koruna(x: VetaValue): string | undefined {
  if (x === null || x === undefined || x === "") return undefined
  return new Decimal(x).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0)
}

/** Two-decimal haléř string for DPHKH1 amounts (xs:decimal fractionDigits=2). */
export function haler(x: VetaValue): string | undefined {
  if (x === null || x === undefined || x === "") return undefined
  return new Decimal(x).toFixed(2, Decimal.ROUND_HALF_EVEN)
}

/** DIČ → digits only, stripping any leading country prefix (attr pattern [0-9]{1,10}). */
export function dicDigits(dic: VetaValue): string | undefined {
  if (dic === null || dic === undefined) return undefined
  const digits = String(dic).replace(/\D/g, "")
  return digits === "" ? undefined : digits
}

/**
 * Normalize a date to the EPO `D.M.YYYY` shape (dateInMultiFormat). Accepts an ISO
 * `YYYY-MM-DD` or an already-`D.M.YYYY` string; leading zeros are stripped.
 */
export function epoDate(value: VetaValue): string | undefined {
  if (value === null || value === undefined || value === "") return undefined
  const s = String(value).trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (iso) return `${Number(iso[3])}.${Number(iso[2])}.${iso[1]}`
  const cz = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s)
  if (cz) return `${Number(cz[1])}.${Number(cz[2])}.${cz[3]}`
  return s
}
