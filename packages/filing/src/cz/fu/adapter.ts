// Adapter: map the platform's computed VAT figures into the filing models. Keeps
// @workspace/filing a PURE serialize package — it must NOT depend on
// @workspace/accounting (that drags in @workspace/db + drizzle). Instead the inputs
// are filing-local interfaces that the accounting outputs (`Dph.rows` /
// `KontrolniHlaseni`) structurally satisfy: pass `dph.rows` and the KH sections
// straight in. Amounts come in as decimal strings; the adapter formats them (whole
// koruna for DPHDP3, haléře for DPHKH1) and drops zero-value detail lines.
//
// The DPHDP3 row→attribute map lives in .context/xml-filing-tier2-grounding.md.
// The Veta4 (odpočet) column roles come from the FÚ popis struktury, which carries a
// form label per attribute; the XSD alone cannot settle them, its documentation being
// identical for both members of every pair.

import Decimal from "decimal.js-light"
import { koruna, korunaNahoru, haler } from "./envelope"
import { splitVatId } from "./vat-id"
import type { Dphdp3Input } from "../../model/dphdp3"
import type { Dphkh1Input } from "../../model/dphkh1"
import type { DphshvInput } from "../../model/dphshv"

/** Identity + period metadata (not part of the accounting figures — supplied by the org). */
export interface FuFilingMeta {
  rok: string
  /** Monthly filers. */
  mesic?: string
  /** Quarterly filers. */
  ctvrt?: string
  zdobd_od?: string
  zdobd_do?: string
  /** Kód finančního úřadu (3-digit). */
  c_ufo: string
  /** DIČ (with or without CZ prefix — the writer strips to digits). */
  dic: string
  /** "P" právnická / "F" fyzická. */
  typ_ds?: string
  /** Obchodní jméno. */
  name?: string
  naz_obce?: string
  ulice?: string
  c_pop?: string
  psc?: string
  /** Forma přiznání/hlášení ("B" řádné). */
  forma?: string
}

/** Subset of accounting `DphRows` the DPHDP3 return needs (Decimal = string). */
export interface DphFigures {
  r1_base: string
  r1_dan: string
  r2_base: string
  r2_dan: string
  r3_base: string
  r3_dan: string
  r4_base: string
  r4_dan: string
  r5_base: string
  r5_dan: string
  r6_base: string
  r6_dan: string
  r10_base: string
  r10_dan: string
  r11_base: string
  r11_dan: string
  r12_base: string
  r12_dan: string
  r13_base: string
  r13_dan: string
  r20_base: string
  r21_base: string
  r22_base: string
  r25_base: string
  r40_base: string
  r40_dan: string
  r41_base: string
  r41_dan: string
  r43_base: string
  r43_dan: string
  r44_base: string
  r44_dan: string
  r50_base: string
  dan_na_vystupu: string
  odpocet: string
  vlastni_dan: string
}

/** Only keep attributes whose whole-koruna value is non-zero. */
function nonZeroKoruna(
  entries: Record<string, string | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(entries)) {
    const f = koruna(v)
    if (f && f !== "0") out[k] = f
  }
  return out
}

