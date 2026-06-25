// CZ PDP (reverse charge / přenesená daňová povinnost) recipient self-assessment taxonomy.
// KB gap-closer (WP-0.4b). Reference knowledge — DAP/KH line mapping, the 343 output/input split
// requirement, and legal-basis tagging by category — NOT an executable booking template (the booking
// path stays agent-native; a golden fixture, WP-0.8, encodes the concrete posting).
//
// Anchored to primary law per `.context/afframe-brain/research/deep/CZ-LAW-SIGNOFF.md` QUESTION 2
// (Opus-xhigh adversarial primary-law verification, GREEN) + the WP-0.4b advisor gate (`gates/0.4b.md`).
//
// The two corrections this closes (the vendored KB / brief mislabel them):
//   1. Recipient self-assessment posts the output and input legs on SEPARATE 343 analytics
//      (343.výstup / 343.vstup) or via a 349 clearing account — NEVER a circular 343/343 (which nets
//      to zero on one account and cannot populate DAP rows or KH; průkaznost §100 ZDPH + §8 zák.
//      563/1991 Sb.).
//   2. The operative legal basis is the SPECIFIC provision, never "§92a-general + Příloha 5":
//      construction → §92e; scrap → §92c + Příloha č. 5; selected (Příloha 6) goods → §92f + NV 361/2014.

/** PDP VAT rate band: 21 % standard / 12 % reduced (single reduced rate since 2024). */
export type VatRate = "standard" | "reduced"

/** A leg of the recipient self-assessment: samovyměřená daň na výstupu / nárok na odpočet na vstupu. */
export type PdpLeg = "output" | "input"

/** Kontrolní hlášení oddíl. */
export type KhSection = "A.1" | "B.1"

/** PDP category, keyed to its operative statutory provision. */
export type PdpCategory =
  /** Stavební a montážní práce — §92e ZDPH (CZ-CPA 41–43). */
  | "construction"
  /** Odpad / šrot (zboží) — §92c ZDPH + Příloha č. 5. */
  | "scrap"
  /** Vybrané zboží dle Přílohy č. 6 (mobily, CPU, obiloviny, surové kovy, …) — §92f + NV 361/2014. */
  | "selected_goods"

/** Reference VAT percentages per band. */
export const PDP_VAT_RATE_PERCENT: Record<VatRate, number> = {
  standard: 21,
  reduced: 12,
}

/**
 * The recipient DAP řádek for a self-assessed PDP leg + rate (signoff Q2.C):
 * output → ř. 10 (21 %) / ř. 11 (12 %); input → ř. 43 (21 %) / ř. 44 (12 %).
 */
export function recipientDapRow(leg: PdpLeg, rate: VatRate): string {
  if (leg === "output") {
    return rate === "standard" ? "ř. 10" : "ř. 11"
  }
  return rate === "standard" ? "ř. 43" : "ř. 44"
}

/** Supplier-side DAP řádek — base only, no DPH charged (signoff Q2.C). */
export const SUPPLIER_DAP_ROW = "ř. 25"

/** Kontrolní hlášení: the recipient self-assessment goes in oddíl B.1 (NOT A.1). */
export const RECIPIENT_KH_SECTION: KhSection = "B.1"

/** Kontrolní hlášení: the supplier reports the supply in oddíl A.1. */
export const SUPPLIER_KH_SECTION: KhSection = "A.1"

/**
 * Validates the recipient self-assessment 343-split: the output leg and the input leg must post to
 * DISTINCT accounts (two 343 analytics, or a 343/349-clearing pair) — a same-account circular
 * 343/343 is invalid (signoff Q2.B). The 349-clearing pattern also satisfies this (the legs touch
 * 343.výstup and 343.vstup, never the same account).
 */
export function isValidPdpSelfAssessmentSplit(
  outputAccount: string,
  inputAccount: string,
): boolean {
  return outputAccount !== inputAccount
}

/** Accepted recipient self-assessment posting patterns (reference, not a write template). */
export const PDP_SELF_ASSESSMENT_PATTERNS = [
  {
    name: "two-analytics",
    outputAccount: "343.výstup",
    inputAccount: "343.vstup",
    note: "interní doklad; two distinct 343 analytics",
  },
  {
    name: "349-clearing",
    outputAccount: "343.výstup",
    inputAccount: "343.vstup",
    note: "349 Vyrovnávací účet pro DPH as clearing: 349/343.výstup; 343.vstup/349",
  },
] as const

/** Legal-basis provenance for a PDP category (signoff Q2.D — the operative provision, never §92a-general). */
export interface PdpLegalBasis {
  provision: string
  /** The activating Příloha, if the category is appendix-listed. */
  appendix: string | null
  /** Kontrolní hlášení "kód předmětu plnění" (A.1 / B.1), where it is a single fixed code. */
  khItemCode: string | null
  /** Per-invoice threshold (Příloha-6 vybrané zboží only), in haléř (minor units); null = no threshold. */
  perInvoiceThresholdCzkMinor: bigint | null
}

export const PDP_LEGAL_BASIS: Record<PdpCategory, PdpLegalBasis> = {
  construction: {
    provision: "§92e ZDPH (zák. 235/2004 Sb.)",
    appendix: null,
    khItemCode: "4",
    perInvoiceThresholdCzkMinor: null,
  },
  scrap: {
    provision: "§92c ZDPH + Příloha č. 5",
    appendix: "Příloha č. 5",
    khItemCode: "5",
    perInvoiceThresholdCzkMinor: null,
  },
  selected_goods: {
    provision: "§92f ZDPH + NV 361/2014 Sb.",
    appendix: "Příloha č. 6",
    // Příloha-6 goods span multiple kódy předmětu plnění (per item type) — not a single fixed code.
    khItemCode: null,
    perInvoiceThresholdCzkMinor: 10_000_000n, // 100 000 Kč
  },
}
