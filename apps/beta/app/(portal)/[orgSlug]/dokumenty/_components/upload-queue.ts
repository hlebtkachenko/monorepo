/**
 * The upload queue's state machine (spec §2.2: "per-file progress + retry,
 * queue survives tab switch").
 *
 * A PURE REDUCER, DELIBERATELY. Everything an upload can be — waiting, being
 * re-encoded, in flight with a percentage, finished, already on the book,
 * failed and retryable, failed and pointless to retry — is a value here, and the
 * transitions between them are a function. The React component is the thing that
 * calls `fetch`; it holds no rules. That split is what makes "three files
 * uploaded, one duplicated, one failed on a flaky tunnel, retry only that one"
 * a test rather than a manual QA pass on a phone.
 *
 * WHY A FAILED UPLOAD IS NOT SIMPLY "RETRY IT". Retrying a 413 or a 415 sends
 * the same 25 MB video a second time to be refused a second time — on the site
 * 3G this product is designed around, that is a minute of the client's life
 * spent proving what they were already told. So the failure carries WHY, and
 * only the reasons that a second attempt can change are offered a retry:
 * a dropped connection, a Postgres deadlock the server asked us to retry, a 5xx.
 *
 * WHY "duplicate" IS A STATE AND NOT AN ERROR. Spec §2.2 is explicit — the
 * upload API answers 200, not 4xx, and the client is told "už jste nahráli",
 * "never an error page". `documentId` is null when the twin is a row this caller
 * may not read (a hidden document, a payslip): the upload is still correctly
 * refused as a duplicate, there is simply no link to offer.
 */

export type UploadItemState =
  /** Picked, waiting its turn. */
  | "queued"
  /** Being downscaled in the browser before the request starts. */
  | "preparing"
  /** In flight; `progress` is meaningful. */
  | "uploading"
  /** Stored. A new row exists. */
  | "done"
  /** These bytes were already on this book; nothing new was stored. */
  | "duplicate"
  /** Refused or interrupted; `failure` says why. */
  | "failed"

/**
 * Why an upload failed.
 *
 * The first three are answers the SERVER gave, mapped from its `error` field
 * (`app/api/orgs/[orgSlug]/documents/route.ts`); `network` is the browser
 * failing to complete the request at all; `server` is anything else, including a
 * 5xx and a body that did not parse.
 */
export type UploadFailure =
  | "too_large"
  | "unsupported_type"
  | "quota_exceeded"
  | "invalid_filename"
  | "forbidden"
  | "not_found"
  | "retry"
  | "network"
  | "server"

/**
 * Reasons a second attempt can plausibly end differently.
 *
 * `retry` is the server asking for one outright (a deadlock victim — see
 * `lib/data/documents.ts`). `network` and `server` are transient by nature. Every
 * other failure is a property of the FILE or of the CALLER and will be answered
 * identically forever.
 */
const RETRYABLE: ReadonlySet<UploadFailure> = new Set<UploadFailure>([
  "retry",
  "network",
  "server",
])

export function isRetryable(failure: UploadFailure): boolean {
  return RETRYABLE.has(failure)
}

export type UploadItem = {
  /** Stable for the item's whole life; the reducer's only identity. */
  id: string
  filename: string
  /** Bytes of the PICKED file, before any downscale. */
  size: number
  state: UploadItemState
  /** 0-100. Meaningful while `uploading`; 100 once finished. */
  progress: number
  /**
   * The row this upload produced (`done`) or duplicates (`duplicate`), when the
   * caller may open it. Null otherwise — including for a duplicate of a row the
   * office has hidden.
   */
  documentId: string | null
  /**
   * When that row was uploaded, ISO. Spec §2.2 wants the duplicate message to
   * name the day ("už jste nahráli DD.MM.YYYY"), and the API hands the twin's
   * whole projection back, so the date is already in the response — it does not
   * cost a second read.
   */
  documentUploadedAt: string | null
  failure: UploadFailure | null
}

export type UploadQueue = {
  items: UploadItem[]
}

export const EMPTY_UPLOAD_QUEUE: UploadQueue = { items: [] }

export type UploadAction =
  | { type: "enqueue"; items: { id: string; filename: string; size: number }[] }
  | { type: "preparing"; id: string }
  | { type: "uploading"; id: string }
  | { type: "progress"; id: string; progress: number }
  | { type: "stored"; id: string; documentId: string; uploadedAt: string }
  | {
      type: "duplicate"
      id: string
      documentId: string | null
      uploadedAt: string | null
    }
  | { type: "failed"; id: string; failure: UploadFailure }
  | { type: "retry"; id: string }
  | { type: "retryAll" }
  /** Drop the items that finished cleanly, leaving failures on screen. */
  | { type: "clearFinished" }

function patch(
  queue: UploadQueue,
  id: string,
  change: (item: UploadItem) => UploadItem,
): UploadQueue {
  let touched = false
  const items = queue.items.map((item) => {
    if (item.id !== id) return item
    touched = true
    return change(item)
  })
  // Returning the same object when nothing matched keeps a stale callback — an
  // XHR progress event for an item the client already cleared — from forcing a
  // re-render of a list it cannot change.
  return touched ? { items } : queue
}