/** Build a DPHDP3 model from computed VAT figures + org meta. */
export function buildDphdp3FromAccounting(
  figures: DphFigures,
  meta: FuFilingMeta,
): Dphdp3Input {
  const veta1 = nonZeroKoruna({
    obrat23: figures.r1_base,
    dan23: figures.r1_dan,
    obrat5: figures.r2_base,
    dan5: figures.r2_dan,
    p_zb23: figures.r3_base,
    dan_pzb23: figures.r3_dan,
    p_zb5: figures.r4_base,
    dan_pzb5: figures.r4_dan,
    p_sl23_e: figures.r5_base,
    dan_psl23_e: figures.r5_dan,
    p_sl5_e: figures.r6_base,
    dan_psl5_e: figures.r6_dan,
    rez_pren23: figures.r10_base,
    dan_rpren23: figures.r10_dan,
    rez_pren5: figures.r11_base,
    dan_rpren5: figures.r11_dan,
    p_sl23_z: figures.r12_base,
    dan_psl23_z: figures.r12_dan,
    p_sl5_z: figures.r13_base,
    dan_psl5_z: figures.r13_dan,
  })
  const veta2 = nonZeroKoruna({
    dod_zb: figures.r20_base,
    pln_sluzby: figures.r21_base,
    pln_vyvoz: figures.r22_base,
    pln_rez_pren: figures.r25_base,
  })
  // Veta4 — a full-deduction plátce fills the "V plné výši" daň column only. Per
  // the FÚ popis struktury that column is `odp_tuz23_nar` / `odp_tuz5_nar` on
  // ř.40/41 (`_nar` = nárok v plné výši), NOT the bare `odp_tuz*`, which is the
  // krácený column. ř.43/44 use the other naming: `od_` is plná, `odkr_` krácený.
  const veta4 = nonZeroKoruna({
    pln23: figures.r40_base,
    odp_tuz23_nar: figures.r40_dan,
    pln5: figures.r41_base,
    odp_tuz5_nar: figures.r41_dan,
    nar_zdp23: figures.r43_base,
    od_zdp23: figures.r43_dan,
    nar_zdp5: figures.r44_base,
    od_zdp5: figures.r44_dan,
  })
  // ř.50 = plnění osvobozená bez nároku na odpočet (§51), the FULL total → plnosv_kf.
  // NOT plnosv_nkf (that is the ř.51 "bez nároku" carve-out excluded from the §76/4
  // koeficient, which the accounting output does not compute).
  const veta5 = nonZeroKoruna({ plnosv_kf: figures.r50_base })
  // Veta6 — daňová povinnost. ř.64/65 are derived from the ALREADY-ROUNDED whole-koruna
  // ř.62 and ř.63 so the return foots exactly (round(a) − round(b), never round(a − b),
  // which can differ by 1 Kč and trip EPO's ř.64/65 kontrolní vazba). Kladná → ř.64
  // (dano_da); nadměrný odpočet (záporná) → ř.65 (dano_no) as an absolute value.
  const danOut = new Decimal(koruna(figures.dan_na_vystupu) ?? "0")
  const odpCelk = new Decimal(koruna(figures.odpocet) ?? "0")
  const vlastniInt = danOut.minus(odpCelk)
  const isRefund = vlastniInt.lt(0)
  const veta6 = nonZeroKoruna({
    dan_zocelk: danOut.toFixed(0),
    odp_zocelk: odpCelk.toFixed(0),
    dano_da: isRefund ? undefined : vlastniInt.toFixed(0),
    dano_no: isRefund ? vlastniInt.abs().toFixed(0) : undefined,
  })

  return {
    header: {
      rok: meta.rok,
      mesic: meta.mesic,
      ctvrt: meta.ctvrt,
      zdobd_od: meta.zdobd_od,
      zdobd_do: meta.zdobd_do,
      dapdph_forma: meta.forma ?? "B",
      typ_platce: "P",
    },
    payer: {
      c_ufo: meta.c_ufo,
      dic: meta.dic,
      typ_ds: meta.typ_ds ?? "P",
      zkrobchjm: meta.name,
      naz_obce: meta.naz_obce,
      ulice: meta.ulice,
      c_pop: meta.c_pop,
      psc: meta.psc,
    },
    veta1: emptyToUndef(veta1),
    veta2: emptyToUndef(veta2),
    veta4: emptyToUndef(veta4),
    veta5: emptyToUndef(veta5),
    veta6: emptyToUndef(veta6),
  }
}

function emptyToUndef(
  r: Record<string, string>,
): Record<string, string> | undefined {
  return Object.keys(r).length > 0 ? r : undefined
}

// ── DPHKH1 ──────────────────────────────────────────────────────────────────

/** Subset of accounting `KhRow` (Decimal = string). */
export interface KhRowInput {
  tax_id: string | null
  /**
   * ISO member state that issued `tax_id`. Only A.2 needs it — that section
   * splits the VAT id into `k_stat` + `vatid_dod`. Everywhere else the DIČ is a
   * Czech one and is filed whole.
   */
  country_code?: string | null
  doklad: string
  dppd: string
  kod: string | null
  base21: string
  dan21: string
  base12: string
  dan12: string
}

/**
 * Subset of accounting `KhAggregate` — the A.5 / B.3 souhrnný řádek.
 *
 * `base`/`dan` are the rate-blind totals the DB path produces (its SQL has no rate
 * split on the aggregate). `base21`/`dan21`/`base12`/`dan12` are optional and let a
 * caller that DOES know the split supply it: without them the whole aggregate has
 * to be filed in the 21 % bucket, which misstates the sazba on any sub-threshold
 * 12 % plnění and breaks EPO's vazba between A.5 and ř.2 of the přiznání.
 */
export interface KhAggregateInput {
  base: string
  dan: string
  base21?: string
  dan21?: string
  base12?: string
  dan12?: string
}

/** Subset of accounting `KontrolniHlaseni` (the row sections). */
export interface KhData {
  a1: KhRowInput[]
  a2: KhRowInput[]
  a4: KhRowInput[]
  a5: KhAggregateInput
  b1: KhRowInput[]
  b2: KhRowInput[]
  b3: KhAggregateInput
}

