/**
 * The bulk-upload preview's state machine (spec §2.6 Výplatnice: "office bulk
 * ZIP upload with filename→employee matching preview").
 *
 * A PURE REDUCER, THE SAME SHAPE `dokumenty/_components/upload-queue.ts`
 * ALREADY ESTABLISHED for PR 11's per-file progress and retry — that file's
 * own header states the reasoning this one follows too: everything a payslip
 * upload can be is a value here, and the React component that calls `fetch`
 * holds no rules of its own.
 *
 * NARROWER THAN ITS TWIN, DELIBERATELY. There is no "preparing" state — a
 * payslip is a PDF straight out of a ZIP entry, never downscaled — and every
 * item starts with a PROPOSED employee (`employeeId`, from
 * `matchPayslipFilename`) that the office may `reassign` before it is ever
 * uploaded, which `upload-queue.ts` has no equivalent of: a client's own
 * upload never needs a second opinion about whose document it is.
 */

export type PayslipUploadItemState =
  /** Picked (with a proposed or reassigned employee), waiting its turn. */
  | "queued"
  /** In flight. */
  | "uploading"
  /** Stored. A new payslip row exists. */
  | "done"
  /** These bytes were already on this book; nothing new was stored. */
  | "duplicate"
  /** Refused or interrupted; `failure` says why. */
  | "failed"

/**
 * Why an upload failed. The first seven are the server's own refusal reasons
 * (`PayslipUploadRefusal`, `lib/data/payslips.ts`); `network` and `server`
 * are the same two client-side catch-alls `upload-queue.ts` defines.
 */
export type PayslipUploadFailure =
  | "empty_body"
  | "unsupported_type"
  | "too_large"
  | "invalid_filename"
  | "unknown_employee"
  | "unknown_period"
  | "quota_exceeded"
  | "retry"
  | "network"
  | "server"

/** The same rule `upload-queue.ts`'s `isRetryable` states: only a second
 * attempt that could plausibly end differently is offered a retry. Every
 * other failure is a property of the FILE or the CHOSEN EMPLOYEE and a
 * reassignment, not a retry, is what changes the answer. */
const RETRYABLE: ReadonlySet<PayslipUploadFailure> =
  new Set<PayslipUploadFailure>(["retry", "network", "server"])

export function isRetryable(failure: PayslipUploadFailure): boolean {
  return RETRYABLE.has(failure)
}

export type PayslipUploadItem = {
  /** Stable for the item's whole life; the reducer's only identity. */
  id: string
  /** The base filename, directory components already stripped. */
  filename: string
  size: number
  /** The proposed or office-reassigned employee, or `null` if unassigned. */
  employeeId: string | null
  confidence: "high" | "low" | null
  state: PayslipUploadItemState
  failure: PayslipUploadFailure | null
}

export type PayslipUploadQueue = { items: PayslipUploadItem[] }

export const EMPTY_PAYSLIP_UPLOAD_QUEUE: PayslipUploadQueue = { items: [] }

export type PayslipUploadAction =
  | {
      type: "enqueue"
      items: {
        id: string
        filename: string
        size: number
        employeeId: string | null
        confidence: "high" | "low" | null
      }[]
    }
  | { type: "reassign"; id: string; employeeId: string | null }
  | { type: "uploading"; id: string }
  | { type: "done"; id: string }
  | { type: "duplicate"; id: string }
  | { type: "failed"; id: string; failure: PayslipUploadFailure }
  /** Only a `failed` item whose failure `isRetryable` moves back to `queued`. */
  | { type: "retry"; id: string }
  /** A new ZIP was picked — start over. */
  | { type: "reset" }

function patch(
  queue: PayslipUploadQueue,
  id: string,
  change: (item: PayslipUploadItem) => PayslipUploadItem,
): PayslipUploadQueue {
  let touched = false
  const items = queue.items.map((item) => {
    if (item.id !== id) return item
    touched = true
    return change(item)
  })
  return touched ? { items } : queue
}

export function payslipUploadReducer(
  queue: PayslipUploadQueue,
  action: PayslipUploadAction,
): PayslipUploadQueue {
  switch (action.type) {
    case "enqueue":
      return {
        items: [
          ...queue.items,
          ...action.items.map((item) => ({
            ...item,
            state: "queued" as const,
            failure: null,
          })),
        ],
      }
    case "reassign":
      return patch(queue, action.id, (item) => ({
        ...item,
        employeeId: action.employeeId,
      }))
    case "uploading":
      return patch(queue, action.id, (item) => ({
        ...item,
        state: "uploading",
        failure: null,
      }))
    case "done":
      return patch(queue, action.id, (item) => ({ ...item, state: "done" }))
    case "duplicate":
      return patch(queue, action.id, (item) => ({
        ...item,
        state: "duplicate",
      }))
    case "failed":
      return patch(queue, action.id, (item) => ({
        ...item,
        state: "failed",
        failure: action.failure,
      }))
    case "retry":
      return patch(queue, action.id, (item) =>
        item.state === "failed" && isRetryable(item.failure ?? "server")
          ? { ...item, state: "queued", failure: null }
          : item,
      )
    case "reset":
      return EMPTY_PAYSLIP_UPLOAD_QUEUE
    default: {
      const unreachable: never = action
      return unreachable
    }
  }
}
