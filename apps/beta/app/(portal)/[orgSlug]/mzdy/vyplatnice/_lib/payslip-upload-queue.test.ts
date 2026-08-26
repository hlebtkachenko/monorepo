import { describe, expect, it } from "vitest"

import {
  EMPTY_PAYSLIP_UPLOAD_QUEUE,
  isRetryable,
  payslipUploadReducer,
  type PayslipUploadQueue,
} from "./payslip-upload-queue"

const ENQUEUE_ONE = {
  type: "enqueue" as const,
  items: [
    {
      id: "a",
      filename: "novak.pdf",
      size: 1024,
      employeeId: "emp-1",
      confidence: "high" as const,
    },
  ],
}

function queueWithOne(): PayslipUploadQueue {
  return payslipUploadReducer(EMPTY_PAYSLIP_UPLOAD_QUEUE, ENQUEUE_ONE)
}

describe("isRetryable", () => {
  it("is true only for retry, network and server", () => {
    expect(isRetryable("retry")).toBe(true)
    expect(isRetryable("network")).toBe(true)
    expect(isRetryable("server")).toBe(true)
    expect(isRetryable("unknown_employee")).toBe(false)
    expect(isRetryable("unsupported_type")).toBe(false)
    expect(isRetryable("quota_exceeded")).toBe(false)
  })
})

describe("payslipUploadReducer", () => {
  it("enqueues items as queued with no failure, even if the input carried one", () => {
    const queue = queueWithOne()
    expect(queue.items).toEqual([
      {
        id: "a",
        filename: "novak.pdf",
        size: 1024,
        employeeId: "emp-1",
        confidence: "high",
        state: "queued",
        failure: null,
      },
    ])
  })

  it("appends to an existing queue rather than replacing it", () => {
    const first = queueWithOne()
    const second = payslipUploadReducer(first, {
      type: "enqueue",
      items: [
        {
          id: "b",
          filename: "svoboda.pdf",
          size: 2048,
          employeeId: null,
          confidence: null,
        },
      ],
    })
    expect(second.items.map((item) => item.id)).toEqual(["a", "b"])
  })

  it("reassigns the proposed employee, including back to unassigned", () => {
    const queue = queueWithOne()
    const reassigned = payslipUploadReducer(queue, {
      type: "reassign",
      id: "a",
      employeeId: "emp-2",
    })
    expect(reassigned.items[0]?.employeeId).toBe("emp-2")

    const unassigned = payslipUploadReducer(reassigned, {
      type: "reassign",
      id: "a",
      employeeId: null,
    })
    expect(unassigned.items[0]?.employeeId).toBeNull()
  })

  it("walks queued -> uploading -> done", () => {
    let queue = queueWithOne()
    queue = payslipUploadReducer(queue, { type: "uploading", id: "a" })
    expect(queue.items[0]?.state).toBe("uploading")
    queue = payslipUploadReducer(queue, { type: "done", id: "a" })
    expect(queue.items[0]?.state).toBe("done")
  })

  it("walks queued -> uploading -> duplicate", () => {
    let queue = queueWithOne()
    queue = payslipUploadReducer(queue, { type: "uploading", id: "a" })
    queue = payslipUploadReducer(queue, { type: "duplicate", id: "a" })
    expect(queue.items[0]?.state).toBe("duplicate")
  })

  it("records the failure reason on failed", () => {
    let queue = queueWithOne()
    queue = payslipUploadReducer(queue, { type: "uploading", id: "a" })
    queue = payslipUploadReducer(queue, {
      type: "failed",
      id: "a",
      failure: "unknown_employee",
    })
    expect(queue.items[0]?.state).toBe("failed")
    expect(queue.items[0]?.failure).toBe("unknown_employee")
  })

  it("retry moves a retryable failure back to queued and clears it", () => {
    let queue = queueWithOne()
    queue = payslipUploadReducer(queue, {
      type: "failed",
      id: "a",
      failure: "network",
    })
    queue = payslipUploadReducer(queue, { type: "retry", id: "a" })
    expect(queue.items[0]?.state).toBe("queued")
    expect(queue.items[0]?.failure).toBeNull()
  })

  it("retry is a no-op on a non-retryable failure", () => {
    let queue = queueWithOne()
    queue = payslipUploadReducer(queue, {
      type: "failed",
      id: "a",
      failure: "unsupported_type",
    })
    const after = payslipUploadReducer(queue, { type: "retry", id: "a" })
    expect(after.items[0]?.state).toBe("failed")
    expect(after.items[0]?.failure).toBe("unsupported_type")
  })

  it("retry is a no-op on an item that never failed", () => {
    const queue = queueWithOne()
    const after = payslipUploadReducer(queue, { type: "retry", id: "a" })
    expect(after).toEqual(queue)
  })

  it("reset clears the whole queue", () => {
    const queue = queueWithOne()
    expect(payslipUploadReducer(queue, { type: "reset" })).toEqual(
      EMPTY_PAYSLIP_UPLOAD_QUEUE,
    )
  })

  it("an action naming an unknown id changes nothing (same reference)", () => {
    const queue = queueWithOne()
    const after = payslipUploadReducer(queue, { type: "done", id: "ghost" })
    expect(after).toBe(queue)
  })
})
