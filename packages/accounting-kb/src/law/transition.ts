// CZ FO accounting-regime transition — the daňová evidence → účetnictví zahajovací rozvaha (opening
// balance sheet) via the převodový můstek, the §23 odst. 14 transition tax-base adjustment, and the
// §4 odst. 7 voluntary back-switch period. KB gap-closer (WP-0.4d) — captures the "zahajovací-rozvaha
// gap" (daňová evidence produces no rozvaha, so the opening position must be reconstructed).
//
// NOT advisor-gated. The structural parts (the 491 bridge, the asset/liability posting direction, the
// §4 odst. 7 period) are high-confidence and deterministic; the EXACT §23 odst. 8 adjustment list is
// KB-flagged low-confidence (pending primary §23 odst. 8 text — see `note`), so only the DIRECTIONAL
// effect is encoded, tagged. Source: KB `10-foundations/transitions/fo-accounting-transitions.md`.

/** Account 491 — Individuální podnikatel (proprietor's capital): the převodový-můstek counter account. */
export const PROPRIETOR_CAPITAL_ACCOUNT = "491"

export type OpeningBalanceSide = "asset" | "liability"

/** A daňová-evidence position carried into the opening rozvaha, with its účetnictví account. */
export interface OpeningBalanceEntry {
  /** The DE position. */
  item_cz: string
  side: OpeningBalanceSide
  /** The účetnictví account the item lands on (the non-491 leg). */
  account: string
}

/**
 * The převodový můstek: each closing daňová-evidence position → an opening-rozvaha entry, bridged
 * through account 491. Assets: Dr <account> / Cr 491. Liabilities: Dr 491 / Cr <account>. The opening
 * equity is the resulting 491 balance (the balancing figure), not a separate entry.
 */
export const OPENING_BALANCE_BRIDGE: readonly OpeningBalanceEntry[] = [
  { item_cz: "Pokladna", side: "asset", account: "211" },
  { item_cz: "Bankovní účty", side: "asset", account: "221" },
  { item_cz: "Pohledávky z obchodních vztahů", side: "asset", account: "311" },
  { item_cz: "Zásoby", side: "asset", account: "112" },
  {
    item_cz: "Dlouhodobý hmotný majetek (zůstatková cena)",
    side: "asset",
    account: "022",
  },
  { item_cz: "Závazky z obchodních vztahů", side: "liability", account: "321" },
  { item_cz: "Daňové závazky", side: "liability", account: "343" },
  {
    item_cz: "Závazky vůči ČSSZ / zdravotní pojišťovně",
    side: "liability",
    account: "336",
  },
  { item_cz: "Úvěry a zápůjčky", side: "liability", account: "461" },
] as const

/**
 * The opening-balance posting for an entry, bridged through 491. Assets debit the account and credit
 * 491; liabilities debit 491 and credit the account.
 */
export function openingBalancePosting(entry: OpeningBalanceEntry): {
  debit: string
  credit: string
} {
  return entry.side === "asset"
    ? { debit: entry.account, credit: PROPRIETOR_CAPITAL_ACCOUNT }
    : { debit: PROPRIETOR_CAPITAL_ACCOUNT, credit: entry.account }
}

/** A §23 odst. 14 / odst. 8 transition adjustment item. */
export type TransitionTaxAdjustmentItem =
  | "receivables"
  | "payables"
  | "inventory"
  | "reserves"

/** Directional effect on the §7 základ daně in the first účetnictví year. */
export type TransitionTaxEffect =
  | "increase"
  | "decrease"
  | "neutral"
  | "reverse"

export interface TransitionTaxAdjustment {
  effect: TransitionTaxEffect
  /** When the effect lands. */
  when_cz: string
  note: string
}

/**
 * §23 odst. 14 ZDP (by reference to §23 odst. 8): on switching daňová evidence → účetnictví, the §7
 * základ daně is adjusted in the first účetnictví year (declared on Příloha č. 3 to the DPFO). Only the
 * DIRECTIONAL effect is encoded — the exact §23 odst. 8 item list is KB-flagged low-confidence and must
 * be pinned to the primary §23 odst. 8 text before any of this drives an autonomous booking.
 */
export const DE_TO_UCETNICTVI_TAX_ADJUSTMENTS: Record<
  TransitionTaxAdjustmentItem,
  TransitionTaxAdjustment
> = {
  receivables: {
    effect: "increase",
    when_cz: "při inkasu",
    note: "existed at switch, not yet DE income — increases ZD when collected",
  },
  payables: {
    effect: "decrease",
    when_cz: "při úhradě",
    note: "existed at switch, not yet DE expense — decreases ZD when paid",
  },
  inventory: {
    effect: "neutral",
    when_cz: "—",
    note: "cost already deducted in DE; recognized via účetnictví, taxed only once (no double-deduction)",
  },
  reserves: {
    effect: "reverse",
    when_cz: "rok 1",
    note: "zákonné rezervy deducted in DE; reverse the deduction effect in year 1",
  },
}

/** The DPFO příloha on which the §23 odst. 14 transition adjustments are declared. */
export const TRANSITION_DPFO_APPENDIX = "Příloha č. 3 (§23 odst. 14 ZDP)"

/**
 * §4 odst. 7 zák. 563/1991 — a FO who VOLUNTARILY kept účetnictví may switch back to daňová evidence
 * only after at least 5 consecutive účetní období (unless the mandatory trigger that required účetnictví
 * has ceased).
 */
export const VOLUNTARY_BACKSWITCH_MIN_PERIODS = 5
