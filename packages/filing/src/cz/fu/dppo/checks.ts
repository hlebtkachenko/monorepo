// EPO kritické-kontroly layer for DPPO — the cross-field / range / footing checks the
// XSD cannot express (the XSD only has facets), reproduced from the 125 "kritická
// kontrola" strings in the vendored XSD `xs:documentation`. WARN-ONLY BY DESIGN: a user
// may deliberately file a value that differs from the accounting suggestion, so every
// finding is a `severity: "warning"` with a suggested correction — this never blocks an
// export. The hard gate stays the XSD validator (structural) + EPO itself (on submit).
//
// A green XSD badge means schema-conformant; these warnings approximate what EPO will
// flag on "Načíst písemnost" so the user can fix issues before the portal does.

import {
  computeDppoTotals,
  DPPO_DERIVED_ATTRS,
  type DppoDerived,
} from "./compute"
import { validateDicLegalEntity } from "../../business-validity"
import type { Dppo } from "../../../model/dppo"

export interface DppoCheck {
  /** Always a warning — this layer never blocks. */
  severity: "warning"
  /** Stable machine code for the check. */
  code: string
  /** The field/řádek the warning is about (for anchoring in a UI). */
  field?: string
  /** Human-readable Czech message. */
  message: string
  /** The value/action the user probably wants instead. */
  suggestion?: string
}

const REQUIRED_HEADER: [attr: string, label: string][] = [
  ["typ_dapdpp", "Typ přiznání"],
  ["typ_zo", "Typ zdaňovacího období"],
  ["typ_popldpp", "Typ poplatníka"],
  ["c_ufo_cil", "Kód finančního úřadu"],
  ["dapdpp_forma", "Forma přiznání"],
  ["zdobd_od", "Období od"],
  ["zdobd_do", "Období do"],
]

/** Parse a D.M.YYYY / DD.MM.YYYY / ISO date to a UTC Date, or null. */
function parseDate(s: string | undefined): Date | null {
  if (!s) return null
  const cz = /^(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})$/.exec(s.trim())
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s.trim())
  let y: number, m: number, d: number
  if (cz) {
    d = +cz[1]!
    m = +cz[2]!
    y = +cz[3]!
  } else if (iso) {
    y = +iso[1]!
    m = +iso[2]!
    d = +iso[3]!
  } else return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  return Number.isNaN(dt.getTime()) ? null : dt
}

/** Form-version bounds for a type-A period (from the zdobd_od kritická kontrola). */
const PERIOD_MIN = Date.UTC(2021, 0, 1)
const PERIOD_MAX = Date.UTC(2025, 11, 30)

function isEmptyAmount(v: string | undefined): boolean {
  return v === undefined || v === "" || v === "0"
}

