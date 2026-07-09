// M0.6 — the live outcome-mapper classification. The bug this guards against: a NON-applied session result is
// NOT automatically a hold. A 429 admission rate-limit, a 5xx, a validation error, or an unparseable body all
// arrive as `applied:false`, and the old mapper recorded EVERY one of them as a terminal `held` SUCCESS — which
// checkpointed the document done and silently DROPPED it from the batch while the summary claimed "held for
// review". `classifyLiveOutcome` is the PURE classifier, unit-tested here with no live session.

import { describe, expect, it } from "vitest"
import type { LiveBrainSessionResult } from "@workspace/intake"
import { detectCaptureError } from "./session-config"
import { classifyLiveOutcome } from "./batch-live"

/** A base result with the SAFE defaults a launcher fills; each test overrides only the fields it exercises. */
function result(
  over: Partial<LiveBrainSessionResult> = {},
): LiveBrainSessionResult {
  return {
    brainRunId: "run-1",
    applied: false,
    status: "unknown",
    isError: false,
    rateLimited: false,
    serverGate: undefined,
    ...over,
  }
}

describe("classifyLiveOutcome — the live outcome-mapper (no silent data loss)", () => {
  it("applied → applied", () => {
    const outcome = classifyLiveOutcome(
      result({
        applied: true,
        status: "applied",
        serverGate: { status: "applied", eventId: "e1" },
      }),
    )
    expect(outcome).toEqual({
      kind: "applied",
      detail: { status: "applied", eventId: "e1" },
    })
  })

  it("held WITH a real reviewId → held (carrying the review handle)", () => {
    const outcome = classifyLiveOutcome(
      result({
        status: "held",
        reviewId: "rev-9",
        serverGate: { status: "held", reviewId: "rev-9" },
      }),
    )
    expect(outcome).toEqual({
      kind: "held",
      reviewId: "rev-9",
      detail: { status: "held", reviewId: "rev-9" },
    })
  })

  it("rate-limit tool-error (code=rate_limited) → rate_limited (so the engine backs off + retries)", () => {
    // Build the result the way the launcher would from the raw rate-limit tool-error text.
    const err = detectCaptureError(
      "Rate limited. retry_after=12s code=rate_limited request_id=r",
      true,
    )
    const outcome = classifyLiveOutcome(
      result({
        status: "unparsed",
        isError: err.isError,
        rateLimited: err.rateLimited,
        retryAfterMs: err.retryAfterMs,
        serverGate: {
          status: "unparsed",
          raw: "Rate limited. retry_after=12s code=rate_limited request_id=r",
        },
      }),
    )
    expect(outcome).toEqual({ kind: "rate_limited", retryAfterMs: 12_000 })
  })

  it("hard error (isError, not a rate-limit) → failed, NEVER held", () => {
    const outcome = classifyLiveOutcome(
      result({
        status: "unparsed",
        isError: true,
        serverGate: {
          status: "unparsed",
          raw: "[server_error] booking failed (status=500 request_id=r)",
        },
      }),
    )
    expect(outcome.kind).toBe("error")
    expect(outcome.kind).not.toBe("held")
    if (outcome.kind === "error") {
      expect(outcome.message).toContain("tool error")
      expect(outcome.message).toContain("status=500")
    }
  })

  it("MINIMUM FLOOR: a non-applied result WITHOUT a reviewId → failed, NEVER held", () => {
    // No reviewId, not an error, status not even "held" — the exact shape the 429 → unparsed chain produced,
    // and the exact shape the old mapper mis-recorded as a phantom held. It MUST fail this document.
    for (const status of ["unknown", "unparsed", "held", "pending"]) {
      const outcome = classifyLiveOutcome(result({ status }))
      expect(outcome.kind).toBe("error")
      expect(outcome.kind).not.toBe("held")
    }
  })

  it("held status but NO reviewId → failed (a hold is only real with a concrete review handle)", () => {
    const outcome = classifyLiveOutcome(
      result({ status: "held", serverGate: { status: "held" } }),
    )
    expect(outcome.kind).toBe("error")
    if (outcome.kind === "error") {
      expect(outcome.message).toContain("no reviewId")
    }
  })

  it("an applied flag on an error result is NOT trusted (belt-and-braces) → not applied", () => {
    // Defensive: an error result can never be a genuine apply, even if `applied` were somehow set.
    const outcome = classifyLiveOutcome(
      result({ applied: true, isError: true, status: "unparsed" }),
    )
    expect(outcome.kind).not.toBe("applied")
    expect(outcome.kind).toBe("error")
  })

  it("a session that produced no capture result at all → failed (accounted for, not dropped)", () => {
    // parseCaptureOutcome(undefined) → status "unknown"; detectCaptureError(undefined,false) → not an error.
    const outcome = classifyLiveOutcome(result({ status: "unknown" }))
    expect(outcome.kind).toBe("error")
  })
})
