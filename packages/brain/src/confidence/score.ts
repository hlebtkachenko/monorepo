import { isBlockSignal, TIER2_CAP_VALUES } from "./signals"

// C_raw composition — D6 §"Final aggregation formula", copied verbatim (NOT re-derived):
//   C_raw = min( C_caps, C_kb + C_verify + 0.15 * C_extraction + C_reconciliation )
//   if any Tier-1/Tier-3 block fired: C_raw = 0.0 unconditionally.
// C_final = calibration_map(C_raw) lives in ./calibration.

/** D6 Step 2 — the KB-rule confidence base. */
export type KbRuleConfidence =
  | "constitution_safe" // 0.95 (only for the specific sub-fact a constitution invariant confirms)
  | "high_active" // 0.90
  | "medium" // 0.75
  | "low_mixed" // 0.55
  | "none" // 0.40

const C_KB: Record<KbRuleConfidence, number> = {
  constitution_safe: 0.95,
  high_active: 0.9,
  medium: 0.75,
  low_mixed: 0.55,
  none: 0.4,
}

/** D6 Step 3 — verification bonuses, additive on C_kb. A failed VAT-base check is NOT a -0.05; the
 * caller fires `balance_mismatch` (a Tier-1 block) instead, so only PASSED checks appear here. */
export interface VerifyChecks {
  vatBaseMatchesNet?: boolean // +0.05
  rcChecklistPassesOrNA?: boolean // +0.04
  decree500Confirmed?: boolean // +0.03
  periodConsistent?: boolean // +0.03
  bankVsKsSsMatch?: boolean // +0.03
}

const VERIFY_BONUS: Record<keyof VerifyChecks, number> = {
  vatBaseMatchesNet: 0.05,
  rcChecklistPassesOrNA: 0.04,
  decree500Confirmed: 0.03,
  periodConsistent: 0.03,
  bankVsKsSsMatch: 0.03,
}

/** D6 Step 5 — reconciliation status contribution. */
export type ReconciliationStatus = "full" | "partial" | "none"
const RECON_DELTA: Record<ReconciliationStatus, number> = {
  full: 0.04,
  partial: 0,
  none: -0.03,
}

export interface ScoreInputs {
  /** Infra-signal kinds that fired (Step 1). */
  firedSignals: readonly string[]
  /** Step 2 KB rule confidence. */
  kbRule: KbRuleConfidence
  /** Step 3 passed verifier checks. */
  verify: VerifyChecks
  /** Step 4 extraction quality in [0,1] (structured=1.0, born-digital PDF=0.85, CSV=0.80, scan<=0.65). */
  extractionQuality: number
  /** Step 5 reconciliation status. */
  reconciliation: ReconciliationStatus
}

export interface RawScore {
  cRaw: number
  cCaps: number
  cKb: number
  cVerify: number
  /** The 0.15 * extractionQuality contribution (already weighted). */
  cExtraction: number
  cReconciliation: number
  /** True if a Tier-1/Tier-3 block fired (C_raw forced to 0.0). */
  blocked: boolean
}

/** Step 1 — the lowest cap that fired (1.0 if none), or a block. */
export function capFromSignals(firedSignals: readonly string[]): {
  blocked: boolean
  cCaps: number
} {
  if (firedSignals.some(isBlockSignal)) return { blocked: true, cCaps: 0 }
  let cCaps = 1
  for (const kind of firedSignals) {
    const cap = (TIER2_CAP_VALUES as Record<string, number>)[kind]
    if (cap !== undefined && cap < cCaps) cCaps = cap
  }
  return { blocked: false, cCaps }
}

/** Compose C_raw from Steps 1-5 (D6). C_final = calibration_map(C_raw) is applied separately. */
export function computeCRaw(inputs: ScoreInputs): RawScore {
  const { blocked, cCaps } = capFromSignals(inputs.firedSignals)
  const cKb = C_KB[inputs.kbRule]
  let cVerify = 0
  for (const key of Object.keys(VERIFY_BONUS) as (keyof VerifyChecks)[]) {
    if (inputs.verify[key]) cVerify += VERIFY_BONUS[key]
  }
  const cExtraction = 0.15 * inputs.extractionQuality
  const cReconciliation = RECON_DELTA[inputs.reconciliation]
  // D6's canonical aggregation has no intermediate clamp; Step 3's "C_verify capped at 1.0" is enforced
  // by the outer min (cCaps <= 1.0, so cRaw <= 1.0). Inert today (max cVerify = 0.18); if verify bonuses
  // ever sum > 1.0, restore an explicit (cKb + cVerify) clamp here. (advisor-gate note, WP-0.7)
  const composite = cKb + cVerify + cExtraction + cReconciliation
  const cRaw = blocked ? 0 : Math.min(cCaps, composite)
  return { cRaw, cCaps, cKb, cVerify, cExtraction, cReconciliation, blocked }
}
