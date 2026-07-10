// M0.6 — the bulk/batch orchestrator for Brain document booking.
//
// An operator drops a folder of MANY documents ("land 500 invoices, expect all 500 processed") and this layer
// books each one through the EXISTING single-document live path (`runLiveBrainSession` per document), with:
//
//   1. BOUNDED CONCURRENCY — at most `concurrency` sessions in flight (default modest, env-overridable). This
//      is a CLIENT-side knob, deliberately NOT tied to the server's admission cap: the server can raise/lower
//      its caps freely, and a transient admission 429 is retried below, never a hard batch abort.
//   2. 429 RETRY / BACKOFF — a rate-limited document retries (respecting `retry_after` when present, else
//      exponential backoff) up to `maxAttempts`. A transient 429 on ONE document must never abort the batch.
//   3. CRASH-SAFE RESUME with DETERMINISTIC per-document idempotency keys — each document gets a STABLE key
//      derived from its content (a hash over its source locator + the exact capture request the live run would
//      submit). The key is identical across a retry AND across a killed-and-resumed run. Per-document progress
//      is checkpointed after every terminal outcome, so a resumed run SKIPS already-completed documents and
//      never re-books them. Even if a document was booked but its checkpoint flush was lost to a kill, the
//      SAME deterministic key means the server's `tool_call_log` idempotency dedup collapses the re-book into
//      a replay — never a double-book. This determinism is the correctness gate.
//   4. SUMMARY — every document is accounted for (applied / held / failed / skipped-on-resume) so the operator
//      can confirm all N were processed.
//
// ORCHESTRATION LAYER ONLY. This module holds NO creds, imports NO Agent SDK, and never touches the write
// gate / safety spine. The live "run one document" step and the on-disk checkpoint store are INJECTED, so the
// pool + retry + resume engine is pure and unit-testable without live creds (the caller wires the real ones).

import { createHash } from "node:crypto"
import type { BrainDryRunPlan } from "@workspace/intake"

/** One document the batch books: its stable identity, kind, and the inspected plan the live run would drive. */
export interface BatchJob {
  /** The IR record's provenance locator (file path + record locator) — the per-document identity. */
  sourceLocator: string
  /** The IR record kind (`invoice` / `bank_transaction` / `cash_document`), for the summary. */
  recordType: string
  /** The assembled dry-run plan — carries the exact `captureRequest` the live session embeds. */
  plan: BrainDryRunPlan
}

/**
 * The outcome of ONE document's live run, as the orchestrator sees it. A discriminated union so the engine
 * routes each case correctly: `applied` / `held` are terminal successes (checkpointed done, never re-run);
 * `rate_limited` triggers a backoff + retry (up to `maxAttempts`); `error` fails just that document (the batch
 * continues). The real `runOne` maps a live session result into this; tests inject a mock that returns it
 * directly (so a 429 can be SIMULATED with no server).
 */
export type DocOutcome =
  | { kind: "applied"; detail?: unknown }
  | { kind: "held"; reviewId?: string; detail?: unknown }
  | { kind: "rate_limited"; retryAfterMs?: number }
  | { kind: "error"; message: string }

/** The terminal disposition of a document recorded in the checkpoint. Reached via the exported `BatchSummary`. */
type DocStatus = "applied" | "held" | "failed"

/** One document's checkpointed record — keyed in the checkpoint by its deterministic idempotency key. */
interface DocRecord {
  idempotencyKey: string
  sourceLocator: string
  recordType: string
  status: DocStatus
  /** How many live attempts it took (a 429 retry increments this). */
  attempts: number
  /** The held-write review handle, when the server HELD the write. */
  reviewId?: string
  /** The failure message, when `status === "failed"`. */
  error?: string
}

/**
 * The persisted checkpoint — the crash-safe resume state. `docs` is keyed by the DETERMINISTIC idempotency
 * key, so a resumed run recognizes an already-done document by the SAME key it would derive again (never by a
 * fragile positional index). Bumping `version` invalidates an incompatible older file.
 */
export interface CheckpointState {
  version: 1
  /** The folder this checkpoint tracks — a guard so a resume against a different folder starts fresh. */
  folder: string
  docs: Record<string, DocRecord>
}

/** Injected checkpoint persistence. The engine loads once, then flushes the full state after every document. */
export interface CheckpointStore {
  load(): CheckpointState | null
  save(state: CheckpointState): void
}

/** Backoff shape for a rate-limited retry when the server sends no `retry_after`. */
export interface BackoffConfig {
  /** First-retry delay in ms. */
  baseMs: number
  /** Cap on any single delay in ms (also caps a large server-sent `retry_after`). */
  maxMs: number
  /** Exponential factor between attempts. */
  factor: number
}

const DEFAULT_BACKOFF: BackoffConfig = {
  baseMs: 1_000,
  maxMs: 30_000,
  factor: 2,
}

