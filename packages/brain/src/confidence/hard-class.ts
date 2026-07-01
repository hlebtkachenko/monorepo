// The firing logic for the prior-book re-derivation hard classes (2026-07-01, untrusted-prior design).
//
// signals.ts declares the Tier-2 CAP VALUES for the five judgment-heavy classes where a prior accountant's
// errors concentrate. This module is the FIRING predicate: a hard class fires its cap ONLY when an
// objective infra check does NOT resolve it. That is what makes "score the prior book with the same
// confidence metric" safe — for an UNRESOLVED hard class the cap is sub-green, so green (≥0.95) is
// structurally unreachable and the item routes to the human; a class an objective check RESOLVES (amount
// below the DHM threshold, a present tax-point) is scored normally.

import type { Tier2CapKind } from "./signals"

/** The five prior-book hard classes (a subset of the Tier-2 cap kinds in signals.ts). */
export type HardClass =
  | "asset_vs_expense"
  | "accrual_period_boundary"
  | "reserve_or_impairment"
  | "dph_tax_point_timing"
  | "prior_without_source"

export const HARD_CLASSES = [
  "asset_vs_expense",
  "accrual_period_boundary",
  "reserve_or_impairment",
  "dph_tax_point_timing",
  "prior_without_source",
] as const satisfies readonly HardClass[]

/**
 * The DHM movable-asset threshold used as the objective check for `asset_vs_expense`: below it, expensing
 * (501/518) is defensible so the capitalize-vs-expense decision is not a judgment call. Minor units
 * (haléř): 40 000 Kč. Pinned to the landed `signals.ts` comment + the untrusted-prior design; the exact
 * line (the 40 000 Kč accounting floor vs the 80 000 Kč §26 ZDP tax threshold) is a candidate for the
 * WP-CONF-CEIL confirming advisor gate.
 */
export const DHM_THRESHOLD_MINOR = 4_000_000n // 40 000.00 Kč

/**
 * Objective facts that can RESOLVE a hard class so its Tier-2 cap does not fire.
 *
 * CALLER CONTRACT (load-bearing — the wiring gate at #395/N-3 must honor it, this pure predicate cannot):
 *  - Every field MUST be derived from an INFRA signal, never a model-verbalized boolean. If the model
 *    supplies `duzpPresent`/`hasPrimarySource`, the cap is defeated (the whole "gate on infra, not belief"
 *    invariant). This module scores what it is handed; it does not — and cannot — validate provenance.
 *  - `amountMinor` MUST be haléř minor units from the branded IR amount field, NEVER whole Kč / a raw
 *    `number`. A whole-Kč value is off by 100× and would lift `asset_vs_expense` for a real fixed asset
 *    up to ~4 000 000 Kč (a confident-wrong vector). Brand/validate it at the boundary.
 */
export interface HardClassResolution {
  /** Gross amount of the booking, haléř minor units (see caller contract), for the DHM threshold check. */
  amountMinor?: bigint
  /** A tax-point (DUZP) date is present on the primary fact ⇒ the DPH / accrual period is objective. */
  duzpPresent?: boolean
  /** The re-derivation found an underlying primary fact for a prior booking (so it CAN be re-derived). */
  hasPrimarySource?: boolean
}

/** True iff an objective infra check resolves the class, so its cap should NOT fire. */
function isResolved(hardClass: HardClass, r: HardClassResolution): boolean {
  switch (hardClass) {
    case "asset_vs_expense":
      // Below the DHM threshold, expensing is defensible — not a judgment call.
      return r.amountMinor !== undefined && r.amountMinor < DHM_THRESHOLD_MINOR
    case "accrual_period_boundary":
    case "dph_tax_point_timing":
      // A present tax-point (DUZP) makes the period objective.
      return r.duzpPresent === true
    case "prior_without_source":
      // Resolved only when a primary fact exists to re-derive the prior booking from.
      return r.hasPrimarySource === true
    case "reserve_or_impairment":
      // Judgment + policy bound — no objective infra check resolves it; it always fires when present.
      return false
  }
}

/**
 * Given the hard classes a booking candidate touches + the objective facts, return the Tier-2 signal
 * kinds that fire. Feed the result into `computeCRaw({ firedSignals, ... })`: an unresolved hard class
 * caps C_raw at its sub-green value (green unreachable ⇒ HITL); a resolved one contributes nothing.
 */
export function firedHardClassSignals(
  classes: readonly HardClass[],
  resolution: HardClassResolution,
): Tier2CapKind[] {
  const fired: Tier2CapKind[] = []
  for (const c of classes) {
    if (!isResolved(c, resolution) && !fired.includes(c)) fired.push(c)
  }
  return fired
}
