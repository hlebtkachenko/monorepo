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
} from "@workspace/intake"
import { RateLimitError } from "@afframe/sdk"
import { sdkAgentSessionLauncher } from "./sdk-launcher"
import type { BatchJob, DocOutcome } from "./batch"

/**
 * Book ONE document live under its deterministic idempotency key, mapping the session result → a `DocOutcome`
 * the engine routes on:
 *   - the server APPLIED the write  → `applied`
 *   - the server HELD it (the M0 default — the write lane holds every write) → `held` (+ its reviewId)
 *   - a rate-limit surfaced as a thrown `RateLimitError` / a 429 message → `rate_limited` (engine retries)
 *   - the harness is not wired, or any other throw → `error` (fails this document; the batch continues)
 *
 * HONEST LIMIT: in the current wiring an admission 429 raised INSIDE the agent session surfaces to the model as
 * a tool error, not as a thrown `RateLimitError` here — so it maps to a non-applied result the launcher cannot
 * yet distinguish from a normal HELD write. This mapper retries a 429 whenever it DOES propagate as a throw;
 * surfacing the in-session tool-error status through the launcher's result is a follow-up in the launcher
 * (out of this orchestration-only scope). The retry/backoff engine itself is complete and exercised by tests.
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
    if (result.applied) return { kind: "applied", detail: result.serverGate }
    return {
      kind: "held",
      reviewId: reviewIdOf(result.serverGate),
      detail: result.serverGate,
    }
  } catch (err) {
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

/** Pull a `reviewId` out of the server-gate body a held write returned, when present. */
function reviewIdOf(serverGate: unknown): string | undefined {
  if (serverGate && typeof serverGate === "object") {
    const id = (serverGate as { reviewId?: unknown }).reviewId
    if (typeof id === "string") return id
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
