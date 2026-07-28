// Typed DPHSHV (Souhrnné hlášení VIES, §102 ZDPH) model — the UI seam. Structure
// mirrors the vendored XSD (packages/filing/schemas/fu/dphshv/02.01.04/dphshv_epo2.xsd):
// a typed hlavička (VetaD) + poplatník (VetaP), then the recap rows (VetaR) and the
// call-off stock rows (VetaS). Amount strings are whole koruna (XSD fractionDigits=0);
// the writer emits them verbatim, xmllint-wasm against the XSD is the gate.
//
// Three rules the XSD facets do NOT express — they live in the schema's
// xs:documentation and EPO enforces them at upload, so they are encoded here as
// comments and in the writer/adapter instead:
//
//  1. `shvies_forma` is R (řádné) / N (následné) — NOT the B/O/D/E of DPHDP3 nor
//     the B/O/N of DPHKH1. There is no "opravné" form; a correction is a následné
//     SH carrying storno rows.
//  2. `k_storno = "A"` marks a storno row and MUST NOT appear on a form-R hlášení.
//     FÚ matches the row to cancel by (k_stat, c_vat, k_pln_eu) across the řádné
//     and every preceding následné SH, so those three must reproduce the original.
//  3. `k_stat`, `c_vat` and `pln_hodnota` are mandatory on every row that is NOT a
//     storno row, even though the XSD marks all three `use="optional"`.
//
// `poc_radku` / `poc_stran` / `pln_poc_celk` / `suma_pln` exist on VetaD but the
// schema documents them as "nevyplňuje se - nebude bráno v úvahu" (kept only for
// backward compatibility of input files), so this model omits them deliberately.

import { z } from "zod"

/** Schema version pinned to the vendored XSD. */
export const DPHSHV_VERSION = "02.01.04"

/** VetaD — hlavička. */
export const DphshvHeaderSchema = z.object({
  /** Typ dokumentu — XSD fixed="SHV" (not "SH"). */
  dokument: z.string().default("SHV"),
  /** Kód uladis — "DPH". */
  k_uladis: z.string().default("DPH"),
  /**
   * Forma hlášení (maxLen 1): "R" souhrnné hlášení, "N" následné souhrnné
   * hlášení. Deliberately NOT defaulted to the "B" used by DPHDP3/DPHKH1 — the
   * enum is different and a wrong value is rejected at upload.
   */
  shvies_forma: z.string().default("R"),
  /** Rok zdaňovacího období (YYYY). */
  rok: z.string(),
  /** Měsíc 1–12 (monthly filers, and anyone supplying goods — §102/5). */
  mesic: z.string().optional(),
  /** Čtvrtletí 1–4 (quarterly, only for a services-only filer — §102/5). */
  ctvrt: z.string().optional(),
  /** Datum podání (dateInMultiFormat — ISO or D.M.YYYY; writer normalises). */
  d_poddp: z.string().optional(),
})

/** VetaP — poplatník. Wider than the DPHDP3/DPHKH1 payer: SH carries the
 *  oprávněná osoba, the sestavil block and a full zástupce block. */
export const DphshvPayerSchema = z.object({
  c_ufo: z.string(),
  c_pracufo: z.string().optional(),
  /** DIČ — digits only, no "CZ" prefix (writer strips it). */
  dic: z.string(),
  /** Typ daňového subjektu (maxLen 1): "P" právnická, "F" fyzická. */
  typ_ds: z.string().default("P"),
  prijmeni: z.string().optional(),
  jmeno: z.string().optional(),
  titul: z.string().optional(),
  zkrobchjm: z.string().optional(),
  /** Dodatek obchodního jména. */
  dodobchjm: z.string().optional(),
  naz_obce: z.string().optional(),
  ulice: z.string().optional(),
  c_pop: z.string().optional(),
  c_orient: z.string().optional(),
  psc: z.string().optional(),
  stat: z.string().optional(),
  /** Oprávněná osoba. */
  opr_prijmeni: z.string().optional(),
  opr_jmeno: z.string().optional(),
  opr_postaveni: z.string().optional(),
  /** Osoba, která hlášení sestavila. */
  sest_prijmeni: z.string().optional(),
  sest_jmeno: z.string().optional(),
  sest_telef: z.string().optional(),
  /** Zástupce. */
  zast_kod: z.string().optional(),
  zast_typ: z.string().optional(),
  zast_prijmeni: z.string().optional(),
  zast_jmeno: z.string().optional(),
  zast_nazev: z.string().optional(),
  zast_dat_nar: z.string().optional(),
  zast_ev_cislo: z.string().optional(),
  zast_ic: z.string().optional(),
})

/** VetaR — one recap row (jeden řádek SH VIES). */
export const DphshvRowSchema = z.object({
  /** Ordering hints only ("budou stránky/řádky uspořádány v zadaném pořadí"). */
  por_c_stran: z.string().optional(),
  c_rad: z.string().optional(),
  /** "A" = storno řádek. Forbidden on a form-R hlášení. */
  k_storno: z.string().optional(),
  /** Kód státu, který přidělil DIČ pořizovatele. Mandatory unless storno. */
  k_stat: z.string().optional(),
  /** DIČ pořizovatele BEZ kódu státu — číselná část only. Mandatory unless storno. */
  c_vat: z.string().optional(),
  /**
   * Kód plnění: 0 dodání zboží (§13/1,2) · 1 přemístění obchodního majetku
   * (§13/6) · 2 třístranný obchod (§17, prostřední osoba only) · 3 poskytnutí
   * služby s místem plnění v JČS (§9/1).
   */
  k_pln_eu: z.string().optional(),
  /** Počet poskytnutých dodávek zboží a služeb pořizovateli. */
  pln_pocet: z.string().optional(),
  /** Celková hodnota plnění v celých korunách. Mandatory unless storno. */
  pln_hodnota: z.string().optional(),
})

/** VetaS — one call-off stock row (§18 ZDPH, přemístění zboží v režimu skladu). */
export const DphshvCallOffRowSchema = z.object({
  c_rad: z.string().optional(),
  k_stat: z.string().optional(),
  c_vat: z.string().optional(),
  /** DIČ původně zamýšleného pořizovatele (k_cos = "3" změna pořizovatele). */
  c_vat_puv: z.string().optional(),
  /** Kód záznamu: "1" přemístění do skladu, "2" vrácení, "3" změna pořizovatele. */
  k_cos: z.string().optional(),
})

export const DphshvSchema = z.object({
  /** Optional schema version echoed onto <DPHSHV verzePis>. */
  verze: z.string().default(DPHSHV_VERSION),
  header: DphshvHeaderSchema,
  payer: DphshvPayerSchema,
  /** Řádky souhrnného hlášení. */
  rows: z.array(DphshvRowSchema).optional(),
  /** Řádky call-off stock (§18) — a separate obligation on the same hlášení. */
  callOff: z.array(DphshvCallOffRowSchema).optional(),
})

export type Dphshv = z.infer<typeof DphshvSchema>
export type DphshvInput = z.input<typeof DphshvSchema>
export type DphshvHeader = z.infer<typeof DphshvHeaderSchema>
export type DphshvPayer = z.infer<typeof DphshvPayerSchema>
export type DphshvRow = z.infer<typeof DphshvRowSchema>
export type DphshvCallOffRow = z.infer<typeof DphshvCallOffRowSchema>
