import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  ConflictError,
  ForbiddenError,
  IdempotencyConflictError,
  ValidationError,
} from "@workspace/shared/errors"

vi.mock("@workspace/db", () => ({
  withOrganization: vi.fn(),
  writeToolCallLog: vi.fn(),
  updateToolCallLogOutput: vi.fn(),
}))

const db = await import("@workspace/db")
const { runGatedWrite, canonicalHash } =
  await import("./accounting-writes.gate")

const writeLog = vi.mocked(db.writeToolCallLog)
const updateLog = vi.mocked(db.updateToolCallLogOutput)
const withOrg = vi.mocked(db.withOrganization)

const principal = {
  userId: "user-1" as string | null,
  organizationId: "org-1",
  workspaceId: "ws-1",
  scopes: [] as readonly string[],
}

type Ev = { eventId: string; designation: string; sequenceNumber: number }

function build(
  over: Partial<{
    idempotencyKey?: string
    confidence: number
    holdAmounts: string[]
    conversationId?: string
    body: unknown
    run: () => Promise<Ev>
    userId: string | null
  }> = {},
) {
  const body = over.body ?? { periodId: "p-1", note: "x" }
  return {
    principal: {
      ...principal,
      userId: "userId" in over ? (over.userId ?? null) : principal.userId,
    },
    idempotencyKey: "idempotencyKey" in over ? over.idempotencyKey : "key-1",
    operationId: "createAccountingEvent",
    body,
    confidence: over.confidence ?? 0.95,
    rationale: "test rationale",
    conversationId: over.conversationId,
    holdAmounts: over.holdAmounts ?? [],
    run:
      over.run ??
      vi.fn().mockResolvedValue({
        eventId: "ev-1",
        designation: "FP1",
        sequenceNumber: 1,
      }),
    applied: (r: Ev) => ({ eventId: r.eventId }),
  }
}

describe("runGatedWrite", () => {
  beforeEach(() => {
    writeLog.mockReset()
    updateLog.mockReset()
    withOrg.mockReset()
    // Run the callback with a throwaway db handle, one transaction.
    withOrg.mockImplementation((_org, _user, fn) =>
      (fn as (db: unknown) => Promise<unknown>)({}),
    )
    writeLog.mockResolvedValue({ toolCallLogId: "log-1", replayed: false })
    updateLog.mockResolvedValue(undefined as never)
  })

  it("rejects when the Idempotency-Key is missing", async () => {
    await expect(
      runGatedWrite(build({ idempotencyKey: undefined })),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(withOrg).not.toHaveBeenCalled()
  })

  it("rejects with 403 when the API key has no bound user", async () => {
    await expect(runGatedWrite(build({ userId: null }))).rejects.toBeInstanceOf(
      ForbiddenError,
    )
    expect(writeLog).not.toHaveBeenCalled()
  })

  it("auto-applies (201) at/above the confidence threshold, running the domain fn", async () => {
    const run = vi.fn().mockResolvedValue({
      eventId: "ev-9",
      designation: "FP9",
      sequenceNumber: 9,
    })
    const res = await runGatedWrite(build({ confidence: 0.95, run }))
    expect(res.httpStatus).toBe(201)
    expect(res.body).toMatchObject({ status: "applied", eventId: "ev-9" })
    expect(run).toHaveBeenCalledOnce()
    expect(updateLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ autoApplied: true }),
    )
  })

  it("holds (202) below the confidence threshold WITHOUT running the domain fn", async () => {
    const run = vi.fn()
    const res = await runGatedWrite(build({ confidence: 0.5, run }))
    expect(res.httpStatus).toBe(202)
    expect(res.body).toMatchObject({ status: "held", reviewId: "log-1" })
    expect(run).not.toHaveBeenCalled()
    expect(updateLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ autoApplied: false }),
    )
  })

  it("holds (202) when an amount exceeds the always-hold ceiling despite high confidence", async () => {
    const run = vi.fn()
    const res = await runGatedWrite(
      build({ confidence: 0.99, holdAmounts: ["150000.00"], run }),
    )
    expect(res.httpStatus).toBe(202)
    expect(run).not.toHaveBeenCalled()
  })

  it("replays a matching prior request as 200 (no re-run)", async () => {
    const body = { periodId: "p-1", note: "same" }
    const run = vi.fn()
    writeLog.mockResolvedValue({
      toolCallLogId: "log-1",
      replayed: true,
      existingOutput: {
        payloadHash: canonicalHash(body),
        status: "applied",
        eventId: "ev-orig",
      },
    })
    const res = await runGatedWrite(build({ body, run }))
    expect(res.httpStatus).toBe(200)
    expect(res.replayed).toBe(true)
    expect(res.body).toMatchObject({ status: "applied", eventId: "ev-orig" })
    expect(res.body).not.toHaveProperty("payloadHash")
    expect(run).not.toHaveBeenCalled()
  })

  it("rejects a replayed key whose body hash differs (409 idempotency conflict)", async () => {
    writeLog.mockResolvedValue({
      toolCallLogId: "log-1",
      replayed: true,
      existingOutput: { payloadHash: "different-hash", status: "applied" },
    })
    await expect(runGatedWrite(build())).rejects.toBeInstanceOf(
      IdempotencyConflictError,
    )
  })

  it("rejects a replayed key still in progress (null prior output) as 409", async () => {
    writeLog.mockResolvedValue({
      toolCallLogId: "log-1",
      replayed: true,
      existingOutput: null,
    })
    await expect(runGatedWrite(build())).rejects.toBeInstanceOf(ConflictError)
  })
})