/** Two rate buckets (1 = 21 %, 2 = 12 %), zero amounts dropped. */
function buckets(r: KhRowInput): Record<string, string> {
  const out: Record<string, string> = {}
  const b21 = haler(r.base21)
  const d21 = haler(r.dan21)
  const b12 = haler(r.base12)
  const d12 = haler(r.dan12)
  if (b21 && b21 !== "0.00") out.zakl_dane1 = b21
  if (d21 && d21 !== "0.00") out.dan1 = d21
  if (b12 && b12 !== "0.00") out.zakl_dane2 = b12
  if (d12 && d12 !== "0.00") out.dan2 = d12
  return out
}

/** Build a DPHKH1 model from the accounting KH sections + org meta. */
export function buildDphkh1FromAccounting(
  kh: KhData,
  meta: FuFilingMeta,
): Dphkh1Input {
  // A.1 §92 dodavatel: single base (odběratel self-assesses), §92 kód.
  const a1 = kh.a1.map((r) => ({
    dic_odb: r.tax_id ?? "",
    c_evid_dd: r.doklad,
    duzp: r.dppd,
    zakl_dane1: haler(addStr(r.base21, r.base12)) ?? "0.00",
    kod_pred_pl: r.kod ?? "",
  }))
  // A.2's VAT id is split like the souhrnné hlášení's: `vatid_dod` is documented
  // "ve formátu bez mezer bez kódu členského státu", and the country goes in
  // `k_stat`. The prefixed form both mismatches VIES and, at 12 characters
  // (NL …B01, SE, LT, XI), overruns the attribute's maxLength.
  const a2 = kh.a2.map((r) => {
    const { k_stat, c_vat } = splitVatId(r.country_code ?? null, r.tax_id)
    return {
      k_stat: k_stat || undefined,
      vatid_dod: c_vat || undefined,
      c_evid_dd: r.doklad,
      dppd: r.dppd,
      ...buckets(r),
    }
  })
  const a4 = kh.a4.map((r) => ({
    dic_odb: r.tax_id ?? "",
    c_evid_dd: r.doklad,
    dppd: r.dppd,
    ...buckets(r),
    kod_rezim_pl: "0",
    zdph_44: "N",
  }))
  const b1 = kh.b1.map((r) => ({
    dic_dod: r.tax_id ?? "",
    c_evid_dd: r.doklad,
    duzp: r.dppd,
    ...buckets(r),
    kod_pred_pl: r.kod ?? "",
  }))
  const b2 = kh.b2.map((r) => ({
    dic_dod: r.tax_id ?? "",
    c_evid_dd: r.doklad,
    dppd: r.dppd,
    ...buckets(r),
    pomer: "N",
    zdph_44: "N",
  }))
  // A.5 / B.3 aggregate. When the caller supplies a rate split, each sazba goes to
  // its own bucket (1 = 21 %, 2 = 12 %). Otherwise the source genuinely does not
  // know the split — the DB path's KhAggregate is rate-blind — and the whole total
  // has to land in bucket 1; that misstates a sub-threshold 12 % plnění, so a
  // caller that can split SHOULD.
  const aggregate = (
    a: KhAggregateInput,
  ): Record<string, string> | undefined => {
    const out: Record<string, string> = {}
    const put = (key: string, value: string | undefined) => {
      const f = haler(value)
      if (f && f !== "0.00") out[key] = f
    }
    const split =
      a.base21 !== undefined ||
      a.dan21 !== undefined ||
      a.base12 !== undefined ||
      a.dan12 !== undefined
    if (split) {
      put("zakl_dane1", a.base21)
      put("dan1", a.dan21)
      put("zakl_dane2", a.base12)
      put("dan2", a.dan12)
    } else {
      put("zakl_dane1", a.base)
      put("dan1", a.dan)
    }
    return Object.keys(out).length > 0 ? out : undefined
  }

  return {
    header: {
      rok: meta.rok,
      mesic: meta.mesic,
      ctvrt: meta.ctvrt,
      zdobd_od: meta.zdobd_od,
      zdobd_do: meta.zdobd_do,
      khdph_forma: meta.forma ?? "B",
    },
    payer: {
      c_ufo: meta.c_ufo,
      dic: meta.dic,
      typ_ds: meta.typ_ds ?? "P",
      zkrobchjm: meta.name,
      naz_obce: meta.naz_obce,
      ulice: meta.ulice,
      c_pop: meta.c_pop,
      psc: meta.psc,
    },
    a1: a1.length > 0 ? a1 : undefined,
    a2: a2.length > 0 ? a2 : undefined,
    a4: a4.length > 0 ? a4 : undefined,
    a5: aggregate(kh.a5),
    b1: b1.length > 0 ? b1 : undefined,
    b2: b2.length > 0 ? b2 : undefined,
    b3: aggregate(kh.b3),
  }
}

