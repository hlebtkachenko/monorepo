// Příloha č. 1 II. oddílu (tabulky A a B) a tabulka K of the DPPO.
//
// The II. oddíl alone is not a filable return: the Pokyny make three of its
// řádky depend on an appendix table, and EPO rejects or queries a return whose
// table is empty while the řádek it must foot to is not.
//
//   ř.40  → tabulka A ř.13  "Celková částka na ř. 40 musí být shodná s částkou
//                            na ř. 13 tabulky A Přílohy č. 1 II. oddílu."
//   ř.150 → tabulka B/a     "Poplatník uvede na řádcích 1 až 9 části a) tabulky
//                            uplatněné daňové odpisy hmotného majetku."
//   tabulka K ř.1/2         "Údaj vyplňují všichni poplatníci…"
//
// The general rule for the appendix is "Vyplňují se pouze ty tabulky přílohy,
// pro něž má poplatník věcnou náplň", so every table here is optional and an
// absent one emits no věta at all.
//
// The tables live in přílohy věty, which the model carries verbatim through
// `extraVety` — see ../../../model/dppo. `buildPrilohaVety` returns them already
// in DPPO_EXTRA_VETA_TAGS order (VetaU… → VetaE → VetaF → VetaS), which is the
// XSD sequence order the writer emits.

import { koruna } from "../envelope"
import type { DppoExtraVeta } from "../../../model/dppo"

/** One účtová skupina line of tabulka A (ř.1–12). */
export interface DppoTabulkaARadek {
  /** Název účtové skupiny včetně číselného označení, e.g. "54 - Jiné provozní náklady". */
  uctovaSkupina: string
  /** Částka neuznaná za daňový výdaj, whole koruna. */
  castka: string
}

/**
 * Tabulka B — daňové odpisy, keyed by the tiskopis's own řádek number.
 *
 * The keys skip ř.2 because the form skips it: on vzor č. 36 ř.2 is printed
 * "(neobsazeno)" with an X in both amount columns, which is why odpisová
 * skupina 2 is reported on ř.3 and every later skupina is one row down from its
 * number.
 */
export interface DppoTabulkaB {
  /** ř.1 — odpisová skupina 1. */
  r1?: string
  /** ř.3 — odpisová skupina 2. */
  r3?: string
  /** ř.4 — odpisová skupina 3. */
  r4?: string
  /** ř.5 — odpisová skupina 4. */
  r5?: string
  /** ř.6 — odpisová skupina 5. */
  r6?: string
  /** ř.7 — odpisová skupina 6. */
  r7?: string
  /** ř.8 — § 30 odst. 4 zákona, ve znění účinném do 31. 12. 2007. */
  r8?: string
  /** ř.9 — § 30 odst. 4 až 6 a § 30b zákona. */
  r9?: string
  /** ř.10 — nehmotný majetek podle § 32a, ve znění účinném do 31. 12. 2020. */
  r10?: string
  /** ř.12 — účetní odpisy podle § 24 odst. 2 písm. v) (část b). */
  r12?: string
}

/** Tabulka K — vybrané ukazatele hospodaření. */
export interface DppoTabulkaK {
  /** ř.1 — roční úhrn čistého obratu (§ 1d odst. 2 věta druhá zákona o účetnictví). */
  cistyObrat?: string
  /** ř.2 — průměrný přepočtený počet zaměstnanců. */
  pocetZamestnancu?: string
  /**
   * Měrná jednotka k ř.1 — měna účetnictví (CZK/EUR/USD/GBP, § 24a ZoÚ).
   * The attribute carries a kritická kontrola "nesmí být vyplněna do 1.1.2024",
   * so the caller only sets it for a period that starts in 2024 or later.
   */
  mena?: string
}

export interface DppoPriloha {
  /** Tabulka A — rozdělení nákladů z ř.40 podle účtových skupin (max 12 řádků). */
  tabulkaA?: DppoTabulkaARadek[]
  tabulkaB?: DppoTabulkaB
  tabulkaK?: DppoTabulkaK
}

/** VetaU is `maxOccurs="12"`, matching the twelve printed řádky of tabulka A. */
export const DPPO_TABULKA_A_MAX_RADKU = 12

/**
 * Tabulka B/a řádek → VetaF attribute, with the tiskopis label.
 *
 * Six of the eleven cells are pinned by the XSD's own documentation or by an
 * unambiguous name: `kc_dpp_b_ohm_30_6` says "Na ř. 9", `kc_dpp_b_onm` says
 * "Na ř. 10", `kc_dpp_b10` says "Na ř. 12", and `kc_dppb1`…`kc_dppb5` cannot be
 * řádek numbers (there is no attribute for the "(neobsazeno)" ř.2), so they are
 * odpisové skupiny 1–5 on ř.1, 3, 4, 5 and 6.
 *
 * That leaves three attributes for three řádky — 7 (skupina 6), 8 (§ 30 odst. 4)
 * and 11 (celkem) — and the XSD carries no annotation for any of them. They are
 * assigned by name: `kc_dpp_b_6odsk` reads as "6. odpisová skupina" and shares
 * the underscore style of the other late additions (`kc_dpp_b_ohm_30_6`,
 * `kc_dpp_b_onm`), skupina 6 having been added to the form in 2004;
 * `kc_dppb6_b8` reads as "was b6, now ř.8", which is exactly the § 30 odst. 4
 * row's history; celkem takes the remaining `kc_dpp_b6`.
 *
 * VERIFY ONCE against an EPO render before trusting a return that puts a
 * non-zero amount on ř.7, ř.8 or ř.11 — if the amounts land on the wrong rows,
 * only this map changes.
 */