/** The full config the engine runs under. `runOne`, `store`, and `sleep` are injected for testability. */
export interface RunBatchOptions {
  /**
   * A STABLE identity for this batch (the operator's folder path), persisted as the checkpoint's `folder`
   * guard. A resume only reuses a checkpoint whose `folderId` matches — so a stale file from an unrelated
   * folder starts fresh, while re-running the SAME folder (even with a longer job list after a partial kill)
   * resumes and skips the already-completed documents.
   */
  folderId: string
  jobs: BatchJob[]
  /** Book ONE document live under its deterministic key. Returns the outcome the engine routes on. */
  runOne: (job: BatchJob, idempotencyKey: string) => Promise<DocOutcome>
  /** Crash-safe checkpoint persistence. */
  store: CheckpointStore
  /** Max sessions in flight. Bounded — the point is many docs WITHOUT blasting the server. */
  concurrency: number
  /** Max live attempts per document before a rate-limited doc is recorded failed (>= 1). */
  maxAttempts: number
  /** Backoff for a 429 with no `retry_after`. Defaults to {@link DEFAULT_BACKOFF}. */
  backoff?: BackoffConfig
  /** Injected sleep (tests pass a no-op / recorder). Defaults to a real timer. */
  sleep?: (ms: number) => Promise<void>
  /** Optional progress hook, fired once per terminal document outcome. */
  onProgress?: (record: DocRecord) => void
}

/** The final tally — every input document is in exactly one bucket, so the operator sees all N accounted for. */
export interface BatchSummary {
  total: number
  applied: number
  held: number
  failed: number
  /** Documents already terminal in the loaded checkpoint (a resumed run never re-ran them). */
  skipped: number
  /** Per-document records, in input order. */
  results: DocRecord[]
}

/**
 * The DETERMINISTIC per-document idempotency key — a content hash over the document's identity (its source
 * locator) + the EXACT capture request the live run would submit. It is:
 *
 *   - CONTENT-ADDRESSED: derived from the booking body itself, so it changes iff the booking would change.
 *   - PER-DOCUMENT UNIQUE: the source locator disambiguates two documents that map to an identical body.
 *   - CLOCK-FREE: the capture request carries only source-derived fields (amounts, document dates, the
 *     operator-supplied uuids) — never the ingest timestamp — so a killed-and-resumed run (a fresh process,
 *     a fresh `ingestedAt`) derives the IDENTICAL key. This is what lets the server's idempotency dedup catch
 *     a re-book of an already-applied document.
 *
 * The key is canonicalized (object keys sorted recursively) before hashing so an incidental key-ordering
 * difference can never change it. The `Idempotency-Key` header accepts 1–255 chars; a hex SHA-256 (64 chars,
 * prefixed) is well within that.
 */
export function deriveIdempotencyKey(job: BatchJob): string {
  const canonical = canonicalJson({
    sourceLocator: job.sourceLocator,
    captureRequest: job.plan.captureRequest,
  })
  const digest = createHash("sha256").update(canonical).digest("hex")
  return `brain-book-${digest}`
}

/**
 * Stable JSON: object keys sorted recursively so the serialization is order-independent. The `bigintReplacer`
 * renders any `bigint` (Money minor units are `bigint` in TypeScript) as a decimal string — a capture request
 * carries none today, but this keeps the key derivation from THROWING ("Do not know how to serialize a BigInt")
 * the moment a future adapter threads a bigint into the capture body. PURE.
 */
function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value), bigintReplacer)
}

/** JSON.stringify replacer that renders bigint fields as decimal strings (deterministic; defensive). PURE. */
function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

/**
 * Book a whole folder's worth of documents. Loads the checkpoint (starting fresh when it is absent or tracks a
 * different folder), skips every document already terminal in it, then runs the remaining ones through a
 * bounded-concurrency pool with 429 retry/backoff, flushing the checkpoint after each terminal outcome.
 * Returns the full per-document summary.
 */
export async function runBatch(
  options: RunBatchOptions,
): Promise<BatchSummary> {
  const {
    folderId,
    jobs,
    runOne,
    store,
    concurrency,
    maxAttempts,
    backoff = DEFAULT_BACKOFF,
    sleep = realSleep,
    onProgress,
  } = options

  // Load prior progress. A checkpoint whose `folder` guard does not match this batch's `folderId` is ignored
  // (start fresh) — so a stale file from an unrelated folder can never silently skip unrelated documents,
  // while re-running the SAME folder resumes and skips already-completed documents.
  const loaded = store.load()
  const state: CheckpointState =
    loaded && loaded.folder === folderId
      ? { version: 1, folder: folderId, docs: { ...loaded.docs } }
      : { version: 1, folder: folderId, docs: {} }

  // Pair each job with its deterministic key up front; a key already terminal in the checkpoint is a resume
  // SKIP (the live run is never invoked again — the strongest no-double-book guarantee).
  const keyed = jobs.map((job) => ({ job, key: deriveIdempotencyKey(job) }))
  const pending: { job: BatchJob; key: string }[] = []
  let skipped = 0
  for (const item of keyed) {
    const prior = state.docs[item.key]
    if (prior && prior.status !== "failed") {
      skipped++
      continue
    }
    pending.push(item)
  }

  // Bounded pool: `concurrency` workers pull from a shared cursor, so at most that many sessions run at once.
  let cursor = 0
  const workerCount = Math.max(1, Math.min(concurrency, pending.length))
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = cursor++
      if (index >= pending.length) return
      const { job, key } = pending[index]!
      const record = await bookOne(job, key, {
        runOne,
        maxAttempts,
        backoff,
        sleep,
      })
      // Record + flush the checkpoint synchronously (single-threaded — no interleaving with another worker's
      // save mid-write), so a kill right after this leaves a consistent, resumable file.
      state.docs[key] = record
      store.save(state)
      onProgress?.(record)
    }
  }
  await Promise.all(Array.from({ length: workerCount }, () => worker()))

  return summarize(keyed, state, skipped)
}

