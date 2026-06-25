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
