// CZ OSVČ (fyzická osoba podnikatel) taxonomy — daňová evidence peněžní deník, bookkeeping-regime
// triggers, paušální výdaje / paušální daň, the DPFO (§16) tax base, and the ČSSZ/ZP přehledy.
// KB gap-closer (WP-0.4c). Closes the brief's "no peněžní-deník column taxonomy, no DPFO DAP workflow,
// ČSSZ/ZP přehledy absent" gap; gates Fixture-2 (OSVC-2025-NEPLATCE-DE-01).
//
// NOT advisor-gated (lower stakes), but the 2026 monetary values were independently verified against
// official Finanční správa / ČSSZ / VZP sources (Opus-xhigh, 2026-06-25) before encoding — several were
// KB-flagged "verify for 2026" and TWO turned out to be SPLIT-YEAR (see below), so a single annual figure
// would have been confident-wrong for H2 2026.
//
// All monetary values are in haléř (minor units) as bigint — money is never a native `number`.

/** The tax year these 2026-specific monetary values are pinned to. */
export const TAX_YEAR = 2026

/** Průměrná mzda 2026 = 48 967 Kč (nařízení vlády č. 365/2025 Sb.); drives the §16 23% threshold + min bases. */
export const AVERAGE_WAGE_2026_CZK_MINOR = 4_896_700n

// ────────────────────────────────────────────────────────────────────────────
// 1. Bookkeeping regime + účetní jednotka triggers (zák. 563/1991 Sb.)
// ────────────────────────────────────────────────────────────────────────────

/** How an FO podnikatel keeps records. */
export type OsvcBookkeepingRegime =
  /** Daňová evidence — cash-basis §7b ZDP; default if not an účetní jednotka and paušál not elected. */
  | "danova_evidence"
  /** Účetnictví — full double-entry (zák. 563/1991 + Decree 500/2002); once an účetní jednotka. */
  | "ucetnictvi"
  /** Paušální výdaje — flat-rate expense % within the normal DAP (§7 odst. 7). */
  | "pausalni_vydaje"
  /** Paušální daň — opt-in all-in monthly regime replacing the DAP (§2a / §7a ZDP). */
  | "pausalni_dan"

/**
 * §1 odst. 2 písm. e) zák. 563/1991 — obrat (per §4a zák. 235/2004) threshold above which a podnikající
 * FO becomes an účetní jednotka: 25 000 000 Kč. RESOLVED (was KB-open): it is ONE bezprostředně
 * předcházející kalendářní rok (singular), not two consecutive.
 */
export const UCETNI_JEDNOTKA_OBRAT_THRESHOLD_CZK_MINOR = 2_500_000_000n

/** Statutory triggers that make a podnikající FO an účetní jednotka (must keep účetnictví). */
export type UcetniJednotkaTrigger =
  /** Obrat > 25M Kč in one preceding calendar year — §1 odst. 2 písm. e). */
  | "obrat_over_25m"
  /** Entry in the Obchodní rejstřík — §1 odst. 2 písm. d). */
  | "obchodni_rejstrik"
  /** Partner in a company where another partner is an účetní jednotka — §1 odst. 2 písm. g). */
  | "partner_in_ucetni_jednotka"
  /** Voluntary election. */
  | "voluntary"

/**
 * True if last year's obrat makes the FO an účetní jednotka under §1 odst. 2 písm. e).
 * NOTE this only sets účetní-jednotka STATUS (from 1 Jan of the year after the limit was exceeded);
 * the obligation to actually keep účetnictví starts a year later — see `ucetnictviObligationStartYear`.
 */
export function exceedsUcetniJednotkaObrat(
  priorYearObratCzkMinor: bigint,
): boolean {
  return priorYearObratCzkMinor > UCETNI_JEDNOTKA_OBRAT_THRESHOLD_CZK_MINOR
}

