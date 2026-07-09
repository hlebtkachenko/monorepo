// M0.6 — acceptance tests for the bulk book orchestrator. The engine's live "book one document" step + its
// checkpoint store are INJECTED, so every property below is proven with NO live creds and NO server: a mock
// `runOne` simulates applied / held / a 429 / a crash, and the real file-backed store proves crash-safe resume.

import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { BrainDryRunPlan } from "@workspace/intake"
import {
  backoffDelayMs,
  deriveIdempotencyKey,
  renderBatchSummary,
  runBatch,
  type BatchJob,
  type CheckpointState,
  type CheckpointStore,
  type DocOutcome,
} from "./batch"
import { FileCheckpointStore } from "./checkpoint-store"

// A document job whose plan carries a DISTINCT, content-bearing capture request. Only `captureRequest` is read
// by the key derivation, so a minimal cast plan is enough (mirrors session-config.test's `stubPlan`).
function job(id: number): BatchJob {
  return {
    sourceLocator: `folder/doc-${id}.xml#row-1`,
    recordType: "invoice",
    plan: {
      captureRequest: {
        periodId: "period-uuid",
        seriesId: "series-uuid",
        type: "RECEIVED_INVOICE",
        issuedAt: "2025-03-14",
        lines: [
          {
            eventId: "event-uuid",
            description: `FP-2025-${id}`,
            partials: [
              {
                baseAmount: `${id}000.00`,
                vatMode: "STANDARD",
                currencyCode: "CZK",
              },
            ],
          },
        ],
        confidence: 0.5,
        rationale: "batch test",
      },
    } as unknown as BrainDryRunPlan,
  }
}

