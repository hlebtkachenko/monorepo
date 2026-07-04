// The infrastructure-signal taxonomy — V2-DESIGN §5.6 (kept verbatim) with the D6 cap values.
// Confidence gates on these OBSERVABLE facts, NEVER the model's verbalized confidence (REM2025's
// worst error was served at confidence:medium). Tiers:
//   Tier 1 — hard BLOCK   -> C = 0.0
//   Tier 2 — REVIEW       -> C capped at the listed value
//   Tier 3 — DEFER        -> C = 0.0 (cannot be scored/trusted; routed to the deferred pile)
//   Tier 4 — AUTO         -> no infra signal fired (no cap)

/** Tier-1 hard-block signal kinds (force C -> 0.0). */
export const TIER1_BLOCK_KINDS = [
  "no_source_doc",
  "closed_period",
  "constitution_violation",
  "balance_mismatch",
  "duplicate_key_collision",
] as const

/** Tier-3 defer signal kinds (force defer; treated as C -> 0.0 since the item cannot be scored). */
export const TIER3_DEFER_KINDS = [
  "extraction_failed",
  "period_unknown",
  "budget_exceeded",
  "hitl_timeout",
] as const

/** spolek is FROZEN (starter scope = s.r.o. + OSVČ); spolek_scope forces defer (Tier-2 label, block effect). */
export const FORCE_DEFER_KINDS = ["spolek_scope"] as const

/** Tier-2 review caps: signal kind -> the value C is capped at (D6 Step 1, copied verbatim). */
export const TIER2_CAP_VALUES = {
  reverse_charge_candidate: 0.7,
  pdf_low_confidence: 0.65,
  novel_ico: 0.75,
  multi_source_conflict: 0.75,
  kb_rule_amber_red: 0.75,
  novel_bank_pattern: 0.8,
  vat_mismatch: 0.8,
  kb_rule_low: 0.8,
  trajectory_instability: 0.82,
  amount_near_threshold: 0.85,
  // Prior-book re-derivation hard classes (2026-07-01). When re-deriving a booking (fresh OR from a prior
  // book) touches one of these judgment-heavy classes AND an objective infra check does NOT resolve it (e.g.
  // amount ≥ the DHM 40 000 Kč threshold, or a missing DUZP), the classifier fires the matching signal, so
  // the RAW score (C_raw) is capped sub-green. AT COLD-START (identity calibration) that alone means green is
  // unreachable and the item routes to the human. WP-CONF-CEIL now makes these caps a hard POST-calibration
  // CEILING: `scoreProposal` (gate.ts) clamps `cFinal = min(applyCalibration(cRaw), minHardCap)` where
  // `minHardCap` is the lowest of the fired HARD_CLASSES caps below — so a FITTED calibration can NEVER lift a
  // fired hard class above green, not just at cold start. (Other Tier-2 caps stay calibration-liftable by
  // design and are held on the live path by the WP-D veto.) A prior-book DISAGREEMENT (Brain re-derivation !=
  // the prior GL row) reuses `multi_source_conflict` (0.75). All hard-class values are conservatively sub-green.
  asset_vs_expense: 0.6, // 042/022 (capitalize) vs 501/518 (expense) — the classic prior error
  accrual_period_boundary: 0.65, // časové rozlišení 381/382/383/384 — event spans the period boundary
  reserve_or_impairment: 0.7, // rezervy / opravné položky — judgment + policy bound
  dph_tax_point_timing: 0.7, // DPH belongs to the DUZP period, not the invoice-issue date
  prior_without_source: 0.55, // a prior booking with no underlying primary fact in the dump — cannot re-derive
} as const
export type Tier2CapKind = keyof typeof TIER2_CAP_VALUES

const BLOCK_KINDS: ReadonlySet<string> = new Set<string>([
  ...TIER1_BLOCK_KINDS,
  ...TIER3_DEFER_KINDS,
  ...FORCE_DEFER_KINDS,
])

/** True if a fired signal forces C -> 0.0 (Tier-1 block, Tier-3 defer, or a force-defer signal). */
export function isBlockSignal(kind: string): boolean {
  return BLOCK_KINDS.has(kind)
}

/** Classify a signal kind into its infra tier (1-4). Unknown / no-signal => Tier 4. */
export function tierOf(kind: string): 1 | 2 | 3 | 4 {
  if ((TIER1_BLOCK_KINDS as readonly string[]).includes(kind)) return 1
  if (kind === "spolek_scope" || kind in TIER2_CAP_VALUES) return 2
  if ((TIER3_DEFER_KINDS as readonly string[]).includes(kind)) return 3
  return 4
}