/**
 * §4 odst. 3 zák. 563/1991 — the one-year preparation buffer. If obrat is exceeded in calendar year
 * `exceededYear`, the FO becomes an účetní jednotka from 1 Jan `exceededYear + 1`, and must keep
 * účetnictví from the first day of the účetní období FOLLOWING that — i.e. from 1 Jan `exceededYear + 2`.
 */
export function ucetnictviObligationStartYear(exceededYear: number): number {
  return exceededYear + 2
}

// ────────────────────────────────────────────────────────────────────────────
// 2. Peněžní deník column taxonomy (daňová evidence, §7b ZDP)
// ────────────────────────────────────────────────────────────────────────────

/** The kind of a peněžní-deník column (drives whether it touches the §7 tax base). */
export type PenezniDenikColumnKind =
  | "header" // datum, doklad, popis
  | "money_cash" // pokladna příjem/výdaj
  | "money_bank" // banka příjem/výdaj
  | "transfer" // průběžné položky (cash ↔ bank), tax-neutral
  | "income_taxable" // příjmy zahrnované do základu daně
  | "income_nontaxable" // příjmy nezahrnované (DPH, vklady, úvěry, ...)
  | "expense_deductible" // výdaje zahrnované do základu daně
  | "expense_nondeductible" // výdaje nezahrnované (DPH, osobní spotřeba, splátky jistiny, ...)
  | "vat" // DPH evidence (plátce only)

export interface PenezniDenikColumn {
  id: string
  label_cz: string
  kind: PenezniDenikColumnKind
  /** Whether the column feeds the §7 dílčí základ daně (income/expense taxable columns). */
  affectsTaxBase: boolean
}

/**
 * The canonical daňová-evidence cash-journal column taxonomy. §7b ZDP prescribes WHAT must be recorded
 * (cash-basis příjmy/výdaje + majetek/závazky) but not a fixed column layout — this is the conventional
 * column set every CZ accounting package implements. `vat_*` columns apply only to a plátce.
 */
export const PENEZNI_DENIK_COLUMNS: readonly PenezniDenikColumn[] = [
  { id: "datum", label_cz: "Datum", kind: "header", affectsTaxBase: false },
  { id: "doklad", label_cz: "Doklad", kind: "header", affectsTaxBase: false },
  { id: "popis", label_cz: "Popis", kind: "header", affectsTaxBase: false },
  {
    id: "pokladna_prijem",
    label_cz: "Pokladna příjem",
    kind: "money_cash",
    affectsTaxBase: false,
  },
  {
    id: "pokladna_vydaj",
    label_cz: "Pokladna výdaj",
    kind: "money_cash",
    affectsTaxBase: false,
  },
  {
    id: "banka_prijem",
    label_cz: "Banka příjem",
    kind: "money_bank",
    affectsTaxBase: false,
  },
  {
    id: "banka_vydaj",
    label_cz: "Banka výdaj",
    kind: "money_bank",
    affectsTaxBase: false,
  },
  {
    id: "prubezne_polozky",
    label_cz: "Průběžné položky",
    kind: "transfer",
    affectsTaxBase: false,
  },
  {
    id: "prijmy_zd",
    label_cz: "Příjmy zahrnované do ZD",
    kind: "income_taxable",
    affectsTaxBase: true,
  },
  {
    id: "prijmy_nezd",
    label_cz: "Příjmy nezahrnované do ZD",
    kind: "income_nontaxable",
    affectsTaxBase: false,
  },
  {
    id: "vydaje_zd",
    label_cz: "Výdaje zahrnované do ZD",
    kind: "expense_deductible",
    affectsTaxBase: true,
  },
  {
    id: "vydaje_nezd",
    label_cz: "Výdaje nezahrnované do ZD",
    kind: "expense_nondeductible",
    affectsTaxBase: false,
  },
  {
    id: "dph_na_vstupu",
    label_cz: "DPH na vstupu",
    kind: "vat",
    affectsTaxBase: false,
  },
  {
    id: "dph_na_vystupu",
    label_cz: "DPH na výstupu",
    kind: "vat",
    affectsTaxBase: false,
  },
] as const