/** An in-memory store that persists across `runBatch` calls (deep-copied on save, like a real disk round-trip). */
class MemStore implements CheckpointStore {
  private saved: CheckpointState | null = null
  load(): CheckpointState | null {
    return this.saved
  }
  save(state: CheckpointState): void {
    this.saved = structuredClone(state)
  }
  current(): CheckpointState | null {
    return this.saved
  }
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe("deriveIdempotencyKey (deterministic, content-addressed, clock-free)", () => {
  it("is stable for the same document across re-derivations (a resumed run derives the same key)", () => {
    // Two INDEPENDENTLY constructed jobs for the same document (a fresh process rebuilding the plan) must key
    // identically — this is what lets the server dedup a resumed re-book.
    expect(deriveIdempotencyKey(job(7))).toBe(deriveIdempotencyKey(job(7)))
  })

  it("differs when the booking body differs, and is unique per document", () => {
    expect(deriveIdempotencyKey(job(1))).not.toBe(deriveIdempotencyKey(job(2)))
  })

  it("ignores key ORDER in the capture request (canonicalized before hashing)", () => {
    const a = job(3)
    const reordered: BatchJob = {
      ...a,
      plan: {
        captureRequest: {
          rationale: "batch test",
          confidence: 0.5,
          issuedAt: "2025-03-14",
          type: "RECEIVED_INVOICE",
          seriesId: "series-uuid",
          periodId: "period-uuid",
          lines: (a.plan.captureRequest as { lines: unknown }).lines,
        },
      } as unknown as BrainDryRunPlan,
    }
    expect(deriveIdempotencyKey(reordered)).toBe(deriveIdempotencyKey(a))
  })

  it("fits the Idempotency-Key length bound (1–255 chars)", () => {
    const key = deriveIdempotencyKey(job(1))
    expect(key.length).toBeGreaterThan(0)
    expect(key.length).toBeLessThanOrEqual(255)
  })
})

describe("runBatch — (a) all N processed under bounded concurrency", () => {
  it("books every document exactly once, never exceeding the concurrency cap", async () => {
    const N = 40
    const limit = 8
    let inFlight = 0
    let maxInFlight = 0
    const seen = new Set<string>()
    const jobs = Array.from({ length: N }, (_, i) => job(i))

    const summary = await runBatch({
      folderId: "folder",
      jobs,
      concurrency: limit,
      maxAttempts: 3,
      store: new MemStore(),
      sleep: async () => {},
      runOne: async (_j, key): Promise<DocOutcome> => {
        seen.add(key)
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        await tick()
        inFlight--
        return { kind: "applied" }
      },
    })

    expect(summary.total).toBe(N)
    expect(summary.applied).toBe(N)
    expect(summary.held + summary.failed + summary.skipped).toBe(0)
    expect(seen.size).toBe(N) // every document booked exactly once
    expect(maxInFlight).toBeLessThanOrEqual(limit) // never blasts past the cap
    expect(maxInFlight).toBeGreaterThan(1) // genuinely concurrent, not serial
    // Every document accounted for in the summary buckets.
    expect(
      summary.applied + summary.held + summary.failed + summary.skipped,
    ).toBe(N)
  })
})

describe("runBatch — (b) a transient 429 retries then succeeds", () => {
  it("retries a rate-limited document (honoring retry_after) instead of aborting the batch", async () => {
    const attemptsByKey = new Map<string, number>()
    const delays: number[] = []
    const jobs = [job(1), job(2)]
    const rateLimitedKey = deriveIdempotencyKey(jobs[0]!)

    const summary = await runBatch({
      folderId: "folder",
      jobs,
      concurrency: 2,
      maxAttempts: 5,
      store: new MemStore(),
      sleep: async (ms) => {
        delays.push(ms)
      },
      runOne: async (_j, key): Promise<DocOutcome> => {
        const n = (attemptsByKey.get(key) ?? 0) + 1
        attemptsByKey.set(key, n)
        // First attempt of doc-1 is rate-limited with a server retry_after; it must RETRY, then succeed.
        if (key === rateLimitedKey && n === 1) {
          return { kind: "rate_limited", retryAfterMs: 250 }
        }
        return { kind: "applied" }
      },
    })

    expect(summary.applied).toBe(2) // the batch completed both — the 429 did not abort it
    expect(summary.failed).toBe(0)
    const retried = summary.results.find(
      (r) => r.idempotencyKey === rateLimitedKey,
    )!
    expect(retried.status).toBe("applied")
    expect(retried.attempts).toBe(2) // one 429 + one success
    expect(delays).toContain(250) // honored the server's retry_after
  })

  it("records a document failed (not the batch) after exhausting the retry budget on a persistent 429", async () => {
    const jobs = [job(1), job(2)]
    const alwaysLimitedKey = deriveIdempotencyKey(jobs[0]!)
    const summary = await runBatch({
      folderId: "folder",
      jobs,
      concurrency: 2,
      maxAttempts: 3,
      store: new MemStore(),
      sleep: async () => {},
      runOne: async (_j, key): Promise<DocOutcome> =>
        key === alwaysLimitedKey
          ? { kind: "rate_limited" }
          : { kind: "applied" },
    })
    expect(summary.applied).toBe(1) // the other document still booked
    expect(summary.failed).toBe(1)
    const failed = summary.results.find(
      (r) => r.idempotencyKey === alwaysLimitedKey,
    )!
    expect(failed.status).toBe("failed")
    expect(failed.attempts).toBe(3)
    expect(failed.error).toMatch(/rate-limited/)
  })
})

describe("runBatch — (c) resume after a kill skips completed docs and never re-books", () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "brain-batch-"))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("a killed-and-resumed run books only the remaining documents, with the same per-doc keys", async () => {
    const path = join(dir, "checkpoint.json")
    const allJobs = Array.from({ length: 6 }, (_, i) => job(i))

    // RUN 1 — the process is killed after only the first 3 documents were ever submitted + checkpointed.
    const run1Keys: string[] = []
    await runBatch({
      folderId: "the-folder", // same folder identity in both runs → run 2 resumes run 1's checkpoint
      jobs: allJobs.slice(0, 3),
      concurrency: 2,
      maxAttempts: 3,
      store: new FileCheckpointStore(path),
      sleep: async () => {},
      runOne: async (_j, key): Promise<DocOutcome> => {
        run1Keys.push(key)
        return { kind: "applied" }
      },
    })

    // The checkpoint file persisted the 3 completed documents (crash-safe).
    const persisted = JSON.parse(readFileSync(path, "utf8")) as CheckpointState
    expect(Object.keys(persisted.docs)).toHaveLength(3)

    // RUN 2 — resume with the FULL set of 6. The already-completed 3 must be SKIPPED (runOne never called for
    // them → no double-book); only the remaining 3 are booked.
    const run2Keys: string[] = []
    const summary = await runBatch({
      folderId: "the-folder",
      jobs: allJobs,
      concurrency: 2,
      maxAttempts: 3,
      store: new FileCheckpointStore(path),
      sleep: async () => {},
      runOne: async (_j, key): Promise<DocOutcome> => {
        run2Keys.push(key)
        return { kind: "applied" }
      },
    })

    // Every one of the 6 accounted for; 3 resumed-skips + 3 freshly applied; none re-booked.
    expect(summary.total).toBe(6)
    expect(summary.skipped).toBe(3)
    expect(summary.applied).toBe(6) // 3 carried from run 1 + 3 booked in run 2
    expect(summary.failed).toBe(0)

    // Run 2 invoked the live path ONLY for the 3 not-yet-done documents — the strongest no-double-book proof.
    expect(run2Keys).toHaveLength(3)
    const run1Set = new Set(run1Keys)
    for (const key of run2Keys) {
      expect(run1Set.has(key)).toBe(false) // never re-runs a completed document
    }

    // Determinism: the checkpoint keys the first 3 documents by the SAME keys run 1 derived — proving a resume
    // recognizes an already-booked document by its stable content hash, not a fragile index.
    const doneKeys = new Set(Object.keys(persisted.docs))
    for (const key of run1Keys) expect(doneKeys.has(key)).toBe(true)
    // And the union of run-1 + run-2 keys is exactly the 6 documents' deterministic keys, each once.
    const union = new Set([...run1Keys, ...run2Keys])
    expect(union.size).toBe(6)
    expect(union).toEqual(new Set(allJobs.map(deriveIdempotencyKey)))
  })

  it("ignores a checkpoint from a DIFFERENT folder (starts fresh, books everything)", async () => {
    const path = join(dir, "checkpoint.json")
    const jobs = Array.from({ length: 3 }, (_, i) => job(i))
    const store = new FileCheckpointStore(path)

    await runBatch({
      folderId: "folder-A",
      jobs,
      concurrency: 2,
      maxAttempts: 2,
      store,
      sleep: async () => {},
      runOne: async (): Promise<DocOutcome> => ({ kind: "applied" }),
    })

    let booked = 0
    const summary = await runBatch({
      folderId: "folder-B", // different folder → the stale checkpoint must NOT skip anything
      jobs,
      concurrency: 2,
      maxAttempts: 2,
      store,
      sleep: async () => {},
      runOne: async (): Promise<DocOutcome> => {
        booked++
        return { kind: "applied" }
      },
    })
    expect(summary.skipped).toBe(0)
    expect(booked).toBe(3)
  })
})

