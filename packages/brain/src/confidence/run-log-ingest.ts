// M3.3 — run-log ingestion pipeline (BRAIN-MILESTONE-PLAN.md M3.3 / M1-M3-OVERNIGHT-PLAN.md §5).
//
// Turns a REVIEWED held-write (a Brain proposal `runGatedWrite` HELD, later resolved by a human via
// `POST /v1/accounting/held-writes/:id/resolve` or the web approvals action) into a `CalibrationSample`
// — the fit-input row the M3.2 refit (`refitCalibration` in ./calibration) will eventually consume via
// `toRunLogEntries`. PURE data shaping only:
//
//   - No DB access. `packages/brain` never depends on `@workspace/db` (I2) — this module takes an
//     already-fetched row shape (`ReviewedRunLogRow`), the same way `shadow-score.ts`'s `buildShadowScore`
//     takes an already-in-scope request body rather than reading one itself. Producing real
//     `ReviewedRunLogRow`s from `tool_call_log` is DB-side plumbing for a later consumer (M3.2), not this
//     module's job.
//   - No gate/floor/admission logic is touched or re-derived here — this only reshapes what the gate
//     ALREADY persisted: `output_json.serverGate.shadow` (shadow-score.ts, audit-only, W1.5) and
//     `output_json.resolution` (the human verdict `held-writes.controller.ts` / the web approvals
//     action stamp on resolve).
//   - Fail-CLOSED, never fabricated: a row with no human outcome yet (still held, or a shape this
//     pipeline does not recognize) is SKIPPED. A row with no shadow score (pre-W1.5, or a corrupted
//     audit record) is SKIPPED. Neither is defaulted or inferred — a skipped row contributes NOTHING to
//     the fit, it is never silently turned into a `booked_correct` or a `0` score.
//   - The FIT itself is M3.2, data-gated on the M2.3 marathon's reviewed runs. This module never calls
//     `refitCalibration`; `toRunLogEntries` only reshapes a `CalibrationSample` into the exact input
//     `refitCalibration` already accepts — it does not fit anything.

import type { HumanReviewOutcome, RunLogEntry } from "./calibration"

/**
 * The two resolutions `held-writes.controller.ts` (API) and the web approvals `resolveHeldWrite`
 * action persist to `output_json.resolution` today. A held write awaiting review has no `resolution`
 * key at all (`output_json.resolution === undefined`) — that is the "no human outcome yet" case this
 * pipeline skips.
 */
type Resolution = "approved" | "rejected"

/**
 * The subset of a resolved `tool_call_log` row this pipeline consumes. Deliberately NOT the Drizzle row
 * type (packages/brain never imports `@workspace/db` — I2): any caller (a `packages/db` query, a
 * one-off script, a test fixture) can produce this shape from a plain `SELECT`.
 */
export interface ReviewedRunLogRow {
  /** `tool_call_log.id` — falls back to this as the fit's `runId` when no conversation groups it. */
  toolCallLogId: string
  /** `tool_call_log.conversation_id` — the Brain session this proposal belongs to, or `null`. */
  conversationId: string | null
  /** `tool_call_log.created_at` — when the write was originally proposed (ISO string or `Date`). */
  createdAt: string | Date
  /** `tool_call_log.output_json` — carries BOTH `serverGate.shadow` and the human `resolution`. */
  outputJson: unknown
}

/**
 * One calibration-fit input row: the gate's honest predicted confidence paired with the human's
 * real-world label. This is the `(predicted_score, actual_correct, metadata)` triple M3.2's refit
 * consumes (via `toRunLogEntries`), never referenced by any live gate/floor decision.
 */
