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
  psc?: string
  /** Převažující ekonomická činnost (CZ-NACE), numeric. */
  c_nace?: string
  /** Typ daňového přiznání (default "A" — za zdaňovací období). */
  typ_dapdpp?: string
  /** Typ zdaňovacího období (§21a; default "A" — kalendářní rok). */
  typ_zo?: string
  /** Typ poplatníka (default "1" — ostatní; "3" veřejně prospěšný). */
  typ_popldpp?: string
  /** Forma přiznání (default "B" — řádné). */
  forma?: string
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
  /** ř.110 — osvobozené / nezahrnované výnosy (§19), reduction. */
  osvobozene_vynosy: string
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

/** Build a DPPO model from the accounting worksheet figures + org meta. */
export function buildDppoFromAccounting(
  figures: DppoFigures,
  meta: DppoFilingMeta,
): DppoInput {
  // VetaO detail lines the worksheet produces (attribute map in the grounding doc).
  const vetaO = nonZeroKoruna({
    kc_ii10_10: figures.ucetni_vysledek, // ř.10 výsledek hospodaření
    kc_ii50_40: figures.nedanove_naklady, // ř.40 §24/25 add-back
    kc_ii72_62: figures.exclude_loss, // ř.62 §18a VPP removal (ostatní zvýšení)
    kc_ii120_110: figures.osvobozene_vynosy, // ř.110 §19 osvobozené
    kc_ii210_230: figures.odpocet_ztraty, // ř.230 odečet daňové ztráty §34/1
    // ř.280 sazba as a whole percent (0.21 → "21").
    kc_ii270_280: new Decimal(figures.sazba || 0).times(100).toFixed(0),
    kc_ii290_300: figures.slevy, // ř.300 slevy §35
  })

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
    },
    payer: nonEmpty({
      dic: meta.dic,
      zkrobchjm: meta.name,
      naz_obce: meta.naz_obce,
      ulice: meta.ulice,
      c_pop: meta.c_pop,
      psc: meta.psc,
    }),
    vetaO,
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