describe("runBatch — held + error accounting", () => {
  it("classifies applied / held / failed and accounts for every document", async () => {
    const jobs = [job(1), job(2), job(3)]
    const summary = await runBatch({
      folderId: "folder",
      jobs,
      concurrency: 3,
      maxAttempts: 2,
      store: new MemStore(),
      sleep: async () => {},
      runOne: async (j): Promise<DocOutcome> => {
        if (j.sourceLocator.includes("doc-1")) return { kind: "applied" }
        if (j.sourceLocator.includes("doc-2"))
          return { kind: "held", reviewId: "rev-2" }
        return { kind: "error", message: "boom" }
      },
    })
    expect(summary).toMatchObject({ total: 3, applied: 1, held: 1, failed: 1 })
    const held = summary.results.find((r) => r.status === "held")!
    expect(held.reviewId).toBe("rev-2")
    const failed = summary.results.find((r) => r.status === "failed")!
    expect(failed.error).toBe("boom")
  })

  it("a thrown runOne fails only that document, not the batch", async () => {
    const jobs = [job(1), job(2)]
    const summary = await runBatch({
      folderId: "folder",
      jobs,
      concurrency: 2,
      maxAttempts: 2,
      store: new MemStore(),
      sleep: async () => {},
      runOne: async (j): Promise<DocOutcome> => {
        if (j.sourceLocator.includes("doc-1")) throw new Error("kaboom")
        return { kind: "applied" }
      },
    })
    expect(summary.applied).toBe(1)
    expect(summary.failed).toBe(1)
    expect(summary.results.find((r) => r.status === "failed")!.error).toBe(
      "kaboom",
    )
  })
})

describe("backoffDelayMs", () => {
  const backoff = { baseMs: 1_000, maxMs: 30_000, factor: 2 }
  it("honors retry_after when present, capped at maxMs", () => {
    expect(backoffDelayMs(1, 250, backoff)).toBe(250)
    expect(backoffDelayMs(1, 99_000, backoff)).toBe(30_000)
  })
  it("uses exponential backoff (baseMs * factor^(attempt-1)) when no retry_after, capped at maxMs", () => {
    expect(backoffDelayMs(1, undefined, backoff)).toBe(1_000)
    expect(backoffDelayMs(2, undefined, backoff)).toBe(2_000)
    expect(backoffDelayMs(3, undefined, backoff)).toBe(4_000)
    expect(backoffDelayMs(20, undefined, backoff)).toBe(30_000) // capped
  })
})

describe("renderBatchSummary", () => {
  it("reports the totals line and names failures", () => {
    const text = renderBatchSummary({
      total: 2,
      applied: 1,
      held: 0,
      failed: 1,
      skipped: 0,
      results: [
        {
          idempotencyKey: "k1",
          sourceLocator: "a",
          recordType: "invoice",
          status: "applied",
          attempts: 1,
        },
        {
          idempotencyKey: "k2",
          sourceLocator: "b",
          recordType: "invoice",
          status: "failed",
          attempts: 3,
          error: "rate-limited",
        },
      ],
    })
    expect(text).toContain("total=2")
    expect(text).toContain("applied=1")
    expect(text).toContain("failed=1")
    expect(text).toContain("b: rate-limited")
  })
})