export function uploadQueueReducer(
  queue: UploadQueue,
  action: UploadAction,
): UploadQueue {
  switch (action.type) {
    case "enqueue":
      return {
        items: [
          ...queue.items,
          ...action.items.map((item) => ({
            ...item,
            state: "queued" as const,
            progress: 0,
            documentId: null,
            documentUploadedAt: null,
            failure: null,
          })),
        ],
      }

    case "preparing":
      return patch(queue, action.id, (item) => ({
        ...item,
        state: "preparing",
        progress: 0,
        failure: null,
      }))

    case "uploading":
      return patch(queue, action.id, (item) => ({
        ...item,
        state: "uploading",
        progress: 0,
        failure: null,
      }))

    case "progress":
      return patch(queue, action.id, (item) =>
        // Progress for an item that is no longer in flight is noise from an XHR
        // whose result already landed; applying it would move a finished bar.
        item.state === "uploading"
          ? {
              ...item,
              progress: Math.min(100, Math.max(0, Math.round(action.progress))),
            }
          : item,
      )

    case "stored":
      return patch(queue, action.id, (item) => ({
        ...item,
        state: "done",
        progress: 100,
        documentId: action.documentId,
        documentUploadedAt: action.uploadedAt,
        failure: null,
      }))

    case "duplicate":
      return patch(queue, action.id, (item) => ({
        ...item,
        state: "duplicate",
        progress: 100,
        documentId: action.documentId,
        documentUploadedAt: action.uploadedAt,
        failure: null,
      }))

    case "failed":
      return patch(queue, action.id, (item) => ({
        ...item,
        state: "failed",
        progress: 0,
        documentId: null,
        documentUploadedAt: null,
        failure: action.failure,
      }))

    case "retry":
      return patch(queue, action.id, (item) =>
        item.state === "failed" &&
        item.failure !== null &&
        isRetryable(item.failure)
          ? { ...item, state: "queued", progress: 0, failure: null }
          : item,
      )

    case "retryAll": {
      if (!hasRetryable(queue)) return queue
      return {
        items: queue.items.map((item) =>
          item.state === "failed" &&
          item.failure !== null &&
          isRetryable(item.failure)
            ? { ...item, state: "queued" as const, progress: 0, failure: null }
            : item,
        ),
      }
    }

    case "clearFinished": {
      const items = queue.items.filter(
        (item) => item.state !== "done" && item.state !== "duplicate",
      )
      return items.length === queue.items.length ? queue : { items }
    }
  }
}

// ---------------------------------------------------------------------------
// Selectors — everything the component asks the queue, asked in one place
// ---------------------------------------------------------------------------

/** The next item to start, or undefined when there is nothing to do. */
export function nextQueued(queue: UploadQueue): UploadItem | undefined {
  return queue.items.find((item) => item.state === "queued")
}

/** Is something already in flight? Uploads run one at a time (see the panel). */
export function isBusy(queue: UploadQueue): boolean {
  return queue.items.some(
    (item) => item.state === "preparing" || item.state === "uploading",
  )
}

export function hasRetryable(queue: UploadQueue): boolean {
  return queue.items.some(
    (item) =>
      item.state === "failed" &&
      item.failure !== null &&
      isRetryable(item.failure),
  )
}

export type UploadQueueSummary = {
  total: number
  pending: number
  stored: number
  duplicate: number
  failed: number
  /** Every item has reached a terminal state. */
  settled: boolean
}

export function summarizeQueue(queue: UploadQueue): UploadQueueSummary {
  const summary = {
    total: queue.items.length,
    pending: 0,
    stored: 0,
    duplicate: 0,
    failed: 0,
  }

  for (const item of queue.items) {
    if (item.state === "done") summary.stored += 1
    else if (item.state === "duplicate") summary.duplicate += 1
    else if (item.state === "failed") summary.failed += 1
    else summary.pending += 1
  }

  return { ...summary, settled: summary.pending === 0 }
}

/**
 * The server's `error` field, as a failure this queue understands.
 *
 * Every code the upload route can answer with is mapped
 * (`REFUSAL_STATUS` in `app/api/orgs/[orgSlug]/documents/route.ts`), and an
 * unrecognised one becomes `server` rather than throwing: the API can grow a
 * refusal before this list does, and a client that crashes on an unknown string
 * is worse than one that says "zkuste to prosím znovu". `server` is retryable,
 * which is the safe default of the two — the cost of a pointless retry is one
 * request, the cost of a missing one is a document that never arrives.
 */
export function failureFromResponse(error: string | undefined): UploadFailure {
  switch (error) {
    case "too_large":
      return "too_large"
    case "unsupported_type":
      return "unsupported_type"
    case "quota_exceeded":
      return "quota_exceeded"
    case "invalid_filename":
    case "invalid_doc_type":
    case "empty_body":
      return "invalid_filename"
    case "forbidden":
    case "cross_site":
      return "forbidden"
    case "not_found":
      return "not_found"
    case "retry":
      return "retry"
    default:
      return "server"
  }
}
