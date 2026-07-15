// DPPO II. oddíl arithmetic — the DERIVED (computed, not input) řádky the official
// tiskopis + EPO portal calculate from the input lines. This is NOT tax logic (that
// lives in @workspace/accounting, the source of truth the adapter reads); it is only
// the form's own footing, so the debug tester can render the součtové řádky read-only
// and a human can confirm the return foots. The vendored XSD carries no vazby (only
// facets), so the formulas below are grounded in the official "Pokyny k vyplnění
// přiznání k DPPO" and FLAGGED for the Advisor gate — see
// .context/xml-filing-tier3-grounding.md.
//
// Attribute naming: `kc_ii<legacy>_<current>` → the DISPLAYED řádek is the SECOND
// number; `kc_ii_<n>` → řádek n. Amounts are whole koruna; ř.280 (sazba) is an
// integer percent (e.g. "21").

import Decimal from "decimal.js-light"
import type { Dppo } from "../../../model/dppo"

// ── VetaO řádek → attribute (displayed řádek in the comment) ──────────────────

const R = {
  r10: "kc_ii10_10", // ř.10 výsledek hospodaření před zdaněním
  // Zvýšení VH (additions, → ř.70):
  r20: "kc_ii30_20",
  r30: "kc_ii40_30",
  r40: "kc_ii50_40",
  r50: "kc_ii60_50",
  r61: "kc_ii71_61",
  r62: "kc_ii72_62",
  r63: "kc_ii_63",
  r65: "kc_ii_65",
  r70: "kc_ii80_70", // ř.70 mezisoučet zvýšení
  // Snížení VH (reductions, → ř.170):
  r100: "kc_ii110_100",
  r101: "kc_ii111_101",
  r109: "kc_ii_109",
  r110: "kc_ii120_110",
  r111: "kc_ii_111",
  r112: "kc_ii_112",
  r120: "kc_ii130_120",
  r130: "kc_ii140_130",
  r140: "kc_ii150_140",
  r150: "kc_ii170_150",
  r160: "kc_ii180_160",
  r161: "kc_ii181_161", // ř.161 úprava při likvidaci (snížení) — pár k ř.61
  r162: "kc_ii182_162",
  r163: "kc_ii_163",
  r165: "kc_ii_165",
  r170: "kc_ii190_170", // ř.170 mezisoučet snížení
  // Základ daně a odečty:
  r200: "kc_ii200_200", // ř.200 základ daně / daňová ztráta (§23)
  r201: "kc_ii201_201", // ř.201 část připadající komplementářům
  r210: "kc_ii250_210", // ř.210 vynětí zahraničních příjmů
  r220: "kc_ii_220", // ř.220 základ daně po ř.201/210
  r230: "kc_ii210_230", // ř.230 odečet daňové ztráty (§34/1)
  r240: "kc_ii220_240", // ř.240 odečet §34/3–10
  r242: "kc_ii_242", // ř.242 odečet na VaV (§34/4)
  r243: "kc_ii_243", // ř.243 odečet na odborné vzdělávání
  r250: "kc_ii230_250", // ř.250 základ snížený o odečty (≥ 0)
  r251: "kc_ii231_251", // ř.251 snížení VPP (§20/7)
  r260: "kc_ii240_260", // ř.260 odečet bezúplatných plnění (§20/8)
  r270: "kc_ii260_270", // ř.270 základ zaokrouhlený na tisíce dolů (§21)
  r280: "kc_ii270_280", // ř.280 sazba daně (% celé číslo)
  r290: "kc_ii280_290", // ř.290 daň = ř.270 × ř.280 %
  r300: "kc_ii290_300", // ř.300 slevy na dani (§35)
  r310: "kc_ii300_310", // ř.310 daň po slevách
  r319: "kc_ii_319", // ř.319 zápočet §38fa (CFC)
  r319a: "kc_ii_319a", // ř.319a zápočet §38fa/10
  r320: "kc_ii310_320", // ř.320 zápočet daně zaplacené v zahraničí
  r330: "kc_ii320_330", // ř.330 daň ze samostatného základu (§20b)
  r340: "kc_ii_340", // ř.340 celková daňová povinnost
  r360: "kc_ii_360", // ř.360 poslední známá daň
} as const