export interface CalibrationSample {
  /** Groups samples from the same Brain session — the refit's internal distinct-run-count guard key. */
  runId: string
  /**
   * `output_json.serverGate.shadow.serverLane.cRaw` — the B2 server-derivable-only shadow score
   * (shadow-score.ts). NEVER `claimLane` (the client-belief diagnostic lane must never become a
   * training x — see shadow-score.ts's module doc).
   */
  predictedScore: number
  /** `true` iff a human confirmed the booking stood as proposed (`resolution === "approved"`). */
  actualCorrect: boolean
  /**
   * The human verdict as the `HumanReviewOutcome` enum `RunLogEntry` expects — structurally mirrors
   * `actualCorrect` but is never a bare model-belief boolean (see calibration.ts's `RunLogEntry` doc).
   */
  outcome: HumanReviewOutcome
  /** Audit trail back to the source row. Never consumed by the fit itself. */
  provenance: {
    toolCallLogId: string
    /** ISO 8601. */
    createdAt: string
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

/** `output_json.resolution`, or `null` when absent/unresolved/unrecognized. Never throws. */
function readResolution(output: Record<string, unknown>): Resolution | null {
  const resolution = output["resolution"]
  return resolution === "approved" || resolution === "rejected"
    ? resolution
    : null
}

/**
 * `output_json.serverGate.shadow.serverLane.cRaw` — walked defensively (a malformed/missing shape at
 * any level yields `null`, never throws). Deliberately reads ONLY `serverLane`, never `claimLane`.
 */
function readShadowServerCRaw(output: Record<string, unknown>): number | null {
  const serverGate = output["serverGate"]
  if (serverGate === null || typeof serverGate !== "object") return null
  const shadow = (serverGate as Record<string, unknown>)["shadow"]
  if (shadow === null || typeof shadow !== "object") return null
  const serverLane = (shadow as Record<string, unknown>)["serverLane"]
  if (serverLane === null || typeof serverLane !== "object") return null
  const cRaw = (serverLane as Record<string, unknown>)["cRaw"]
  return isFiniteNumber(cRaw) ? cRaw : null
}

/**
 * Ingest ONE reviewed row. Returns `null` (skip, never a fabricated sample) when:
 *   - `outputJson` is not a resolved object (still `null` — a write with no output yet),
 *   - `resolution` is missing or not one of `"approved" | "rejected"` (still held, or an outcome shape
 *     this pipeline does not yet understand — e.g. a future `"corrected"` value), or
 *   - the shadow score's `serverLane.cRaw` is missing or non-finite.
 *
 * NOTE (M1.7 edit-before-approve, not on `main` as of this PR): once an "edited before approve" signal
 * lands on `output_json`, an edited-then-approved booking should map to `human_corrected`, not
 * `booked_correct` — today `"approved"` always means the STORED payload replayed byte-for-byte (no
 * edit capability exists on this branch), so it unambiguously means the proposal stood as-is. Extending
 * this mapping is a follow-up for whichever PR lands that signal; it must not be guessed here.
 */
export function ingestReviewedRow(
  row: ReviewedRunLogRow,
): CalibrationSample | null {
  if (row.outputJson === null || typeof row.outputJson !== "object") {
    return null
  }
  const output = row.outputJson as Record<string, unknown>

  const resolution = readResolution(output)
  if (resolution === null) return null // no human outcome yet — skip, never fabricate a label

  const predictedScore = readShadowServerCRaw(output)
  if (predictedScore === null) return null // no shadow score — skip, never fabricate an x

  const outcome: HumanReviewOutcome =
    resolution === "approved" ? "booked_correct" : "human_rejected"

  const createdAt =
    row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt

  return {
    runId: row.conversationId ?? row.toolCallLogId,
    predictedScore,
    actualCorrect: outcome === "booked_correct",
    outcome,
    provenance: { toolCallLogId: row.toolCallLogId, createdAt },
  }
}

/**
 * Ingest a batch of reviewed rows. Rows failing the fail-closed checks in `ingestReviewedRow` are
 * silently dropped (never fabricated) — an empty (or all-unreviewed) input yields an empty output, so
 * the fit stays correctly data-gated until real reviewed runs exist.
 */
export function ingestReviewedRunLog(
  rows: readonly ReviewedRunLogRow[],
): CalibrationSample[] {
  const samples: CalibrationSample[] = []
  for (const row of rows) {
    const sample = ingestReviewedRow(row)
    if (sample !== null) samples.push(sample)
  }
  return samples
}

/**
 * Reshape ingested samples into the exact input `refitCalibration` (calibration.ts) already accepts.
 * Pure reshaping only — does NOT call `refitCalibration` or apply the internal distinct-run-count guard;
 * that stays inside the refit machinery itself.
 */
export function toRunLogEntries(
  samples: readonly CalibrationSample[],
): RunLogEntry[] {
  return samples.map((sample) => ({
    runId: sample.runId,
    score: sample.predictedScore,
    outcome: sample.outcome,
  }))
}
