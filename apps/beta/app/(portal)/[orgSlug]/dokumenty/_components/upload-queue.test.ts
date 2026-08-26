/**
 * The upload queue's state machine (spec §2.2: per-file progress, retry, and a
 * duplicate that is a STATE rather than an error).
 *
 * Every rule the panel relies on is asserted here as a pure transition, because
 * the alternative is asserting it through a component that owns an XHR: the
 * interesting cases — three files, one duplicated, one failed transiently, one
 * failed permanently, retry the right ones — are trivial as reducer calls and
 * near-untestable as a rendered flow.
 */
import { describe, expect, it } from "vitest"

import {
  EMPTY_UPLOAD_QUEUE,
  failureFromResponse,
  hasRetryable,
  isBusy,
  isRetryable,
  nextQueued,
  summarizeQueue,
  uploadQueueReducer,
  type UploadAction,
  type UploadQueue,
} from "./upload-queue"

/** Fold a script of actions over an empty queue. */
function run(...actions: UploadAction[]): UploadQueue {
  return actions.reduce(uploadQueueReducer, EMPTY_UPLOAD_QUEUE)
}

const three: UploadAction = {
  type: "enqueue",
  items: [
    { id: "a", filename: "ucteka.jpg", size: 1024 },
    { id: "b", filename: "faktura.pdf", size: 2048 },
    { id: "c", filename: "video.mp4", size: 40_000_000 },
  ],
}

describe("the happy path", () => {
  it("walks queued → preparing → uploading → done", () => {
    const queue = run(
      { type: "enqueue", items: [{ id: "a", filename: "a.jpg", size: 10 }] },
      { type: "preparing", id: "a" },
      { type: "uploading", id: "a" },
      { type: "progress", id: "a", progress: 42.4 },
      {
        type: "stored",
        id: "a",
        documentId: "doc-1",
        uploadedAt: "2026-03-07T09:24:00.000Z",
      },
    )

    expect(queue.items[0]).toMatchObject({
      state: "done",
      progress: 100,
      documentId: "doc-1",
      documentUploadedAt: "2026-03-07T09:24:00.000Z",
      failure: null,
    })
    expect(summarizeQueue(queue)).toMatchObject({
      total: 1,
      stored: 1,
      settled: true,
    })
  })

  it("rounds and clamps a progress percentage", () => {
    const base = run(
      { type: "enqueue", items: [{ id: "a", filename: "a.jpg", size: 10 }] },
      { type: "uploading", id: "a" },
    )
    expect(
      uploadQueueReducer(base, { type: "progress", id: "a", progress: 42.4 })
        .items[0]?.progress,
    ).toBe(42)
    expect(
      uploadQueueReducer(base, { type: "progress", id: "a", progress: 1e6 })
        .items[0]?.progress,
    ).toBe(100)
    expect(
      uploadQueueReducer(base, { type: "progress", id: "a", progress: -5 })
        .items[0]?.progress,
    ).toBe(0)
  })

  it("ignores a progress event for an item that already finished", () => {
    // An XHR fires one last `progress` after its `load`. Applying it would drag
    // a finished bar backwards.
    const done = run(
      { type: "enqueue", items: [{ id: "a", filename: "a.jpg", size: 10 }] },
      { type: "uploading", id: "a" },
      {
        type: "stored",
        id: "a",
        documentId: "doc-1",
        uploadedAt: "2026-03-07T09:24:00.000Z",
      },
    )
    const after = uploadQueueReducer(done, {
      type: "progress",
      id: "a",
      progress: 12,
    })
    expect(after.items[0]?.progress).toBe(100)
  })

  it("ignores an event for an id the queue no longer holds, identically", () => {
    const queue = run(three)
    expect(
      uploadQueueReducer(queue, { type: "progress", id: "zz", progress: 1 }),
    ).toBe(queue)
  })
})

describe("the duplicate is a state, never an error (spec §2.2)", () => {
  it("keeps the twin's id and date when the caller may read that row", () => {
    const queue = run(
      { type: "enqueue", items: [{ id: "a", filename: "a.jpg", size: 10 }] },
      { type: "uploading", id: "a" },
      {
        type: "duplicate",
        id: "a",
        documentId: "doc-9",
        uploadedAt: "2026-03-01T10:00:00.000Z",
      },
    )

    expect(queue.items[0]).toMatchObject({
      state: "duplicate",
      documentId: "doc-9",
      documentUploadedAt: "2026-03-01T10:00:00.000Z",
      failure: null,
    })
    expect(summarizeQueue(queue).failed).toBe(0)
  })

  it("carries NO id and NO date when the twin is hidden from this caller", () => {
    // The API omits `document` entirely for a hidden or payslip twin. The upload
    // is still correctly refused as a duplicate; there is simply no link.
    const queue = run(
      { type: "enqueue", items: [{ id: "a", filename: "a.jpg", size: 10 }] },
      { type: "duplicate", id: "a", documentId: null, uploadedAt: null },
    )
    expect(queue.items[0]).toMatchObject({
      state: "duplicate",
      documentId: null,
      documentUploadedAt: null,
    })
  })
})

