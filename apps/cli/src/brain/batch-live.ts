// M0.6 — the SDK-bound "book one document" step of the bulk orchestrator. It is injected into the pure
// `runBatch` engine (`batch.ts`), so the pool + retry + resume logic stays creds-free and unit-testable; this
// file wires the real live session. The on-disk checkpoint store lives in `checkpoint-store.ts` (fs-only).
//
// The live step drives the EXISTING single-document path (`runLiveBrainSession`) with the batch's deterministic
// per-document idempotency key threaded through — so a resumed re-book of an already-applied document presents
// the SAME `Idempotency-Key` and the server dedups it into a replay. No gate/spine code is touched here.

import {
  BrainHarnessNotWiredError,
  runLiveBrainSession,
  type LiveBrainSessionResult,
} from "@workspace/intake"
import { RateLimitError } from "@afframe/sdk"
import { sdkAgentSessionLauncher } from "./sdk-launcher"
import type { BatchJob, DocOutcome } from "./batch"

/**
 * Book ONE document live under its deterministic idempotency key, then classify the session result into a
 * `DocOutcome` the engine routes on. The classification is the correctness-critical part: a NON-applied result
 * is NOT automatically a hold — it can be a rate-limit, a hard error, or an unparseable body, and recording any
 * of those as a terminal `held` SUCCESS would checkpoint the document done and DROP it from the batch. See
 * {@link classifyLiveOutcome} for the exact table and the minimum-safety floor.
 *
 * A THROW (the harness not wired, a thrown `RateLimitError`, or any other error before/around the session) is
 * handled here: a rate-limit throw becomes a retryable `rate_limited`, everything else fails THIS document.
 */
export async function liveBookOne(
  job: BatchJob,
  idempotencyKey: string,
): Promise<DocOutcome> {
  try {
    const result = await runLiveBrainSession({
      plan: job.plan,
      mcpEndpoint: process.env.BRAIN_MCP_ENDPOINT ?? "",
      readEnv: (name) => process.env[name],
      launcher: sdkAgentSessionLauncher,
      idempotencyKey,
    })
    return classifyLiveOutcome(result)
  } catch (err) {
    // The seam normally surfaces an in-session 429 as `rateLimited` on the result (classified above); a THROWN
    // rate-limit (e.g. before the session opened) still retries. `BrainHarnessNotWiredError` and any other
    // throw fail this document only — the deterministic key makes a later resume replay server-side.
    if (isRateLimit(err)) {
      return { kind: "rate_limited", retryAfterMs: retryAfterMsOf(err) }
    }
    if (err instanceof BrainHarnessNotWiredError) {
      return { kind: "error", message: err.message }
    }
    return {
      kind: "error",
      message: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Map a `LiveBrainSessionResult` → the batch engine's `DocOutcome`. PURE, so the classification is unit-tested
 * without a live session. The table (evaluated top to bottom):
 *
 *   | result                                           | DocOutcome            |
 *   |--------------------------------------------------|-----------------------|
 *   | `rateLimited` (in-session `code=rate_limited`)   | `rate_limited(retry)` |
 *   | `applied` (and not an error result)              | `applied`             |
 *   | `status==="held"` AND a real `reviewId`          | `held`                |
 *   | anything else non-applied                        | `error` (failed)      |
 *
 * MINIMUM SAFETY FLOOR: a non-applied result WITHOUT a `reviewId` is NEVER recorded `held` — it falls through
 * to `error`/failed. `held` requires BOTH `status==="held"` and a concrete `reviewId`, so a hard error, an
 * unparseable body, an `unknown`/`unparsed` status, a held-with-no-reviewId, or a session that never produced a
 * capture result all fail THIS document (resume-safe: the engine re-attempts a `failed` doc, and the stable
 * idempotency key collapses a re-book of an already-applied doc into a server-side replay) instead of silently
 * disappearing from the batch while the summary claims it was held.
 */
export function classifyLiveOutcome(
  result: LiveBrainSessionResult,
): DocOutcome {
  // A rate-limit is RETRYABLE — surface it so the engine's backoff/retry fires (never a silent held/failed).
  if (result.rateLimited) {
    return { kind: "rate_limited", retryAfterMs: result.retryAfterMs }
  }
  // A genuine applied write. `&& !isError` is belt-and-braces: an error result can never be a real apply.
  if (result.applied && !result.isError) {
    return { kind: "applied", detail: result.serverGate }
  }
  // A genuine HELD write needs BOTH status="held" AND a concrete reviewId — the minimum safety floor.
  if (!result.isError && result.status === "held" && result.reviewId) {
    return {
      kind: "held",
      reviewId: result.reviewId,
      detail: result.serverGate,
    }
  }
  // EVERY other non-applied result fails this document — never a silent held.
  return { kind: "error", message: describeLiveFailure(result) }
}

/** A precise failure message for a non-applied, non-rate-limited result (a tool error, or a phantom hold). */
function describeLiveFailure(result: LiveBrainSessionResult): string {
  const detail = liveResultText(result.serverGate)
  if (result.isError) {
    return detail
      ? `brain capture returned a tool error: ${detail}`
      : "brain capture returned a tool error"
  }
  return detail
    ? `brain capture not applied (status=${result.status}, no reviewId): ${detail}`
    : `brain capture not applied (status=${result.status}, no reviewId)`
}

/** Best-effort human text from the echoed server-gate body (the `raw` string of an unparsed error, else JSON). */
function liveResultText(serverGate: unknown): string | undefined {
  if (typeof serverGate === "string") return serverGate
  if (serverGate && typeof serverGate === "object") {
    const raw = (serverGate as { raw?: unknown }).raw
    if (typeof raw === "string") return raw
    try {
      return JSON.stringify(serverGate)
    } catch {
      return undefined
    }
  }
  return undefined
}

/** True when a thrown error is (or reads as) a 429 rate-limit. */
function isRateLimit(err: unknown): boolean {
  if (err instanceof RateLimitError) return true
  if (err instanceof Error) {
    return /\b429\b|rate.?limit/i.test(err.message)
  }
  return false
}

/** The `retry_after` (ms) from a rate-limit error, when it carries one. */
function retryAfterMsOf(err: unknown): number | undefined {
  if (err instanceof RateLimitError && typeof err.retryAfter === "number") {
    return err.retryAfter * 1_000
  }
  return undefined
}
