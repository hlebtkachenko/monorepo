// Účetní závěrka as DPPO příloha — the Rozvaha and Výkaz zisku a ztráty that
// EPO carries INSIDE the DPPDP9 XML as structured věty, not as e-přílohy.
//
// The daňové přílohy live in ./priloha (tabulka A/B/K). This module covers the
// three účetní výkazy the podnikatel form offers ("Rozvaha pro podnikatele",
// "Výkaz zisku a ztráty pro podnikatele - druhové členění", and the účelové
// variant we do not produce). Every row is one repeated věta carrying its číslo
// řádku and its columns; the tags are appended to `extraVety` in XSD sequence
// order (see DPPO_EXTRA_VETA_TAGS).

import type { DppoExtraVeta } from "../../../model/dppo"

/**
 * Věta per výkaz table.
 *
 * `VetaUA` is the only four-column shape in the podnikatel block
 * (brutto / korekce / netto / minulé netto), which is the rozvaha's AKTIVA side;
 * `VetaUB` is the two-column shape that follows it, which is PASIVA (běžné /
 * minulé). They have to be separate věty: EPO numbers aktiva 1–81 and pasiva
 * 1–69 in two independent spaces, and `c_radku` carries a "nesmí být duplicitní"
 * critical control, so one list could not hold both. `VetaUD` is then the první
 * VZZ table, druhové členění, and `VetaUE` the účelové one we do not emit.
 *
 * The XSD documents neither table by name, so the assignment comes from the
 * column shapes plus the block order, which matches the order EPO lists the
 * forms in. Confirm once by loading a generated XML in EPO: the three tables
 * fill in, and nothing lands in "účelové členění".
 */
const AKTIVA_VETA = "VetaUA"
const PASIVA_VETA = "VetaUB"
const VZZ_DRUHOVE_VETA = "VetaUD"

/**
 * Our číslo řádku → EPO `c_radku`, as [from, to, offset] over our numbering.
 *
 * Ours runs straight down the statutory položky with BOTH časové-rozlišení
 * variants numbered in place (aktiva 001–081, pasiva 001–068 — see
 * apps/web/app/vykazy/_data/rozvaha.ts). EPO instead numbers the D. variant in
 * place and parks the C. variant at the end of the table, and pasiva leaves
 * číslo 20 unused, so the two numberings agree only at the top.
 *
 * Read off the EPO form itself. The anchors, all pinned in zaverka.test.ts:
 *   aktiva  C.II.3.  ours 068 → EPO 78      C.III.  ours 072 → EPO 68
 *   pasiva  A.IV.2.  ours 020 → EPO 21      C.III.  ours 063 → EPO 67
 *           D.       ours 066 → EPO 64
 * VZZ druhové needs no map: ours and EPO both run 1–56 over the same položky.
 */
const AKTIVA_RADKY: readonly (readonly [number, number, number])[] = [
  [1, 67, 0], // AKTIVA CELKEM … C.II.2.4.6.
  [68, 71, 10], // C.II.3.x — časové rozlišení inside C, parked at EPO 78–81
  [72, 81, -4], // C.III. … D.3.
]

const PASIVA_RADKY: readonly (readonly [number, number, number])[] = [
  [1, 19, 0], // PASIVA CELKEM … A.IV.1.
  [20, 62, 1], // A.IV.2. … C.II.8.7. — EPO leaves číslo 20 unused
  [63, 65, 4], // C.III.x — časové rozlišení inside C, parked at EPO 67–69
  [66, 68, -2], // D. … D.2.
]

const VZZ_RADKU = 56

function mapRadek(
  radek: string,
  segments: readonly (readonly [number, number, number])[],
): number {
  const n = Number(radek)
  const segment = segments.find(([from, to]) => n >= from && n <= to)
  if (segment === undefined) {
    throw new Error(`Řádek ${radek} není řádkem tohoto výkazu.`)
  }
  return n + segment[2]
}