// FLAGGED for the Advisor gate: the exact membership of the two mezisoučty.
/** ř.70 = Σ zvýšení výsledku hospodaření. */
const ADDITION_LINES = [
  R.r20,
  R.r30,
  R.r40,
  R.r50,
  R.r61,
  R.r62,
  R.r63,
  R.r65,
] as const
/** ř.170 = Σ snížení výsledku hospodaření. */
const REDUCTION_LINES = [
  R.r100,
  R.r101,
  R.r109,
  R.r110,
  R.r111,
  R.r112,
  R.r120,
  R.r130,
  R.r140,
  R.r150,
  R.r160,
  R.r161,
  R.r162,
  R.r163,
  R.r165,
] as const

type VetaRec = Record<string, string> | undefined

// The věta records are raw, possibly-partial user input (the debug tester feeds live
// keystrokes), so a field may hold a non-numeric string. Footing must not throw on it:
// coerce anything decimal.js-light rejects to 0. The real gate for a bad amount is the
// XSD validator on export (the writer emits the raw value; xmllint flags "a" as an
// invalid decimal) — compute stays crash-proof, validation stays the validator's job.
function num(rec: VetaRec, attr: string): Decimal {
  const v = rec?.[attr]
  if (v === undefined || v === "") return new Decimal(0)
  try {
    return new Decimal(v)
  } catch {
    return new Decimal(0)
  }
}

function sum(rec: VetaRec, attrs: readonly string[]): Decimal {
  return attrs.reduce((acc, a) => acc.plus(num(rec, a)), new Decimal(0))
}

/** The derived (computed) DPPO II. oddíl řádky, as whole-koruna integer strings. */
export interface DppoDerived {
  /** ř.70 — mezisoučet zvýšení výsledku hospodaření. */
  r70: string
  /** ř.170 — mezisoučet snížení výsledku hospodaření. */
  r170: string
  /** ř.200 — základ daně / daňová ztráta (§23). */
  r200: string
  /** ř.250 — základ daně po odečtech §34 (≥ 0). */
  r250: string
  /** ř.270 — základ zaokrouhlený na celé tisíce dolů (§21). */
  r270: string
  /** ř.290 — daň (§21). */
  r290: string
  /** ř.310 — daň po slevách. */
  r310: string
  /** ř.340 — celková daňová povinnost. */
  r340: string
  /** ř.360 — poslední známá daň (pro zálohy §38a). */
  r360: string
}

const ZERO = new Decimal(0)
const nonNeg = (d: Decimal): Decimal => (d.lt(0) ? ZERO : d)

/**
 * Compute the derived DPPO II. oddíl řádky from a model's VetaO input lines.
 *
 * Grounded formulas (Pokyny k DPPO; the tax-calc chain ř.270→360 is definite, the
 * two mezisoučty and the base chain are FLAGGED for the Advisor gate):
 *   ř.70  = Σ zvýšení (ř.20..65)
 *   ř.170 = Σ snížení (ř.100..165)
 *   ř.200 = ř.10 + ř.70 − ř.170
 *   ř.250 = max(0, (ř.200 − ř.201 − ř.210) − ř.230 − ř.240 − ř.242 − ř.243)
 *   ř.270 = floor(ř.250 / 1000) × 1000
 *   ř.290 = ceil(ř.270 × ř.280 / 100)
 *   ř.310 = max(0, ř.290 − ř.300)
 *   ř.340 = max(0, ř.310 − ř.320 + ř.330)
 *   ř.360 = ř.340
 */