/**
 * Book ONE document, retrying only on a rate-limit up to `maxAttempts`. A `rate_limited` outcome sleeps for
 * the server's `retry_after` (capped) when present, else an exponential backoff, then retries. `applied` /
 * `held` are terminal successes; `error`, or exhausting the retry budget on a 429, records `failed` — that
 * document only, never the batch.
 */
async function bookOne(
  job: BatchJob,
  key: string,
  deps: {
    runOne: RunBatchOptions["runOne"]
    maxAttempts: number
    backoff: BackoffConfig
    sleep: (ms: number) => Promise<void>
  },
): Promise<DocRecord> {
  const base: Omit<DocRecord, "status" | "attempts"> = {
    idempotencyKey: key,
    sourceLocator: job.sourceLocator,
    recordType: job.recordType,
  }
  const attemptCap = Math.max(1, deps.maxAttempts)
  let attempts = 0
  for (;;) {
    attempts++
    let outcome: DocOutcome
    try {
      outcome = await deps.runOne(job, key)
    } catch (err) {
      // A thrown error is not a rate-limit signal (the seam surfaces 429 as a `rate_limited` outcome), so it
      // fails this document. The deterministic key makes a later resume safe: a re-run replays server-side.
      return {
        ...base,
        status: "failed",
        attempts,
        error: err instanceof Error ? err.message : String(err),
      }
    }

    if (outcome.kind === "applied") {
      return { ...base, status: "applied", attempts }
    }
    if (outcome.kind === "held") {
      return { ...base, status: "held", attempts, reviewId: outcome.reviewId }
    }
    if (outcome.kind === "error") {
      return { ...base, status: "failed", attempts, error: outcome.message }
    }
    // rate_limited — retry with backoff if budget remains, else fail this document.
    if (attempts >= attemptCap) {
      return {
        ...base,
        status: "failed",
        attempts,
        error: `rate-limited: exhausted ${attemptCap} attempt(s)`,
      }
    }
    await deps.sleep(
      backoffDelayMs(attempts, outcome.retryAfterMs, deps.backoff),
    )
  }
}

/**
 * The delay before a rate-limited retry. Honors the server's `retry_after` (capped at `maxMs`) when present;
 * otherwise an exponential backoff `baseMs * factor^(attempt-1)`, capped at `maxMs`. `attempt` is the number
 * of attempts ALREADY made (>= 1). PURE.
 */
export function backoffDelayMs(
  attempt: number,
  retryAfterMs: number | undefined,
  backoff: BackoffConfig,
): number {
  if (retryAfterMs != null && retryAfterMs >= 0) {
    return Math.min(retryAfterMs, backoff.maxMs)
  }
  const exp =
    backoff.baseMs * Math.pow(backoff.factor, Math.max(0, attempt - 1))
  return Math.min(Math.round(exp), backoff.maxMs)
}

/** Build the immutable summary from the keyed jobs + the final checkpoint state. */
function summarize(
  keyed: { job: BatchJob; key: string }[],
  state: CheckpointState,
  skipped: number,
): BatchSummary {
  const results: DocRecord[] = keyed.map(
    ({ job, key }) =>
      state.docs[key] ?? {
        idempotencyKey: key,
        sourceLocator: job.sourceLocator,
        recordType: job.recordType,
        status: "failed",
        attempts: 0,
        error: "no outcome recorded",
      },
  )
  const count = (s: DocStatus): number =>
    results.filter((r) => r.status === s).length
  return {
    total: keyed.length,
    applied: count("applied"),
    held: count("held"),
    failed: count("failed"),
    skipped,
    results,
  }
}

/** Render the summary for the operator — every document accounted for, failures named. PURE. */
export function renderBatchSummary(summary: BatchSummary): string {
  const lines: string[] = []
  lines.push("Afframe brain book-batch — run summary")
  lines.push(
    `  total=${summary.total}  applied=${summary.applied}  held=${summary.held}  ` +
      `failed=${summary.failed}  skipped(resumed)=${summary.skipped}`,
  )
  const failures = summary.results.filter((r) => r.status === "failed")
  if (failures.length > 0) {
    lines.push("")
    lines.push(`Failed (${failures.length}):`)
    for (const f of failures) {
      lines.push(
        `  - ${f.recordType} ${f.sourceLocator}: ${f.error ?? "unknown"}`,
      )
    }
  }
  return lines.join("\n") + "\n"
}

function realSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
