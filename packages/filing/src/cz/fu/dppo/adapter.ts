// Adapter: map the platform's DPPO worksheet (@workspace/accounting `Dppo`) into the
// filing model. Keeps @workspace/filing a PURE serialize package — it must NOT depend
// on @workspace/accounting (that drags in @workspace/db + drizzle). The input is a
// filing-local `DppoFigures` interface the accounting `Dppo` output satisfies (the
// caller passes the worksheet's decimal fields straight in).
//
// The worksheet computes coarse lumps (`nedanove_naklady`, `osvobozene_vynosy`) rather
// than the form's ~40 detailed add-back/reduction řádky, so the adapter places each
// lump on the canonical general line and lets the form arithmetic (computeDppoTotals)
// fill the mezisoučty + tax chain — so the return foots by construction and matches the
// worksheet's `dan`. The lump→řádek placements are the one part not fully pinned by
// the XSD; they are documented in .context/xml-filing-tier3-grounding.md and gated by
// the Advisor review before Hleb signs off.

import Decimal from "decimal.js-light"
import { koruna } from "../envelope"
import { applyDppoTotals } from "./compute"
import { buildPrilohaVety, type DppoPriloha } from "./priloha"
import { buildZaverkaVety, type DppoZaverka } from "./zaverka"
import { buildZadostVety, type DppoZadostSbirka } from "./zadost"
import { DppoSchema, type DppoInput } from "../../../model/dppo"

/** Identity + period metadata (supplied by the org, not part of the tax figures). */
export interface DppoFilingMeta {
  /** Zdaňovací období od (ISO or D.M.YYYY). */
  zdobd_od: string
  /** Zdaňovací období do. */
  zdobd_do: string
  /** Kód místně příslušného finančního úřadu (číselník ufo; 1–4 digits). */
  c_ufo_cil: string
  /** DIČ (with or without CZ prefix — the writer strips to digits). */
  dic: string
  /** Obchodní jméno. */
  name?: string
  naz_obce?: string
  ulice?: string
  c_pop?: string
  /** Číslo orientační, when the address carries one alongside č. popisné. */
  c_orient?: string
  psc?: string
  /** Telefon poplatníka. EPO prints it on the return and uses it for queries. */
  c_telef?: string
  /**
   * Osoba oprávněná jednat za poplatníka (I. oddíl, "Podpis"). Not the same as
   * the účetní jednotka: it is the statutární orgán or the zmocněnec who signs,
   * so a return with no `opr_*` names nobody as the signatory.
   */
  opr_jmeno?: string
  opr_prijmeni?: string
  /** e.g. "STATUTÁRNÍ ORGÁN". */
  opr_postaveni?: string
  /** Převažující ekonomická činnost (CZ-NACE), numeric. */
  c_nace?: string
  /**
   * I. oddíl položka 07 — kategorie účetní jednotky podle § 1b ZoÚ:
   * M mikro / L malá / S střední / V velká. Povinné pro každého, kdo vede
   * (podvojné) účetnictví; jen jednoduché účetnictví je z něj vyňato.
   */
  kat_uj?: string
  /**
   * I. oddíl položka 11 — účetní závěrka je přiložena ("A"/"N"), podle § 18 ZoÚ.
   * Rozvahu a Výkaz zisku a ztráty nese `zaverka` níže jako vyplněné výkazy
   * přímo v tomto XML; Příloha účetní závěrky je text, ne tabulka, takže ta
   * zůstává E-přílohou, kterou filer vkládá v EPO.
   */
  uc_zav?: string
  /**
   * Účetní výkazy carried in the return (VetaD): číslo vyhlášky ("500" for
   * podnikatele), měna účetnictví, and the rozsah the výkazy are reported in —
   * `uv_rozsah` when the rozvaha and the VZZ share one (P/Z/M), otherwise the
   * split pair, which EPO requires to be filled together when they differ (a
   * mikro ÚJ files the rozvaha as M but the VZZ only has P and Z).
   */
  uv_vyhl?: string
  uv_mena?: string
  uv_rozsah?: string
  uv_rozsah_rozv?: string
  uv_rozsah_vzz?: string
  /** Typ daňového přiznání (default "A" — za zdaňovací období). */
  typ_dapdpp?: string
  /** Typ zdaňovacího období (§21a; default "A" — kalendářní rok). */
  typ_zo?: string
  /** Typ poplatníka (default "1" — ostatní; "3" veřejně prospěšný). */
  typ_popldpp?: string
  /** Forma přiznání (default "B" — řádné). */
  forma?: string
  /**
   * Rozvahový den (§ 19 odst. 1 ZoÚ) — the day the závěrka is drawn up to. Not
   * derivable from `zdobd_do`: a závěrka can be mimořádná, and EPO carries the
   * two independently.
   */
  d_uv?: string
  /**
   * Účetní závěrka ověřena auditorem ("A"/"N"). Together with `dan_por` this
   * decides the § 136 DŘ deadline, so it is not cosmetic.
   */
  audit?: string
  /** Přiznání zpracoval a předkládá daňový poradce ("A"/"N"). */
  dan_por?: string
  /** Účetní závěrka řádná ("T") vs mimořádná/mezitímní ("N"). */
  uz_rad?: string
}