// ────────────────────────────────────────────────────────────────────────────
// 3. Paušální výdaje (§7 odst. 7 ZDP; §9 odst. 4 for nájem) — 2026 rates + caps
// ────────────────────────────────────────────────────────────────────────────

export type PausalniVydajeBand =
  | "agriculture_craft_80" // zemědělství, řemeslné živnosti
  | "other_trade_60" // ostatní živnosti
  | "other_self_employment_40" // jiné §7 odst. 1 písm. c), d)
  | "rental_30" // nájem §9

export interface PausalniVydajeRule {
  ratePercent: number
  capCzkMinor: bigint
  basis: string
}

/** §7 odst. 7 / §9 odst. 4 — rates + annual caps, unchanged for 2026 (2M income reference). */
export const PAUSALNI_VYDAJE: Record<PausalniVydajeBand, PausalniVydajeRule> = {
  agriculture_craft_80: {
    ratePercent: 80,
    capCzkMinor: 160_000_000n,
    basis: "§7 odst. 7 písm. a) ZDP",
  }, // 1 600 000 Kč
  other_trade_60: {
    ratePercent: 60,
    capCzkMinor: 120_000_000n,
    basis: "§7 odst. 7 písm. b) ZDP",
  }, // 1 200 000 Kč
  other_self_employment_40: {
    ratePercent: 40,
    capCzkMinor: 80_000_000n,
    basis: "§7 odst. 7 písm. c) ZDP",
  }, // 800 000 Kč
  rental_30: {
    ratePercent: 30,
    capCzkMinor: 60_000_000n,
    basis: "§9 odst. 4 ZDP",
  }, // 600 000 Kč
}

/** The §7 odst. 7 income ceiling for electing paušální výdaje: 2 000 000 Kč. */
export const PAUSALNI_VYDAJE_INCOME_CEILING_CZK_MINOR = 200_000_000n

// ────────────────────────────────────────────────────────────────────────────
// 4. Paušální daň (§2a / §7a ZDP) — 2026 bands (Band 1 is SPLIT-YEAR)
// ────────────────────────────────────────────────────────────────────────────

/** A 2026 calendar half — the novela (40%→35% min sociální base) cut some advances from 1 July 2026. */
export type Half2026 = "h1_jan_jun" | "h2_jul_dec"

export type PausalniDanBand = "band_1" | "band_2" | "band_3"

/** Turnover ceilings per paušální-daň band (Kč minor): 1M / 1.5M / 2M. */
export const PAUSALNI_DAN_TURNOVER_CEILING_CZK_MINOR: Record<
  PausalniDanBand,
  bigint
> = {
  band_1: 100_000_000n,
  band_2: 150_000_000n,
  band_3: 200_000_000n,
}

/**
 * Monthly paušální-daň payment per band, 2026 (verified vs Finanční správa). Band 1 is SPLIT: the
 * president-signed novela (returning the OSVČ min důchodové base 40%→35% of average wage, retroactive
 * 1.1.2026) cut Band-1 advances from 1.7.2026 — 9 984 Kč Jan–Jun, 9 162 Kč from July. Bands 2 and 3 are
 * unchanged across the year.
 */
export function pausalniDanMonthlyCzkMinor(
  band: PausalniDanBand,
  half: Half2026,
): bigint {
  if (band === "band_1") {
    return half === "h1_jan_jun" ? 998_400n : 916_200n // 9 984 / 9 162 Kč
  }
  if (band === "band_2") {
    return 1_674_500n // 16 745 Kč
  }
  return 2_713_900n // 27 139 Kč
}

/**
 * Entry-into-paušální-režim notification deadline: the statutory rule is "do desátého dne zdaňovacího
 * období" (10 January), shifted to the next business day if it falls on a weekend/holiday. For 2026 the
 * 10th was a Saturday, so the effective deadline was 12 January 2026. Encoded as the statutory rule, not
 * a hardcoded date.
 */