describe("retry — only what a second attempt can change", () => {
  it.each([
    ["network", true],
    ["server", true],
    ["retry", true],
    ["too_large", false],
    ["unsupported_type", false],
    ["quota_exceeded", false],
    ["invalid_filename", false],
    ["forbidden", false],
    ["not_found", false],
  ] as const)("%s is retryable: %s", (failure, expected) => {
    expect(isRetryable(failure)).toBe(expected)
  })

  it("puts a retryable failure back in the queue and clears its error", () => {
    const queue = run(
      { type: "enqueue", items: [{ id: "a", filename: "a.jpg", size: 10 }] },
      { type: "failed", id: "a", failure: "network" },
      { type: "retry", id: "a" },
    )
    expect(queue.items[0]).toMatchObject({
      state: "queued",
      progress: 0,
      failure: null,
    })
  })

  it("refuses to retry a failure that will be answered identically forever", () => {
    const failed = run(
      {
        type: "enqueue",
        items: [{ id: "a", filename: "video.mp4", size: 10 }],
      },
      { type: "failed", id: "a", failure: "unsupported_type" },
    )
    const after = uploadQueueReducer(failed, { type: "retry", id: "a" })
    expect(after.items[0]).toMatchObject({
      state: "failed",
      failure: "unsupported_type",
    })
    expect(hasRetryable(failed)).toBe(false)
  })

  it("retryAll requeues the transient failures and leaves the rest alone", () => {
    const queue = run(
      three,
      {
        type: "stored",
        id: "a",
        documentId: "doc-1",
        uploadedAt: "2026-03-07T09:24:00.000Z",
      },
      { type: "failed", id: "b", failure: "network" },
      { type: "failed", id: "c", failure: "too_large" },
      { type: "retryAll" },
    )

    expect(queue.items.map((item) => [item.id, item.state])).toEqual([
      ["a", "done"],
      ["b", "queued"],
      ["c", "failed"],
    ])
    expect(hasRetryable(queue)).toBe(false)
  })

  it("retryAll is a no-op object-identity-wise when there is nothing to retry", () => {
    const queue = run(three, { type: "failed", id: "c", failure: "too_large" })
    expect(uploadQueueReducer(queue, { type: "retryAll" })).toBe(queue)
  })
})

describe("the pump's view of the queue", () => {
  it("hands out the OLDEST queued item, in pick order", () => {
    const queue = run(three)
    expect(nextQueued(queue)?.id).toBe("a")
    expect(isBusy(queue)).toBe(false)
  })

  it("reports busy while an item is preparing or uploading", () => {
    expect(isBusy(run(three, { type: "preparing", id: "a" }))).toBe(true)
    expect(isBusy(run(three, { type: "uploading", id: "a" }))).toBe(true)
  })

  it("has nothing to hand out once every item is terminal", () => {
    const queue = run(
      three,
      {
        type: "stored",
        id: "a",
        documentId: "doc-1",
        uploadedAt: "2026-03-07T09:24:00.000Z",
      },
      { type: "duplicate", id: "b", documentId: null, uploadedAt: null },
      { type: "failed", id: "c", failure: "too_large" },
    )
    expect(nextQueued(queue)).toBeUndefined()
    expect(summarizeQueue(queue)).toEqual({
      total: 3,
      pending: 0,
      stored: 1,
      duplicate: 1,
      failed: 1,
      settled: true,
    })
  })

  it("a partly-failed queue is settled, so the table refreshes once", () => {
    const queue = run(
      three,
      {
        type: "stored",
        id: "a",
        documentId: "doc-1",
        uploadedAt: "2026-03-07T09:24:00.000Z",
      },
      { type: "failed", id: "b", failure: "network" },
      { type: "failed", id: "c", failure: "too_large" },
    )
    expect(summarizeQueue(queue).settled).toBe(true)
  })
})

describe("clearFinished", () => {
  it("drops the finished rows and keeps every failure on screen", () => {
    const queue = run(
      three,
      {
        type: "stored",
        id: "a",
        documentId: "doc-1",
        uploadedAt: "2026-03-07T09:24:00.000Z",
      },
      { type: "duplicate", id: "b", documentId: "doc-2", uploadedAt: null },
      { type: "failed", id: "c", failure: "network" },
      { type: "clearFinished" },
    )
    expect(queue.items.map((item) => item.id)).toEqual(["c"])
  })

  it("changes nothing, and says so by identity, when nothing finished", () => {
    const queue = run(three)
    expect(uploadQueueReducer(queue, { type: "clearFinished" })).toBe(queue)
  })
})

describe("failureFromResponse — every refusal the route can answer with", () => {
  it.each([
    ["too_large", "too_large"],
    ["unsupported_type", "unsupported_type"],
    ["quota_exceeded", "quota_exceeded"],
    ["invalid_filename", "invalid_filename"],
    ["invalid_doc_type", "invalid_filename"],
    ["empty_body", "invalid_filename"],
    ["forbidden", "forbidden"],
    ["cross_site", "forbidden"],
    ["not_found", "not_found"],
    ["retry", "retry"],
  ] as const)("maps %s to %s", (error, expected) => {
    expect(failureFromResponse(error)).toBe(expected)
  })

  it("falls back to a RETRYABLE failure for a code it has never seen", () => {
    // The API may grow a refusal before this list does. Guessing "permanent"
    // would strand a document; guessing "transient" costs one request.
    expect(failureFromResponse("something_new")).toBe("server")
    expect(failureFromResponse(undefined)).toBe("server")
    expect(isRetryable(failureFromResponse(undefined))).toBe(true)
  })
})