/** Safe numeric parse of a whole-koruna string (non-numeric → 0). */
function toNum(v: string | undefined): number {
  if (!v) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Run the DPPO kritické kontroly against a model. Returns a (possibly empty) list of
 * warnings; the caller renders them and lets the user proceed regardless.
 */
export function checkDppo(model: Dppo): DppoCheck[] {
  const out: DppoCheck[] = []
  const h = model.header
  const o = model.vetaO ?? {}

  // — Required hlavička fields —
  for (const [attr, label] of REQUIRED_HEADER) {
    if (!h[attr]) {
      out.push({ severity: "warning", code: "header.required", field: `header.${attr}`, message: `${label} není vyplněno (EPO je vyžaduje).` }) // prettier-ignore
    }
  }

  // — Enumerated codes —
  if (h.typ_popldpp && !/^[0-9]$/.test(h.typ_popldpp)) {
    out.push({ severity: "warning", code: "typ_popldpp.enum", field: "header.typ_popldpp", message: "Typ poplatníka musí být 0–9.", suggestion: "1 (ostatní)" }) // prettier-ignore
  }
  if (h.dapdpp_forma && !/^[BODE]$/.test(h.dapdpp_forma)) {
    out.push({ severity: "warning", code: "dapdpp_forma.enum", field: "header.dapdpp_forma", message: "Forma musí být B/O/D/E.", suggestion: "B (řádné)" }) // prettier-ignore
  }
  // Dodatečné/dodatečné-opravné → datum zjištění je povinné.
  if ((h.dapdpp_forma === "D" || h.dapdpp_forma === "E") && !h.d_zjist) {
    out.push({ severity: "warning", code: "d_zjist.required", field: "header.d_zjist", message: "U dodatečného přiznání (forma D/E) je datum zjištění povinné." }) // prettier-ignore
  }

  // — Period bounds + length (typ_zo A/B ⇒ ≤ 1 rok; zdobd_od type A v rozmezí) —
  const od = parseDate(h.zdobd_od)
  const doo = parseDate(h.zdobd_do)
  if (od && doo) {
    if (doo.getTime() < od.getTime()) {
      out.push({ severity: "warning", code: "period.order", field: "header.zdobd_do", message: "Datum konce období je před datem začátku." }) // prettier-ignore
    } else if (h.typ_zo === "A" || h.typ_zo === "B") {
      // "delší než 1 rok" = konec po dni (počátek + 1 kalendářní rok).
      const odPlusYear = Date.UTC(
        od.getUTCFullYear() + 1,
        od.getUTCMonth(),
        od.getUTCDate(),
      )
      if (doo.getTime() > odPlusYear) {
        out.push({ severity: "warning", code: "period.length", field: "header.zdobd_do", message: "Pro typ období A/B nesmí být zdaňovací období delší než 1 rok." }) // prettier-ignore
      }
    }
  }
  if (
    od &&
    h.typ_dapdpp === "A" &&
    (od.getTime() < PERIOD_MIN || od.getTime() > PERIOD_MAX)
  ) {
    out.push({ severity: "warning", code: "period.range", field: "header.zdobd_od", message: "Období od musí být v rozmezí 1.1.2021 – 30.12.2025 (typ přiznání A)." }) // prettier-ignore
  }

  // — DIČ checksum (offline business validity; ARES existence is a separate online check) —
  if (model.payer?.dic) {
    const dic = validateDicLegalEntity(model.payer.dic)
    if (!dic.ok) {
      out.push({ severity: "warning", code: "dic.checksum", field: "payer.dic", message: `DIČ: ${dic.error}`, suggestion: "Ověřte DIČ v ARES." }) // prettier-ignore
    }
  }

  const derived = computeDppoTotals(model)

  // — Daňová ztráta: je-li na ř.220 vykázána daňová ztráta, ř.230–330 se nevyplňují —
  // ř.220 = ř.200 (propočet) − ř.201 − ř.210; keyed off the COMPUTED base, so it fires
  // even when the filer relies on auto-compute (ř.200 is then not hand-entered).
  const r220 =
    toNum(derived.r200) - toNum(o.kc_ii201_201) - toNum(o.kc_ii250_210)
  if (r220 < 0) {
    const afterLossAttrs: [attr: string, r: string][] = [
      ["kc_ii210_230", "230"],
      ["kc_ii220_240", "240"],
      ["kc_ii230_250", "250"],
      ["kc_ii260_270", "270"],
      ["kc_ii280_290", "290"],
      ["kc_ii300_310", "310"],
      ["kc_ii310_320", "320"],
      ["kc_ii320_330", "330"],
    ]
    for (const [attr, r] of afterLossAttrs) {
      if (!isEmptyAmount(o[attr])) {
        out.push({ severity: "warning", code: "loss.blank", field: `vetaO.${attr}`, message: `ř.${r} se nevyplňuje, je-li na ř.220 vykázána daňová ztráta.`, suggestion: "0" }) // prettier-ignore
      }
    }
  }

  // — Footing vazby: user-entered součtový řádek musí odpovídat propočtu —
  for (const key of Object.keys(DPPO_DERIVED_ATTRS) as (keyof DppoDerived)[]) {
    const attr = DPPO_DERIVED_ATTRS[key]
    const entered = o[attr]
    if (entered === undefined || entered === "") continue // relying on auto-compute → fine
    const expected = derived[key]
    if (entered !== expected && !(isEmptyAmount(entered) && expected === "0")) {
      out.push({ severity: "warning", code: "footing.mismatch", field: `vetaO.${attr}`, message: `ř.${key.slice(1)} = ${entered}, ale propočet dává ${expected}.`, suggestion: expected }) // prettier-ignore
    }
  }

  return out
}