export const PAUSALNI_DAN_ENTRY_DEADLINE =
  "10. ledna zdaňovacího období (posun na nejbližší pracovní den)"

// ────────────────────────────────────────────────────────────────────────────
// 5. DPFO — daň z příjmů fyzických osob (§16 ZDP)
// ────────────────────────────────────────────────────────────────────────────

/** Dílčí základy daně (partial tax bases) that compose the §5 celkový základ daně. */
export type DpfoDilciZaklad =
  | "par_6_zamestnani" // závislá činnost
  | "par_7_podnikani" // samostatná činnost (OSVČ) = příjmy − výdaje (actual or paušál)
  | "par_8_kapital" // kapitálový majetek
  | "par_9_najem" // nájem
  | "par_10_ostatni" // ostatní příjmy

/** §16 progressive rates 2026: 15 % up to the threshold, 23 % above. */
export const DPFO_RATE_LOWER_PERCENT = 15
export const DPFO_RATE_UPPER_PERCENT = 23

/** §16 — the 23 % rate applies to the annual základ daně above 36× průměrná mzda = 1 762 812 Kč (2026). */
export const DPFO_PROGRESSIVE_THRESHOLD_2026_CZK_MINOR = 176_281_200n

/**
 * §35ba odst. 1 písm. a) — základní sleva na poplatníka: 30 840 Kč/rok (2 570 Kč/měsíc), unchanged for
 * 2026. NOTE: verified from a secondary tax-summary source only (the statute/FS pages did not render to
 * the fetch tool); the figure is well-established and not subject to a 2026 change.
 */
export const SLEVA_NA_POPLATNIKA_2026_CZK_MINOR = 3_084_000n // confidence: secondary

/** The §16 rate for an annual základ daně (the lower rate up to the threshold, upper above it). */
export function dpfoMarginalRatePercent(
  annualZakladDaneCzkMinor: bigint,
): number {
  return annualZakladDaneCzkMinor > DPFO_PROGRESSIVE_THRESHOLD_2026_CZK_MINOR
    ? DPFO_RATE_UPPER_PERCENT
    : DPFO_RATE_LOWER_PERCENT
}

// ────────────────────────────────────────────────────────────────────────────
// 6. Přehledy — ČSSZ (sociální) + zdravotní pojišťovna, 2026
// ────────────────────────────────────────────────────────────────────────────

/** Annual Přehled o příjmech a výdajích filing deadlines for tax year 2025 (filed in 2026). */
export const PREHLED_DEADLINES_2026 = {
  /** ČSSZ standard (return filed within the 3-month window). */
  cssz_standard: "2026-05-04",
  /** ČSSZ when the DAP was filed electronically in the extended window (after 1.4.2026). */
  cssz_electronic_extended: "2026-06-01",
  /** ČSSZ when a daňový poradce filed the DAP after 1.4.2026. */
  cssz_tax_advisor: "2026-08-03",
  /** Zdravotní pojišťovna: within one month of the DAP deadline; from 2026 electronic-only. */
  zdravotni_rule:
    "do 1 měsíce od lhůty pro podání DAP (od 2026 pouze elektronicky)",
} as const

/**
 * Minimum monthly advance for a main-activity (hlavní činnost) OSVČ, 2026. Důchodové (sociální) is
 * SPLIT-YEAR: 5 720 Kč Jan–Jun, 5 005 Kč from 1.7.2026 (min vyměřovací základ 40%→35% of average wage,
 * president-signed novela). Zdravotní is 3 306 Kč for the whole year (50% base, NOT affected).
 */
export function minMonthlyDuchodoveAdvanceCzkMinor(half: Half2026): bigint {
  return half === "h1_jan_jun" ? 572_000n : 500_500n // 5 720 / 5 005 Kč
}

export const MIN_MONTHLY_ZDRAVOTNI_ADVANCE_2026_CZK_MINOR = 330_600n // 3 306 Kč, whole year