/** One rozvaha row, in whole thousands of CZK as the form reports them. */
export interface DppoZaverkaRozvahaRadek {
  /** Our číslo řádku, zero-padded ("001"…"081" aktiva, "001"…"068" pasiva). */
  radek: string
  brutto?: number
  /** Positive, however it is signed in the books — see below. */
  korekce?: number
  netto?: number
  nettoMinule?: number
}

/** One row of a two-column table: rozvaha pasiva, or the VZZ. */
export interface DppoZaverkaRadek {
  radek: string
  bezne?: number
  minule?: number
}

export interface DppoZaverka {
  aktiva: readonly DppoZaverkaRozvahaRadek[]
  /** Pasiva reports only the two netto columns, matching the printed form. */
  pasiva: readonly DppoZaverkaRadek[]
  /** Druhové členění. Ours and EPO both run 1–56 over the same položky. */
  vzz: readonly DppoZaverkaRadek[]
}

/**
 * Whole thousands as EPO wants them: an integer, no decimals, no grouping.
 * A row column the výkaz does not apply (rozvaha korekce on a pohledávka, where
 * the paper form prints "x") is left undefined by the caller and omitted here.
 */
function tis(value: number | undefined): string | undefined {
  return value === undefined ? undefined : String(Math.round(value))
}

function rozvahaVeta(
  tag: string,
  radek: DppoZaverkaRozvahaRadek,
  segments: readonly (readonly [number, number, number])[],
): DppoExtraVeta {
  const attrs: Record<string, string> = {
    c_radku: String(mapRadek(radek.radek, segments)),
  }
  const brutto = tis(radek.brutto)
  // "Záporné znaménko se neuvádí" — korekce is reported as a positive figure
  // even though oprávky and opravné položky are credit balances in the books.
  const korekce = tis(
    radek.korekce === undefined ? undefined : Math.abs(radek.korekce),
  )
  const netto = tis(radek.netto)
  const nettoMinule = tis(radek.nettoMinule)
  if (brutto !== undefined) attrs.kc_brutto = brutto
  if (korekce !== undefined) attrs.kc_korekce = korekce
  if (netto !== undefined) attrs.kc_netto = netto
  if (nettoMinule !== undefined) attrs.kc_netto_min = nettoMinule
  return { tag, attrs }
}

function dvousloupcovaVeta(
  tag: string,
  radek: DppoZaverkaRadek,
  cRadku: number,
): DppoExtraVeta {
  const attrs: Record<string, string> = { c_radku: String(cRadku) }
  const bezne = tis(radek.bezne)
  const minule = tis(radek.minule)
  if (bezne !== undefined) attrs.kc_sled = bezne
  if (minule !== undefined) attrs.kc_min = minule
  return { tag, attrs }
}

/**
 * Build the účetní závěrka věty, in XSD sequence order (VetaUA → VetaUB →
 * VetaUD).
 *
 * The caller passes the rows of the časové-rozlišení variant it actually
 * reports and leaves the other variant out entirely: filling both would put the
 * same částka on the form twice, and EPO's own kritická kontrola rejects the
 * equivalent for the two VZZ variants.
 */
export function buildZaverkaVety(zaverka: DppoZaverka): DppoExtraVeta[] {
  const vety: DppoExtraVeta[] = []
  for (const radek of zaverka.aktiva) {
    vety.push(rozvahaVeta(AKTIVA_VETA, radek, AKTIVA_RADKY))
  }
  for (const radek of zaverka.pasiva) {
    vety.push(
      dvousloupcovaVeta(
        PASIVA_VETA,
        radek,
        mapRadek(radek.radek, PASIVA_RADKY),
      ),
    )
  }
  for (const radek of zaverka.vzz) {
    const n = Number(radek.radek)
    if (n < 1 || n > VZZ_RADKU) {
      throw new Error(`Řádek ${radek.radek} není řádkem výkazu zisku a ztráty.`)
    }
    vety.push(dvousloupcovaVeta(VZZ_DRUHOVE_VETA, radek, n))
  }
  return vety
}
