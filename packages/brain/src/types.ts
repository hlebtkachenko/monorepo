// Core Brain-owned domain types. NO @workspace/accounting dependency — these describe the Brain's
// OWN run/item lifecycle. The two Brain-owned tables (brain_run / brain_run_item) land in a Track-B
// migration AFTER PR #386 merges (their FK committed_target_id points at live accounting rows); see
// ARCHITECTURE.md. Shapes derived from the Executor Brief (.context/afframe-brain) §3 — not invented.

/** A free-form JSON value (jsonb columns such as brain_run_item.staged_payload). */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

/** brain_run.status lifecycle. */
export const BRAIN_RUN_STATUSES = [
  "queued",
  "running",
  "paused",
  "awaiting_review",
  "committed",
  "aborted",
] as const
export type BrainRunStatus = (typeof BRAIN_RUN_STATUSES)[number]

/** Orchestrator stage checkpoint 0–8 (the deterministic 9-state machine, WP-1.4a). */
export const BRAIN_RUN_STAGES = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const
export type BrainRunStage = (typeof BRAIN_RUN_STAGES)[number]

/** brain_run_item.decision — routing outcome under the human master-review gate. */
export const BRAIN_RUN_ITEM_DECISIONS = [
  "staged",
  "auto",
  "review",
  "deferred",
  "committed",
  "rejected",
] as const
export type BrainRunItemDecision = (typeof BRAIN_RUN_ITEM_DECISIONS)[number]

/** Advisor structured verdict (WP-1.7). resolve = green + rationale; confirm = red / escalate. */
export const ADVISOR_VERDICT_KINDS = ["resolve", "confirm"] as const
export type AdvisorVerdictKind = (typeof ADVISOR_VERDICT_KINDS)[number]

/**
 * An INFRASTRUCTURE confidence signal — never model-verbalized confidence. The four-tier infra
 * router (WP-0.7) hard-caps a line's score from these (novel IČO, no bank match, VAT mismatch,
 * amount near a statutory threshold, …). tier 1 = strongest cap … tier 4 = weakest.
 */
export interface ConfidenceSignal {
  kind: string
  tier: 1 | 2 | 3 | 4
  /** Optional structured detail for review / audit. */
  detail?: JsonValue
}

export interface AdvisorVerdict {
  kind: AdvisorVerdictKind
  rationale: string
  /** Sources the advisor actually read (anti-anchoring / source-must-be-read, WP-1.7). */
  sourcesRead?: string[]
}

/** A Brain run over one organization's fiscal year. Mirrors the brain_run table (Track-B migration). */
export interface BrainRun {
  id: string
  organizationId: string
  fiscalYear: number
  status: BrainRunStatus
  stage: BrainRunStage
  commitAskId: string | null
  budgetTokens: number | null
  tokensSpent: number
  maxIterations: number
  heartbeatAt: Date | null
  kbVersion: string | null
  confidentWrongCount: number
  sdkSessionId: string | null
  startedAt: Date | null
  createdAt: Date
}

/** One staged accounting item within a run. Mirrors brain_run_item (Track-B migration). */
export interface BrainRunItem {
  id: string
  organizationId: string
  runId: string
  sourceHash: string
  contentHash: string
  stagedPayload: JsonValue
  /** FK into live accounting rows; null until commit. */
  committedTargetId: string | null
  decision: BrainRunItemDecision
  /** Calibrated confidence on a 0–100 scale (numeric(5,2)). */
  confidence: number
  infraSignals: ConfidenceSignal[]
  /** The advisor's structured verdict, persisted across the advisor_verdict + advisor_rationale columns; null until an advisor runs. */
  advisorVerdict: AdvisorVerdict | null
  residualRisk: string | null
  approvedByUserId: string | null
  createdAt: Date
}

/** Boundary guard for an untrusted brain_run.status value. */
export function isBrainRunStatus(value: unknown): value is BrainRunStatus {
  return (
    typeof value === "string" &&
    (BRAIN_RUN_STATUSES as readonly string[]).includes(value)
  )
}

/** Boundary guard for an untrusted brain_run_item.decision value. */
export function isBrainRunItemDecision(
  value: unknown,
): value is BrainRunItemDecision {
  return (
    typeof value === "string" &&
    (BRAIN_RUN_ITEM_DECISIONS as readonly string[]).includes(value)
  )
}