/**
 * Subset of the accounting `Dppo` worksheet the return needs (Decimal = string).
 * `sazba` is the decimal-fraction rate (e.g. "0.21"); the adapter emits it as the
 * whole-percent ř.280. Amounts are koruna decimal strings.
 */
export interface DppoFigures {
  /** ř.10 — výsledek hospodaření před zdaněním (zisk +, ztráta −). */
  ucetni_vysledek: string
  /** ř.40 — daňově neuznatelné náklady (§24/25), add-back. */
  nedanove_naklady: string
  /**
   * ř.50 — rozdíl, o který účetní odpisy převyšují daňové (§26–33), add-back.
   * The XSD ř.40 definition explicitly excludes this, so it is its own line.
   * Optional; omit when zero.
   */
  odpisy_ucetni_nad_danove?: string
  /** ř.110 — osvobozené / nezahrnované výnosy (§19), reduction. */
  osvobozene_vynosy: string
  /**
   * ř.150 — rozdíl, o který daňové odpisy převyšují účetní, reduction (opak
   * ř.50). Optional; omit when zero.
   */
  odpisy_danove_nad_ucetni?: string
  /**
   * ř.62 — §18a/1 removal of a loss-making hlavní činnost for a veřejně prospěšný
   * poplatník (increases the base toward 0). Optional; only VPP orgs set it.
   */
  exclude_loss?: string
  /** ř.230 — odečet daňové ztráty minulých let (§34/1). */
  odpocet_ztraty: string
  /** Sazba daně jako desetinný zlomek ("0.21"). */
  sazba: string
  /** ř.300 — slevy na dani (§35). */
  slevy: string
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

/**
 * Build a DPPO model from the accounting worksheet figures + org meta.
 *
 * `priloha` carries Příloha č. 1 II. oddílu (tabulky A a B) and tabulka K. It is
 * optional only because a partial return is still worth generating; a filable
 * one needs tabulka A whenever ř.40 is non-zero, tabulka B whenever ř.150 is,
 * and tabulka K always (Pokyny: "Údaj vyplňují všichni poplatníci").
 *
 * `zaverka` carries the účetní závěrka itself — Rozvaha + Výkaz zisku a ztráty
 * as EPO's own structured tables, so the poplatník does not retype them into the
 * portal. Also optional: a return generated before the výkazy are closed is
 * still worth having, and § 18 ZoÚ is satisfied either by these tables or by
 * e-přílohy (which `meta.uc_zav` declares).
 */
export function buildDppoFromAccounting(
  figures: DppoFigures,
  meta: DppoFilingMeta,
  priloha?: DppoPriloha,
  zaverka?: DppoZaverka,
  zadost?: DppoZadostSbirka,
): DppoInput {
  // VetaO detail lines the worksheet produces (attribute map in the grounding doc).
  const vetaO = nonZeroKoruna({
    kc_ii10_10: figures.ucetni_vysledek, // ř.10 výsledek hospodaření
    kc_ii50_40: figures.nedanove_naklady, // ř.40 §24/25 add-back
    kc_ii60_50: figures.odpisy_ucetni_nad_danove, // ř.50 účetní > daňové odpisy
    kc_ii72_62: figures.exclude_loss, // ř.62 §18a VPP removal (ostatní zvýšení)
    kc_ii120_110: figures.osvobozene_vynosy, // ř.110 §19 osvobozené
    kc_ii170_150: figures.odpisy_danove_nad_ucetni, // ř.150 daňové > účetní odpisy
    kc_ii210_230: figures.odpocet_ztraty, // ř.230 odečet daňové ztráty §34/1
    // ř.280 sazba as a whole percent (0.21 → "21").
    kc_ii270_280: new Decimal(figures.sazba || 0).times(100).toFixed(0),
    kc_ii290_300: figures.slevy, // ř.300 slevy §35
  })

  // ř.10 carries the day the výsledek hospodaření is struck to. `dateInMultiFormat`
  // in the XSD, so it is set beside the amounts rather than through
  // `nonZeroKoruna`, which would treat it as a částka. Same rozvahový den as the
  // závěrka: the VH on ř.10 IS the one the výkazy foot to.
  if (meta.d_uv) vetaO.d_hospvysl = meta.d_uv

  const model: DppoInput = {
    header: {
      typ_dapdpp: meta.typ_dapdpp ?? "A",
      typ_zo: meta.typ_zo ?? "A",
      typ_popldpp: meta.typ_popldpp ?? "1",
      dapdpp_forma: meta.forma ?? "B",
      c_ufo_cil: meta.c_ufo_cil,
      zdobd_od: meta.zdobd_od,
      zdobd_do: meta.zdobd_do,
      ...(meta.c_nace ? { c_nace: meta.c_nace } : {}),
      ...(meta.kat_uj ? { kat_uj: meta.kat_uj } : {}),
      ...(meta.uc_zav ? { uc_zav: meta.uc_zav } : {}),
      ...(meta.uv_vyhl ? { uv_vyhl: meta.uv_vyhl } : {}),
      ...(meta.uv_mena ? { uv_mena: meta.uv_mena } : {}),
      ...(meta.uv_rozsah ? { uv_rozsah: meta.uv_rozsah } : {}),
      ...(meta.uv_rozsah_rozv ? { uv_rozsah_rozv: meta.uv_rozsah_rozv } : {}),
      ...(meta.uv_rozsah_vzz ? { uv_rozsah_vzz: meta.uv_rozsah_vzz } : {}),
      ...(meta.d_uv ? { d_uv: meta.d_uv } : {}),
      ...(meta.audit ? { audit: meta.audit } : {}),
      ...(meta.dan_por ? { dan_por: meta.dan_por } : {}),
      ...(meta.uz_rad ? { uz_rad: meta.uz_rad } : {}),
    },
    payer: nonEmpty({
      dic: meta.dic,
      zkrobchjm: meta.name,
      naz_obce: meta.naz_obce,
      ulice: meta.ulice,
      c_pop: meta.c_pop,
      c_orient: meta.c_orient,
      psc: meta.psc,
      c_telef: meta.c_telef,
      opr_jmeno: meta.opr_jmeno,
      opr_prijmeni: meta.opr_prijmeni,
      opr_postaveni: meta.opr_postaveni,
    }),
    vetaO,
    // Daňové přílohy first, then the účetní závěrka — DPPO_EXTRA_VETA_TAGS puts
    // the U-block after them, and the writer emits extraVety in array order.
    // XSD sequence: daňové přílohy (VetaU…S) -> účetní závěrka (VetaUA/UB/UD)
    // -> žádost o sbírku listin (VetaUZ), which DPPO_EXTRA_VETA_TAGS puts last.
    extraVety: [
      ...(priloha ? buildPrilohaVety(priloha) : []),
      ...(zaverka ? buildZaverkaVety(zaverka) : []),
      ...(zadost ? buildZadostVety(zadost) : []),
    ],
  }

  // Fill the mezisoučty + tax chain (ř.70/170/200/250/270/290/310/340/360) so the
  // return foots and ř.290 daň matches the worksheet's computed `dan`.
  const { model: withTotals } = applyDppoTotals(DppoSchema.parse(model))
  return withTotals
}

/** Drop nullish/empty fields; return undefined if nothing is left. */
function nonEmpty(
  entries: Record<string, string | undefined>,
): Record<string, string> | undefined {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(entries)) {
    if (v != null && v !== "") out[k] = v
  }
  return Object.keys(out).length > 0 ? out : undefined
}
