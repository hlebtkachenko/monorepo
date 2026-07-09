// ⚠ SAFETY SPINE — do not modify without brain-gate review

import {
  type GateDecision,
  scoreProposalColdStart,
} from "@workspace/brain/gate"
import { type ScoreInputs, TIER2_CAP_VALUES } from "@workspace/brain/confidence"
import type { EvidenceSignals } from "@workspace/shared/api"

/**
 * [WP-D] The FAIL-CLOSED evidence gate. Wires the server-side confidence engine
 * (`scoreProposal`) onto the live write path so the server — not the client's
 * `confidence` scalar — decides whether a write is green.
 *
 * The client's `signals` envelope is SELF-REPORTED and is NEVER consumed directly
 * by `scoreProposal`. This module degrades every non-server-verifiable field to
 * its worst value before scoring:
 *   - base-score claims (kbRule / extractionQuality / reconciliation) → floor;
 *   - the five verify BONUS booleans → false (no uplift);
 *   - self-reported Tier-2 CAP kinds → honored fail-safe (accepted — they only
 *     ever LOWER trust, so trusting a client cap can hold a write, never release
 *     one).
 *
 * Because the server holds NO verified extraction telemetry in v1, extraction is
 * structurally UNVERIFIED — we fire the Tier-3 defer signal `extraction_failed`,
 * which forces `cRaw = 0` in `scoreProposal` unconditionally. Green is therefore
 * UNREACHABLE at cold start no matter what a fitted calibration map says
 * ([G3-R1] / [WP-A-gate]). This is the intended pre-launch posture (the write
 * lane ships OFF; human review is the master gate), and it is a STRUCTURAL block
 * — not merely a low base score a fitted map could lift.
 *
 * When a future version can server-RE-VERIFY extraction (and the other base-score
 * facts), the degradation drops away and the third AND leg becomes reachable —
 * the leg is never vacuous.
 *
 * [WS-2] The scorer also accepts `serverDerivedSignals`: infra-signal kinds the
 * SERVER injects (never the client) — e.g. `novel_template` when a capture
 * references an unconfirmed OCR template. These only ADD a hold to the score; a
 * client cannot forge one (a Tier-3 kind is not a Tier-2 cap, so it is dropped if
 * asserted via `capSignals`).
 */

/**
 * The client's evidence envelope. Aliased to the shared `EvidenceSignals` (the Zod-inferred request-contract
 * type) so this safety-critical shape has ONE source of truth — a field added to the shared schema can never
 * silently go unscored here through a drifted hand-copy.
 */
export type EvidenceEnvelope = EvidenceSignals

/** The known Tier-2 CAP signal kinds a client may self-report (honored fail-safe). */
const TIER2_CAP_KINDS: ReadonlySet<string> = new Set(
  Object.keys(TIER2_CAP_VALUES),
)

/**
 * The structural sub-green forcer: the server cannot re-verify the source
 * extraction quality in v1, so from its evidence position extraction is
 * unverified. `extraction_failed` (Tier-3 defer) forces `cRaw = 0` in
 * `scoreProposal`, so no fitted calibration map can green a write on unverifiable
 * evidence. Semantically honest: the server DEFERS what it cannot score.
 */
const UNVERIFIED_EXTRACTION_SIGNAL = "extraction_failed"

/**
 * Map the (optional) client envelope to `ScoreInputs` FAIL-CLOSED. The client
 * claim is NEVER consumed directly: every base-score / verify-bonus field is
 * degraded to its worst value, and the structural `extraction_failed` block is
 * always injected (green unreachable regardless of any calibration map). Only
 * self-reported CAP signals survive — honored fail-safe (they only LOWER trust).
 *
 * `serverDerivedSignals` are infra-signal kinds the SERVER (never the client)
 * injects into `firedSignals` — e.g. `novel_template` when the capture references
 * an unconfirmed OCR template (see the capture write gate). They are the ONLY way
 * a non-cap kind (a Tier-3 DEFER like `novel_template`) reaches the score: a
 * client-supplied kind that is not a recognized Tier-2 cap is dropped below, so a
 * client can never forge — nor omit, once the server derives it — this hold. Only
 * ever ADDS a signal, so it can hold a write, never release one.
 *
 * Exported so the post-fit guard test can prove these inputs stay sub-green even
 * under a FITTED calibration model ([WP-A-gate]).
 */
export function buildScoreInputs(
  envelope: EvidenceEnvelope | null | undefined,
  serverDerivedSignals: readonly string[] = [],
): ScoreInputs {
  // Self-reported CAP signals: honored fail-safe. Only recognized Tier-2 cap
  // kinds are threaded (an unknown kind is a no-cap in `capFromSignals`, so we
  // drop it rather than let a typo look load-bearing). These can only LOWER the
  // score — a client can never release a write by asserting a cap.
  const assertedCaps = (envelope?.capSignals ?? []).filter((k) =>
    TIER2_CAP_KINDS.has(k),
  )

  // Degrade EVERY base-score / verify-bonus claim: the server cannot re-verify
  // them in v1, so they contribute nothing (floor base, no bonus). The structural
  // `extraction_failed` block forces green unreachable regardless.
  return {
    firedSignals: [
      UNVERIFIED_EXTRACTION_SIGNAL,
      ...assertedCaps,
      ...serverDerivedSignals,
    ],
    kbRule: "none", // degraded (client kbRule claim NOT server-verifiable)
    verify: {}, // degraded (all five verify bonuses NOT server-recomputed)
    extractionQuality: 0, // degraded (NOT server-verifiable)
    reconciliation: "none", // degraded (NOT server-verifiable)
  }
}

/**
 * Build `ScoreInputs` from the (optional) client envelope FAIL-CLOSED, then score
 * server-side against the cold-start model. Returns the honest server verdict.
 *
 * `serverDerivedSignals` are threaded through `buildScoreInputs` — SERVER-injected
 * infra signals (e.g. `novel_template`), never client claims. They can only lower
 * the verdict.
 *
 * The verdict's `isGreen` is the THIRD leg of the live auto-apply AND (the other
 * two being the client confidence threshold and the independent server veto).
 * With v1 degradation `isGreen` is always false — everything is HELD.
 */
export function evaluateEvidence(
  envelope: EvidenceEnvelope | null | undefined,
  serverDerivedSignals: readonly string[] = [],
): GateDecision {
  return scoreProposalColdStart(
    buildScoreInputs(envelope, serverDerivedSignals),
  )
}