export const DPPO_TABULKA_B_RADKY: {
  radek: keyof DppoTabulkaB
  attr: string
  label: string
}[] = [
  { radek: "r1", attr: "kc_dppb1", label: "Odpisy hmotného a nehmotného majetku zařazeného do odpisové skupiny 1" }, // prettier-ignore
  { radek: "r3", attr: "kc_dppb2", label: "Odpisy hmotného a nehmotného majetku zařazeného do odpisové skupiny 2" }, // prettier-ignore
  { radek: "r4", attr: "kc_dppb3", label: "Odpisy hmotného a nehmotného majetku zařazeného do odpisové skupiny 3" }, // prettier-ignore
  { radek: "r5", attr: "kc_dppb4", label: "Odpisy hmotného majetku zařazeného do odpisové skupiny 4" }, // prettier-ignore
  { radek: "r6", attr: "kc_dppb5", label: "Odpisy hmotného majetku zařazeného do odpisové skupiny 5" }, // prettier-ignore
  { radek: "r7", attr: "kc_dpp_b_6odsk", label: "Odpisy hmotného majetku zařazeného do odpisové skupiny 6" }, // prettier-ignore
  { radek: "r8", attr: "kc_dppb6_b8", label: "Odpisy hmotného majetku podle § 30 odst. 4 zákona, ve znění účinném do 31. prosince 2007" }, // prettier-ignore
  { radek: "r9", attr: "kc_dpp_b_ohm_30_6", label: "Odpisy hmotného majetku podle § 30 odst. 4 až 6 a § 30b zákona" }, // prettier-ignore
  { radek: "r10", attr: "kc_dpp_b_onm", label: "Odpisy nehmotného majetku podle § 32a zákona, ve znění účinném do 31. prosince 2020" }, // prettier-ignore
]

/** ř.11 — daňové odpisy celkem, the součet of every ř.1–10 above. */
export const DPPO_TABULKA_B_CELKEM_ATTR = "kc_dpp_b6"

/** ř.12 — účetní odpisy (část b), documented in the XSD as "Na ř. 12". */
export const DPPO_TABULKA_B_UCETNI_ATTR = "kc_dpp_b10"

/** Sum a list of whole-koruna strings, ignoring blanks and non-numerics. */
function sumKoruna(values: (string | undefined)[]): string {
  let total = 0
  for (const v of values) {
    const n = Number(koruna(v) ?? 0)
    if (Number.isFinite(n)) total += n
  }
  return String(total)
}

/** Tabulka A ř.13 "Celkem" — must equal II. oddíl ř.40 (Pokyny, k ř. 40). */
export function tabulkaACelkem(radky: DppoTabulkaARadek[]): string {
  return sumKoruna(radky.map((r) => r.castka))
}

/** Tabulka B ř.11 "Daňové odpisy celkem" — the součet of ř.1 až 10. */
export function tabulkaBCelkem(tabulka: DppoTabulkaB): string {
  return sumKoruna(DPPO_TABULKA_B_RADKY.map((r) => tabulka[r.radek]))
}

/**
 * Build the příloha věty for a DPPO model, in XSD sequence order.
 *
 * A table with no věcná náplň produces no věta: tabulka A emits one VetaU per
 * non-empty řádek plus a VetaE with the celkem, tabulka B one VetaF, tabulka K
 * one VetaS. Both celkem řádky are computed here rather than taken as input, so
 * the appendix always foots to itself.
 */
export function buildPrilohaVety(priloha: DppoPriloha): DppoExtraVeta[] {
  const vety: DppoExtraVeta[] = []

  const radky = (priloha.tabulkaA ?? [])
    .filter((r) => r.uctovaSkupina.trim() !== "" || koruna(r.castka))
    .slice(0, DPPO_TABULKA_A_MAX_RADKU)
  if (radky.length > 0) {
    for (const radek of radky) {
      const attrs: Record<string, string> = {}
      const nazev = radek.uctovaSkupina.trim()
      if (nazev) attrs.naz_uc_skup = nazev
      const castka = koruna(radek.castka)
      if (castka) attrs.kc_1a = castka
      vety.push({ tag: "VetaU", attrs })
    }
    vety.push({
      tag: "VetaE",
      attrs: { kc_dpp_a12: tabulkaACelkem(radky) },
    })
  }

  const b = priloha.tabulkaB
  if (b) {
    const attrs: Record<string, string> = {}
    for (const { radek, attr } of DPPO_TABULKA_B_RADKY) {
      const value = koruna(b[radek])
      if (value && value !== "0") attrs[attr] = value
    }
    const ucetni = koruna(b.r12)
    if (ucetni && ucetni !== "0") attrs[DPPO_TABULKA_B_UCETNI_ATTR] = ucetni
    if (Object.keys(attrs).length > 0) {
      const celkem = tabulkaBCelkem(b)
      if (celkem !== "0") attrs[DPPO_TABULKA_B_CELKEM_ATTR] = celkem
      vety.push({ tag: "VetaF", attrs })
    }
  }

  const k = priloha.tabulkaK
  if (k) {
    const attrs: Record<string, string> = {}
    const obrat = koruna(k.cistyObrat)
    if (obrat !== undefined) attrs.kc_dpp_i1 = obrat
    const zam = koruna(k.pocetZamestnancu)
    if (zam !== undefined) attrs.poc_zam = zam
    if (k.mena) attrs.cisobr_mena = k.mena
    if (Object.keys(attrs).length > 0) vety.push({ tag: "VetaS", attrs })
  }

  return vety
}
