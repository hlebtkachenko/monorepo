// DPHDP3 footer arithmetic — the DERIVED (computed, not input) lines the official
// form + EPO portal calculate from the input lines. This is NOT tax logic (that lives
// in @workspace/accounting); it is only the form's own sums, quoted verbatim from the
// vendored XSD annotations:
//   ř.46 = Σ řádků 40..45 (per column: V plné výši / Krácený odpočet)
//   ř.62 (daň na výstupu) = daň ř.1..13 − ř.61 + daň §108/4 g,h
//   ř.63 (odpočet daně)   = ř.46 V plné výši + ř.52 Odpočet + ř.53 Změna + ř.60
//   ř.64 (vlastní daň)      = ř.62 − ř.63   (when ř.62 ≥ ř.63)
//   ř.65 (nadměrný odpočet) = ř.63 − ř.62   (when ř.63 > ř.62)
// Amounts are whole koruna. Used to render the derived lines as read-only (disabled)
// fields on the tester so a human can confirm the return foots.

import Decimal from "decimal.js-light"
import type { Dphdp3 } from "../../../model/dphdp3"

/** ř.1..13 output-tax (daň) attributes, in form order. */
const OUTPUT_TAX_ATTRS = [
  "dan23", // ř.1
  "dan5", // ř.2
  "dan_pzb23", // ř.3
  "dan_pzb5", // ř.4
  "dan_psl23_e", // ř.5
  "dan_psl5_e", // ř.6
  "dan_dzb23", // ř.7
  "dan_dzb5", // ř.8
  "dan_pdop_nrg", // ř.9
  "dan_rpren23", // ř.10
  "dan_rpren5", // ř.11
  "dan_psl23_z", // ř.12
  "dan_psl5_z", // ř.13
] as const

/** ř.40..45 deduction daň, "V plné výši" column. */
const DEDUCT_FULL_ATTRS = [
  "odp_tuz23", // ř.40
  "odp_tuz5", // ř.41
  "odp_cu", // ř.42 (dovoz, správce celní úřad)
  "od_zdp23", // ř.43
  "od_zdp5", // ř.44
  "odp_rezim", // ř.45 (korekce §75/§77/§79)
] as const

/** ř.40..45 deduction daň, "Krácený odpočet" column. */
const DEDUCT_REDUCED_ATTRS = [
  "odp_tuz23_nar", // ř.40
  "odp_tuz5_nar", // ř.41
  "odp_cu_nar", // ř.42
  "odkr_zdp23", // ř.43
  "odkr_zdp5", // ř.44
  "odp_rez_nar", // ř.45
] as const

type VetaRec = Record<string, string> | undefined

function num(rec: VetaRec, attr: string): Decimal {
  const v = rec?.[attr]
  return v === undefined || v === "" ? new Decimal(0) : new Decimal(v)
}

function sum(rec: VetaRec, attrs: readonly string[]): Decimal {
  return attrs.reduce((acc, a) => acc.plus(num(rec, a)), new Decimal(0))
}

/** The derived (computed) DPHDP3 lines, as whole-koruna integer strings. */
export interface Dphdp3Derived {
  /** ř.46 — odpočet daně celkem, sloupec "V plné výši". */
  r46_full: string
  /** ř.46 — odpočet daně celkem, sloupec "Krácený odpočet". */
  r46_reduced: string
  /** ř.62 — daň na výstupu celkem. */
  r62: string
  /** ř.63 — odpočet daně. */
  r63: string
  /** ř.64 — vlastní daň (0 when it is a nadměrný odpočet). */
  r64: string
  /** ř.65 — nadměrný odpočet (0 when it is vlastní daň). */
  r65: string
}

/** Compute the derived DPHDP3 footer lines from a model's input lines. */
export function computeDphdp3Totals(model: Dphdp3): Dphdp3Derived {
  const v1 = model.veta1
  const v4 = model.veta4
  const v5 = model.veta5
  const v6 = model.veta6

  const r46_full = sum(v4, DEDUCT_FULL_ATTRS)
  const r46_reduced = sum(v4, DEDUCT_REDUCED_ATTRS)

  // ř.62 = Σ daň ř.1..13 − ř.61 (vrácení daně §84) + daň §108/4 g,h (no standard
  // input attribute — treated as 0; the platform does not compute it today).
  const r62 = sum(v1, OUTPUT_TAX_ATTRS).minus(num(v6, "dan_vrac"))

  // ř.63 = ř.46 V plné výši + ř.52 Odpočet (odp_uprav_kf) + ř.53 Změna (vypor_odp) + ř.60 (uprav_odp).
  const r63 = r46_full
    .plus(num(v5, "odp_uprav_kf"))
    .plus(num(v5, "vypor_odp"))
    .plus(num(v6, "uprav_odp"))

  const diff = r62.minus(r63)
  const isRefund = diff.lt(0)
  const r64 = isRefund ? new Decimal(0) : diff
  const r65 = isRefund ? diff.abs() : new Decimal(0)

  const int = (d: Decimal) => d.toFixed(0)
  return {
    r46_full: int(r46_full),
    r46_reduced: int(r46_reduced),
    r62: int(r62),
    r63: int(r63),
    r64: int(r64),
    r65: int(r65),
  }
}

/**
 * Fill a DPHDP3 model's derived lines (ř.46 odp_sum_*, ř.62/63/64/65 in Veta6) with
 * the computed totals, so the emitted XML carries them and the tester can display
 * them. Zero derived values are omitted (kept off the sparse form). Returns both the
 * updated model and the raw derived values (for a read-only display that shows 0 too).
 */
export function applyDphdp3Totals(model: Dphdp3): {
  model: Dphdp3
  derived: Dphdp3Derived
} {
  const derived = computeDphdp3Totals(model)
  const put = (
    rec: Record<string, string> | undefined,
    entries: Record<string, string>,
  ): Record<string, string> | undefined => {
    const out: Record<string, string> = { ...(rec ?? {}) }
    for (const [k, v] of Object.entries(entries)) {
      if (v !== "0") out[k] = v
      else delete out[k]
    }
    return Object.keys(out).length > 0 ? out : undefined
  }
  return {
    derived,
    model: {
      ...model,
      veta4: put(model.veta4, {
        odp_sum_nar: derived.r46_full,
        odp_sum_kr: derived.r46_reduced,
      }),
      veta6: put(model.veta6, {
        dan_zocelk: derived.r62,
        odp_zocelk: derived.r63,
        dano_da: derived.r64,
        dano_no: derived.r65,
      }),
    },
  }
}