export function computeDppoTotals(model: Dppo): DppoDerived {
  const o = model.vetaO

  const r10 = num(o, R.r10)
  const r70 = sum(o, ADDITION_LINES)
  const r170 = sum(o, REDUCTION_LINES)
  const r200 = r10.plus(r70).minus(r170)

  // ř.220 = ř.200 − ř.201 (komplementáři) − ř.210 (vynětí). Then the §34 odečty
  // (ř.230/240/242/243) reduce to ř.250 — before the §20/7 (ř.251) and §20/8 (ř.260)
  // odečty, which reduce between ř.250 and the ř.270 rounding.
  const r220 = r200.minus(num(o, R.r201)).minus(num(o, R.r210))
  const r250 = nonNeg(
    r220
      .minus(num(o, R.r230))
      .minus(num(o, R.r240))
      .minus(num(o, R.r242))
      .minus(num(o, R.r243)),
  )

  // ř.270 = ř.250 − ř.251 − ř.260, zaokrouhleno na celé tisícikoruny dolů (§21).
  const r270 = nonNeg(r250.minus(num(o, R.r251)).minus(num(o, R.r260)))
    .dividedBy(1000)
    .toDecimalPlaces(0, Decimal.ROUND_DOWN)
    .times(1000)
  // ř.290 daň = ř.270 × sazba %, na celé Kč nahoru (§21). ř.280 is an integer percent.
  const rate = num(o, R.r280)
  const r290 = r270
    .times(rate)
    .dividedBy(100)
    .toDecimalPlaces(0, Decimal.ROUND_UP)
  // ř.310 daň po slevách (§35). Slevy nejvýše do ř.290.
  const r310 = nonNeg(r290.minus(num(o, R.r300)))
  // ř.340 celková daň = ř.310 − ř.319 − ř.319a (zápočty §38fa) − ř.320 (zápočet zahr.
  // daně) + ř.330 (daň ze samostatného základu §20b).
  const r340 = nonNeg(
    r310
      .minus(num(o, R.r319))
      .minus(num(o, R.r319a))
      .minus(num(o, R.r320))
      .plus(num(o, R.r330)),
  )
  // ř.360 poslední známá daň (pro zálohy §38a) = ř.340 − ř.330: daň ze samostatného
  // základu §20b je součástí ř.340, ale nevstupuje do základu pro zálohy.
  const r360 = nonNeg(r340.minus(num(o, R.r330)))

  const int = (d: Decimal) => d.toFixed(0)
  return {
    r70: int(r70),
    r170: int(r170),
    r200: int(r200),
    r250: int(r250),
    r270: int(r270),
    r290: int(r290),
    r310: int(r310),
    r340: int(r340),
    r360: int(r360),
  }
}

/** VetaO attribute of each derived řádek (for writing the computed values back). */
export const DPPO_DERIVED_ATTRS: Record<keyof DppoDerived, string> = {
  r70: R.r70,
  r170: R.r170,
  r200: R.r200,
  r250: R.r250,
  r270: R.r270,
  r290: R.r290,
  r310: R.r310,
  r340: R.r340,
  r360: R.r360,
}

/**
 * Fill a DPPO model's derived VetaO řádky with the computed totals, so the emitted
 * XML carries them and the tester can display them. Zero derived values are omitted
 * (kept off the sparse form). Returns both the updated model and the raw derived
 * values (for a read-only display that shows 0 too).
 */
export function applyDppoTotals(model: Dppo): {
  model: Dppo
  derived: DppoDerived
} {
  const derived = computeDppoTotals(model)
  const out: Record<string, string> = { ...(model.vetaO ?? {}) }
  for (const [key, attr] of Object.entries(DPPO_DERIVED_ATTRS)) {
    const value = derived[key as keyof DppoDerived]
    if (value !== "0") out[attr] = value
    else delete out[attr]
  }
  return {
    derived,
    model: {
      ...model,
      vetaO: Object.keys(out).length > 0 ? out : undefined,
    },
  }
}
