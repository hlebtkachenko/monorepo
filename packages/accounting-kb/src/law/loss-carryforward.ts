// CZ §34 ZDP carryforward taxonomy — the daňová ztráta (§34 odst. 1) vs odpočet VaV / odborné
// vzdělávání deduction deconflation. KB gap-closer (WP-0.4a).
//
// This module is the CERTIFIED correction of the vault's older §34/§34a conflation: the vendored
// KB snapshot still carries the loose "§34a carryforward" framing; the rules here are anchored to
// primary law per `.context/afframe-brain/research/deep/CZ-LAW-SIGNOFF.md` plus the WP-0.4a advisor
// gate (3 independent Opus-xhigh verifiers, primary-law verified, 2026-06-25 — `gates/0.4a.md`).
//
// REGIME-DEPENDENT CITATION (the gate's load-bearing correction): zák. č. 360/2025 Sb. (eff.
// 1.1.2026) RELOCATED the deduction carryforward window. Its čl. VI bod 27 inserted the window into
// §34 odst. 4; bod 28 REPEALED the old §34 odst. 5. The transitional čl. VII bod 7 keeps deductions
// arising up to 31.12.2025 on the OLD §34 odst. 5. So the operative odstavec is per-origin:
//   - FY2026+ origin (5-period) → §34 odst. 4 ZDP, ve znění zák. č. 360/2025 Sb.
//   - pre-2026 origin (3-period) → §34 odst. 5 ZDP, ve znění účinném přede dnem nabytí účinnosti
//                                  (transitional). Quoting a flat "§34 odst. 5" for a 2026 deduction
//                                  cites a repealed provision — never do it.
//
// THE CARDINAL INVARIANT (signoff §"Different rules — never conflate"):
//   The daňová ztráta and the odpočet VaV / odborné vzdělávání are SEPARATE odčitatelné položky —
//   separate counters, separate DAP lines, separate change histories. zák. 299/2020 Sb. changed
//   ONLY the loss carryback; zák. 360/2025 Sb. changed ONLY the deduction carryforward. A change to
//   one must NEVER bleed into the other.

/** A §34 odčitatelná položka whose carryforward window this module governs. */
export type DeductibleItemType =
  /** Daňová ztráta — §34 odst. 1 ZDP (zák. 586/1992 Sb.). */
  | "tax_loss"
  /** Odpočet na podporu výzkumu a vývoje — window §34 odst. 4 (FY2026+) / odst. 5 (pre-2026, transitional); amount §34a–34b. */
  | "rd_deduction"
  /** Odpočet na podporu odborného vzdělávání — window §34 odst. 4 (FY2026+) / odst. 5 (pre-2026, transitional); §34f–34h. */
  | "vocational_education_deduction"

/**
 * §34 odst. 1 ZDP — daňová ztráta forward window: 5 zdaňovacích období bezprostředně
 * následujících. Long-standing; predates and is NOT touched by zák. 299/2020 Sb. or zák. 360/2025 Sb.
 */
export const TAX_LOSS_CARRYFORWARD_PERIODS = 5

/**
 * §34 odst. 1 ZDP — daňová ztráta carryback: 2 zdaňovacích období bezprostředně předcházejících
 * (zák. č. 299/2020 Sb., eff. mid-2020). The forward window was NOT touched by 299/2020.
 */
export const TAX_LOSS_CARRYBACK_PERIODS = 2

/**
 * zák. č. 299/2020 Sb. — combined carryback cap, 30 000 000 Kč, expressed in haléř (minor
 * units) as a bigint. Money is never a native `number` in this monorepo.
 */
export const TAX_LOSS_CARRYBACK_CAP_CZK_MINOR = 3_000_000_000n

/**
 * Odpočet VaV / odborné vzdělávání carryforward for pre-amendment / pre-2026-origin deductions:
 * 3 období bezprostředně následující. Provision: §34 odst. 5 ZDP, ve znění účinném přede dnem
 * nabytí účinnosti zák. č. 360/2025 Sb. (kept alive only by the transitional čl. VII bod 7).
 */
export const DEDUCTION_CARRYFORWARD_PERIODS_LEGACY = 3

/**
 * Odpočet VaV / odborné vzdělávání carryforward for FY2026+-origin deductions: 5 období. zák. č.
 * 360/2025 Sb. (eff. 1.1.2026) relocated the window into §34 odst. 4 (čl. VI bod 27) and repealed
 * the old odst. 5 (bod 28). The 3→5 extension covers BOTH the R&D AND the vocational-education
 * deduction (signoff FIX 2 — not R&D-exclusive).
 */
export const DEDUCTION_CARRYFORWARD_PERIODS_AMENDED = 5

/**
 * zák. č. 360/2025 Sb. transitional pivot: deductions arising up to 31.12.2025 keep the 3-period
 * window (old §34 odst. 5); only deductions arising from this fiscal year onward get 5 (§34 odst. 4).
 */
export const DEDUCTION_3_TO_5_FIRST_FISCAL_YEAR = 2026

