import { beforeEach, describe, expect, it, vi } from "vitest"

const notifyMock = vi.hoisted(() => ({
  reportIssue: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@workspace/notify", () => ({
  notifierFromEnv: () => notifyMock,
}))

import type { GatedWriteResult } from "./accounting-writes.gate"
import { observeGateIntegrity } from "./gate-integrity-alert"

const context = {
  operationId: "createAccountingEvent",
  organizationId: "org-1",
}

const appliedResult: GatedWriteResult = {
  httpStatus: 201,
  body: { status: "applied", eventId: "ev-1" },
  replayed: false,
}
const heldResult: GatedWriteResult = {
  httpStatus: 202,
  body: { status: "held", reviewId: "log-1" },
  replayed: false,
}
const replayedAppliedResult: GatedWriteResult = {
  httpStatus: 200,
  body: { status: "applied", eventId: "ev-1" },
  replayed: true,
}

describe("observeGateIntegrity", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env["ACCOUNTING_GATE_COLD_START_POSTURE"]
  })

  it("fires a CRITICAL reportIssue when a FRESH write auto-applies (201) at cold start", async () => {
    observeGateIntegrity(appliedResult, context)
    await vi.waitFor(() =>
      expect(notifyMock.reportIssue).toHaveBeenCalledTimes(1),
    )
    const call = notifyMock.reportIssue.mock.calls[0]?.[0]
    expect(call?.risk).toBe("blocking")
    expect(call?.type).toBe("security")
    expect(call?.title).toContain("Gate-integrity breach")
    expect(call?.body).toContain("createAccountingEvent")
    expect(call?.body).toContain("org-1")
    expect(call?.fingerprintParts).toEqual([
      "gate-integrity-breach",
      "createAccountingEvent",
    ])
  })

  it("does NOT fire for a HELD (202) result", () => {
    observeGateIntegrity(heldResult, context)
    expect(notifyMock.reportIssue).not.toHaveBeenCalled()
  })

  it("does NOT fire for a REPLAYED applied result (200) — the original decision already fired, or predates the alert", () => {
    observeGateIntegrity(replayedAppliedResult, context)
    expect(notifyMock.reportIssue).not.toHaveBeenCalled()
  })

  it("does NOT fire when the cold-start posture is explicitly disarmed", () => {
    process.env["ACCOUNTING_GATE_COLD_START_POSTURE"] = "false"
    observeGateIntegrity(appliedResult, context)
    expect(notifyMock.reportIssue).not.toHaveBeenCalled()
  })

  it("swallows a notify failure — never throws synchronously and never leaks an unhandled rejection", async () => {
    notifyMock.reportIssue.mockRejectedValueOnce(new Error("bot unreachable"))
    expect(() => observeGateIntegrity(appliedResult, context)).not.toThrow()
    await vi.waitFor(() =>
      expect(notifyMock.reportIssue).toHaveBeenCalledTimes(1),
    )
    // Let the rejected promise's .catch(() => {}) settle before the test ends;
    // an unswallowed rejection here would surface as an unhandled rejection.
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
})
