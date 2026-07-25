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
  // Keyed off the COMPUTED ř.220, so it fires even when the filer relies on
  // auto-compute (ř.200 is then not hand-entered).
  const r220 = toNum(derived.r220)
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

  out.push(...checkPriloha(model, o))

  return out
}

/** Attributes of the first (or only) occurrence of a příloha věta, if present. */
function vetaAttrs(
  model: Dppo,
  tag: string,
): Record<string, string> | undefined {
  return model.extraVety.find((v) => v.tag === tag)?.attrs
}

/**
 * Příloha č. 1 II. oddílu + tabulka K + the I. oddíl accounting-unit items.
 *
 * These are what make the difference between a return that foots and a return
 * EPO accepts: the Pokyny tie ř.40 to tabulka A ř.13, ř.150 to tabulka B, and
 * require tabulka K and položka 07 from every poplatník who keeps účetnictví.
 */
function checkPriloha(model: Dppo, o: Record<string, string>): DppoCheck[] {
  const out: DppoCheck[] = []
  const h = model.header

  if (!h.kat_uj) {
    out.push({ severity: "warning", code: "kat_uj.required", field: "header.kat_uj", message: "I. oddíl pol. 07 Kategorie účetní jednotky není vyplněna (§ 1b zákona o účetnictví).", suggestion: "M / L / S / V" }) // prettier-ignore
  } else if (!/^[MLSV]$/.test(h.kat_uj)) {
    out.push({ severity: "warning", code: "kat_uj.enum", field: "header.kat_uj", message: "Kategorie účetní jednotky musí být M, L, S nebo V." }) // prettier-ignore
  }
  if (h.uc_zav !== "A") {
    out.push({ severity: "warning", code: "uc_zav.required", field: "header.uc_zav", message: "I. oddíl pol. 11 deklaruje, že účetní závěrka NENÍ přiložena; účetní jednotka ji podle § 18 zákona o účetnictví přikládá.", suggestion: "A + vložit Rozvahu, VZZ a Přílohu jako E-přílohy v EPO" }) // prettier-ignore
  }

  // ř.40 ⇄ tabulka A ř.13 (Pokyny, k ř. 40).
  const r40 = toNum(o.kc_ii50_40)
  const tabulkaA = vetaAttrs(model, "VetaE")
  if (r40 !== 0 && tabulkaA === undefined) {
    out.push({ severity: "warning", code: "tabulkaA.missing", field: "vetaO.kc_ii50_40", message: `ř.40 = ${r40}, ale tabulka A Přílohy č. 1 je prázdná.`, suggestion: "Rozepsat ř.40 podle účtových skupin" }) // prettier-ignore
  } else if (tabulkaA !== undefined) {
    const celkem = toNum(tabulkaA.kc_dpp_a12)
    if (celkem !== r40) {
      out.push({ severity: "warning", code: "tabulkaA.mismatch", field: "vetaO.kc_ii50_40", message: `Tabulka A ř.13 = ${celkem}, ale ř.40 = ${r40}; Pokyny vyžadují shodu.`, suggestion: String(r40) }) // prettier-ignore
    }
  }

  // ř.150 ⇒ tabulka B má věcnou náplň (Pokyny, k tabulce B).
  if (toNum(o.kc_ii170_150) !== 0 && vetaAttrs(model, "VetaF") === undefined) {
    out.push({ severity: "warning", code: "tabulkaB.missing", field: "vetaO.kc_ii170_150", message: "ř.150 uplatňuje daňové odpisy, ale tabulka B Přílohy č. 1 je prázdná.", suggestion: "Rozepsat daňové odpisy podle odpisových skupin" }) // prettier-ignore
  }

  // Tabulka K — "Údaj vyplňují všichni poplatníci" (Pokyny, k tabulce K ř. 1).
  const tabulkaK = vetaAttrs(model, "VetaS")
  if (tabulkaK?.kc_dpp_i1 === undefined) {
    out.push({ severity: "warning", code: "tabulkaK.obrat", field: "priloha.kc_dpp_i1", message: "Tabulka K ř.1 roční úhrn čistého obratu není vyplněn; vyplňují jej všichni poplatníci." }) // prettier-ignore
  }
  if (tabulkaK?.poc_zam === undefined) {
    out.push({ severity: "warning", code: "tabulkaK.zamestnanci", field: "priloha.poc_zam", message: "Tabulka K ř.2 průměrný přepočtený počet zaměstnanců není vyplněn.", suggestion: "0" }) // prettier-ignore
  }

  return out
}