/** Primary-law provenance per item type (for confidence/audit tagging). */
export const LEGAL_BASIS: Record<
  DeductibleItemType,
  { provision: string; amendments: string[] }
> = {
  tax_loss: {
    provision: "§34 odst. 1 ZDP (zák. 586/1992 Sb.)",
    amendments: [
      "zák. 299/2020 Sb. — carryback 2 období, combined 30 000 000 Kč cap",
    ],
  },
  rd_deduction: {
    provision:
      "window §34 odst. 4 ZDP (FY2026+ origin, ve znění zák. 360/2025 Sb.) / §34 odst. 5 ZDP (pre-2026 origin, transitional); amount §34a–34b",
    amendments: [
      "zák. 360/2025 Sb. — carryforward 3→5, eff. 1.1.2026; window relocated odst. 5 → odst. 4 (čl. VI body 27–28)",
    ],
  },
  vocational_education_deduction: {
    provision:
      "window §34 odst. 4 ZDP (FY2026+ origin, ve znění zák. 360/2025 Sb.) / §34 odst. 5 ZDP (pre-2026 origin, transitional); §34f–34h",
    amendments: [
      "zák. 360/2025 Sb. — carryforward 3→5, eff. 1.1.2026; window relocated odst. 5 → odst. 4 (čl. VI body 27–28)",
    ],
  },
}

/**
 * The exact operative odstavec for a deductible item's carryforward window, given its ORIGIN
 * fiscal year. This is what an autonomous agent must cite — citing a flat "§34 odst. 5" for a
 * FY2026+ deduction would quote a repealed provision.
 *
 * - `tax_loss` → §34 odst. 1 (origin-independent).
 * - deductions, FY2026+ origin → §34 odst. 4 ZDP, ve znění zák. č. 360/2025 Sb.
 * - deductions, pre-2026 origin → §34 odst. 5 ZDP, ve znění účinném přede dnem nabytí účinnosti
 *   zák. č. 360/2025 Sb. (transitional čl. VII bod 7).
 */
export function carryforwardWindowProvision(
  itemType: DeductibleItemType,
  originFiscalYear: number,
): string {
  if (itemType === "tax_loss") {
    return "§34 odst. 1 ZDP"
  }
  return originFiscalYear >= DEDUCTION_3_TO_5_FIRST_FISCAL_YEAR
    ? "§34 odst. 4 ZDP, ve znění zák. č. 360/2025 Sb."
    : "§34 odst. 5 ZDP, ve znění účinném přede dnem nabytí účinnosti zák. č. 360/2025 Sb."
}

/**
 * Forward carryforward window (in tax periods) for a deductible item, keyed by type and by the
 * ORIGIN fiscal year (the period the item arose / was assessed).
 *
 * - `tax_loss`: always 5 (§34 odst. 1), origin-independent — the 360/2025 reform can never
 *   shorten or lengthen it. This is the deconflation guard in code form.
 * - `rd_deduction` / `vocational_education_deduction`: per-origin under the 360/2025 transitional
 *   rule — 3 for FY2025-and-earlier origin (§34 odst. 5), 5 for FY2026+ origin (§34 odst. 4).
 */
export function carryforwardPeriods(
  itemType: DeductibleItemType,
  originFiscalYear: number,
): number {
  if (itemType === "tax_loss") {
    return TAX_LOSS_CARRYFORWARD_PERIODS
  }
  return originFiscalYear >= DEDUCTION_3_TO_5_FIRST_FISCAL_YEAR
    ? DEDUCTION_CARRYFORWARD_PERIODS_AMENDED
    : DEDUCTION_CARRYFORWARD_PERIODS_LEGACY
}

/**
 * True if an item arising in `originFiscalYear` may still be applied FORWARD in
 * `claimFiscalYear`. The window counts the immediately-following periods, so a claim is valid in
 * `originFiscalYear + 1 .. originFiscalYear + window` (the origin year itself is the
 * assessment/arising year, not a forward-claim year). Carryback is a separate rule
 * (`isWithinCarryback`).
 */
export function isWithinCarryforward(
  itemType: DeductibleItemType,
  originFiscalYear: number,
  claimFiscalYear: number,
): boolean {
  const offset = claimFiscalYear - originFiscalYear
  return (
    offset >= 1 && offset <= carryforwardPeriods(itemType, originFiscalYear)
  )
}

/**
 * True if a daňová ztráta arising in `originFiscalYear` may be carried BACK to `claimFiscalYear`
 * (§34 odst. 1 + zák. 299/2020 Sb.): 2 immediately-preceding periods. Carryback applies to the
 * tax loss only — never to the §34 deductions. The 30 000 000 Kč combined cap
 * (`TAX_LOSS_CARRYBACK_CAP_CZK_MINOR`) is an amount limit applied by the caller, not a period
 * limit, so it is not evaluated here.
 */
export function isWithinCarryback(
  originFiscalYear: number,
  claimFiscalYear: number,
): boolean {
  const offset = originFiscalYear - claimFiscalYear
  return offset >= 1 && offset <= TAX_LOSS_CARRYBACK_PERIODS
}