/** Exact sum of two decimal strings (money rule — never native number arithmetic). */
function addStr(a: string, b: string): string {
  return new Decimal(a || 0).plus(new Decimal(b || 0)).toString()
}

// ── DPHSHV ──────────────────────────────────────────────────────────────────

/** Subset of accounting `ShRow` (Decimal = string). */
export interface ShRowInput {
  /** ISO 3166-1 alpha-2 member state that issued the acquirer's VAT id. */
  country_code: string | null
  /** Acquirer's VAT id, with or without the country prefix. */
  tax_id: string | null
  /** kód plnění: "0" zboží §13 / "1" přemístění §13/6 / "2" §17 / "3" služba §9/1. */
  kod_plneni: string
  /** Počet plnění tomuto pořizovateli. */
  count: number
  /** Celková hodnota plnění (CZK, bez daně). */
  value: string
}

/** Subset of accounting `SouhrnneHlaseni` (the recap rows). */
export interface ShData {
  rows: ShRowInput[]
}

/**
 * Build a DPHSHV model from the accounting SH rows + org meta.
 *
 * Every row is emitted, including one whose counterparty carries no VAT id: the
 * hodnota is real tax data and dropping it would understate the hlášení silently.
 * Such a row fails EPO's mandatory-field check, which is the correct place for it
 * to surface — the caller should validate before offering the file for upload.
 *
 * `forma` defaults to "R" (řádné). DPHSHV uses R/N, NOT the B/O/D/E of DPHDP3 or
 * the B/O/N of DPHKH1, so a caller passing a DPHDP3-style forma is a bug.
 */
export function buildDphshvFromAccounting(
  sh: ShData,
  meta: FuFilingMeta,
): DphshvInput {
  // Re-aggregate AFTER normalizing the VAT id. The upstream grouping key is the raw
  // (country_code, tax_id, kód) triple, so "SK 123", "SK123" and a bare "123" with
  // country SK arrive as three rows that normalize to one identical (k_stat, c_vat,
  // k_pln_eu) — and the schema forbids exactly that: "Žádné daňové identifikační
  // číslo nesmí být v hlášení uvedeno více než jednou se stejným kódem plnění."
  // Summing here also means pln_hodnota is rounded once per filed row rather than
  // once per input row, so Σ rows stays as close to ř.20+ř.21 as the rule allows.
  const merged = new Map<
    string,
    {
      k_stat?: string
      c_vat?: string
      kod: string
      count: number
      value: Decimal
    }
  >()
  for (const r of sh.rows) {
    const { k_stat, c_vat } = splitVatId(r.country_code, r.tax_id)
    const key = `${k_stat ?? ""}|${c_vat ?? ""}|${r.kod_plneni}`
    const entry = merged.get(key)
    if (entry) {
      entry.count += r.count
      entry.value = entry.value.plus(new Decimal(r.value || 0))
    } else {
      merged.set(key, {
        k_stat,
        c_vat,
        kod: r.kod_plneni,
        count: r.count,
        value: new Decimal(r.value || 0),
      })
    }
  }
  // No c_rad / por_c_stran: both are documented as pure ordering hints ("Pokud je
  // uvedeno, budou řádky ... uspořádány v zadaném pořadí") and VetaR's c_rad is
  // totalDigits=2, so a sequential index makes every hlášení with 100+ counterparties
  // fail XSD validation on row 100. Document order is already the intended order.
  const rows = [...merged.values()].map((r) => ({
    k_stat: r.k_stat,
    c_vat: r.c_vat,
    k_pln_eu: r.kod,
    pln_pocet: String(r.count),
    pln_hodnota: korunaNahoru(r.value.toString()),
  }))
  return {
    header: {
      shvies_forma: meta.forma ?? "R",
      rok: meta.rok,
      mesic: meta.mesic,
      ctvrt: meta.ctvrt,
    },
    payer: {
      c_ufo: meta.c_ufo,
      dic: meta.dic,
      typ_ds: meta.typ_ds ?? "P",
      zkrobchjm: meta.name,
      naz_obce: meta.naz_obce,
      ulice: meta.ulice,
      c_pop: meta.c_pop,
      psc: meta.psc,
    },
    rows: rows.length > 0 ? rows : undefined,
  }
}
