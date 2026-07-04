import { beforeEach, describe, expect, it, vi } from "vitest"

import type { AdmissionController } from "@workspace/db"
import type { GateDecision } from "@workspace/brain/gate"
import {
  ConflictError,
  ForbiddenError,
  IdempotencyConflictError,
  RateLimitedError,
  ValidationError,
} from "@workspace/shared/errors"

import { deriveCaptureVeto } from "./accounting-veto"

// Mock the DB I/O the gate performs, plus the marshrutizátor primitives. The
// admission singleton (imported transitively by the gate) constructs an
// `AdmissionController` at load, so the mock must expose a usable (permissive)
// one + the `AdmissionRejected` class so the gate's `instanceof` map fires.
// The admission caps/kill-switch logic itself is covered in packages/db.
vi.mock("@workspace/db", () => {
  class AdmissionRejected extends Error {
    readonly reason: string
    constructor(reason: string) {
      super(`admission rejected: ${reason}`)
      this.name = "AdmissionRejected"
      this.reason = reason
    }
  }
  class AdmissionController {
    acquire(): { release: () => void } {
      return { release: () => {} }
    }
  }
  return {
    withOrganization: vi.fn(),
    writeToolCallLog: vi.fn(),
    updateToolCallLogOutput: vi.fn(),
    lockPeriodInTx: vi.fn(),
    AdmissionController,
    AdmissionRejected,
  }
})

const db = await import("@workspace/db")
const { runGatedWrite, canonicalHash } =
  await import("./accounting-writes.gate")

const writeLog = vi.mocked(db.writeToolCallLog)
const updateLog = vi.mocked(db.updateToolCallLogOutput)
const withOrg = vi.mocked(db.withOrganization)
const lockPeriod = vi.mocked(db.lockPeriodInTx)

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
    periodId: "p-1",
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

/**
 * A stub server-score decision. The REAL scorer (`evaluateEvidence`) is
 * fail-closed and never green at cold start (green is structurally unreachable),
 * so to exercise the auto-apply leg a test injects a green decision here — the
 * only honest way to reach the apply path without a fabricated cFinal. The
 * fail-closed cold-start tests below use the DEFAULT (real) scorer.
 */
const decision = (isGreen: boolean): GateDecision => ({
  cRaw: isGreen ? 0.98 : 0,
  cFinal: isGreen ? 0.98 : 0,
  isGreen,
  needsReview: !isGreen,
  blocked: !isGreen,
  firedSignals: isGreen ? [] : ["extraction_failed"],
  reasons: isGreen ? ["green"] : ["blocked: extraction_failed"],
})
const greenScorer = () => decision(true)

describe("runGatedWrite", () => {
  beforeEach(() => {
    writeLog.mockReset()
    updateLog.mockReset()
    withOrg.mockReset()
    lockPeriod.mockReset()
    lockPeriod.mockResolvedValue(undefined)
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

  it("auto-applies (201) when confidence, veto, AND the server score are all green", async () => {
    const run = vi.fn().mockResolvedValue({
      eventId: "ev-9",
      designation: "FP9",
      sequenceNumber: 9,
    })
    // The green server score is INJECTED — the real scorer is fail-closed and
    // never green at cold start (that is the fail-closed-cold-start test below).
    const res = await runGatedWrite(
      build({ confidence: 0.95, run }),
      undefined,
      greenScorer,
    )
    expect(res.httpStatus).toBe(201)
    expect(res.body).toMatchObject({ status: "applied", eventId: "ev-9" })
    expect(run).toHaveBeenCalledOnce()
    expect(updateLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ autoApplied: true }),
    )
  })

  it("HOLDS (202) at auto-apply confidence when the server score is NOT green (fail-closed cold start)", async () => {
    // The DEFAULT (real) scorer is used: no evidence + claimed confidence 0.99 is
    // HELD because the server score is structurally sub-green ([G3-R1]/[G1-F3]).
    // NEVER a fabricated green — the third AND leg holds the line.
    const run = vi.fn()
    const res = await runGatedWrite(build({ confidence: 0.99, run }))
    expect(res.httpStatus).toBe(202)
    expect(res.body).toMatchObject({ status: "held", reviewId: "log-1" })
    expect(run).not.toHaveBeenCalled()
    expect(updateLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ autoApplied: false }),
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

  it("maps an admission rejection (kill-switch / cap) to 429 without opening a tx", async () => {
    const rejecting = {
      acquire: () => {
        throw new db.AdmissionRejected("kill_switch_inactive")
      },
    } as unknown as AdmissionController
    await expect(
      runGatedWrite(build({ confidence: 0.95 }), rejecting),
    ).rejects.toBeInstanceOf(RateLimitedError)
    expect(withOrg).not.toHaveBeenCalled()
  })

  it("takes the per-(org, period) lock before an auto-applied domain write", async () => {
    const run = vi.fn().mockResolvedValue({
      eventId: "ev-2",
      designation: "FP2",
      sequenceNumber: 2,
    })
    await runGatedWrite(
      build({ confidence: 0.95, run }),
      undefined,
      greenScorer,
    )
    expect(lockPeriod).toHaveBeenCalledWith(expect.anything(), "org-1", "p-1")
    // Lock is taken before the domain mutation runs.
    expect(lockPeriod.mock.invocationCallOrder[0]).toBeLessThan(
      run.mock.invocationCallOrder[0]!,
    )
  })

  it("does NOT take the period lock for a held write (no period touched)", async () => {
    await runGatedWrite(build({ confidence: 0.5 }))
    expect(lockPeriod).not.toHaveBeenCalled()
  })

  it("HOLDS an auto-apply-confidence write when the server veto fires, EVEN with a green score [G2-B1]", async () => {
    // Veto INDEPENDENCE: inject a GREEN server score so the ONLY thing that can
    // hold the write is the veto. A claimed-0.99 booking the server vetoes still
    // holds — the veto is AND-composed, never routed through the score engine.
    const run = vi.fn()
    const res = await runGatedWrite(
      {
        ...build({ confidence: 0.99, run }),
        deriveVeto: () =>
          Promise.resolve({ held: true, signals: ["asset_vs_expense"] }),
      },
      undefined,
      greenScorer,
    )
    expect(res.httpStatus).toBe(202)
    expect(res.body).toMatchObject({ status: "held" })
    expect(run).not.toHaveBeenCalled()
    expect(lockPeriod).not.toHaveBeenCalled()
    // The combined serverGate (independent veto + honest score) is persisted.
    expect(updateLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        autoApplied: false,
        output: expect.objectContaining({
          serverGate: expect.objectContaining({
            veto: { held: true, signals: ["asset_vs_expense"] },
            score: expect.objectContaining({ isGreen: true }),
          }),
        }),
      }),
    )
  })

  it("[G2-B1] a REAL vat_mismatch veto holds the write even with a green score", async () => {
    // The exact plan scenario: a payload firing vat_mismatch cannot auto-apply
    // even when the server score is green (a fitted map would lift it). The veto
    // is independent — it is NOT routed through scoreProposal/calibration.
    const run = vi.fn()
    const res = await runGatedWrite(
      {
        ...build({ confidence: 0.99, run }),
        deriveVeto: () =>
          Promise.resolve(
            // base 1000 @ 21% should be 210; declaring 999 fires vat_mismatch.
            deriveCaptureVeto([
              {
                partials: [
                  {
                    baseAmount: "1000.00",
                    vatMode: "STANDARD",
                    vatRate: "21",
                    vatAmount: "999.00",
                  },
                ],
              },
            ]),
          ),
      },
      undefined,
      greenScorer,
    )
    expect(res.httpStatus).toBe(202)
    expect(res.body).toMatchObject({ status: "held" })
    expect(run).not.toHaveBeenCalled()
    expect(updateLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        autoApplied: false,
        output: expect.objectContaining({
          serverGate: expect.objectContaining({
            veto: { held: true, signals: ["vat_mismatch"] },
            score: expect.objectContaining({ isGreen: true }),
          }),
        }),
      }),
    )
  })

  it("auto-applies when the veto does not fire and the score is green, recording the combined serverGate", async () => {
    const run = vi.fn().mockResolvedValue({
      eventId: "ev-ok",
      designation: "FP-ok",
      sequenceNumber: 3,
    })
    const res = await runGatedWrite(
      {
        ...build({ confidence: 0.99, run }),
        deriveVeto: () => Promise.resolve({ held: false, signals: [] }),
      },
      undefined,
      greenScorer,
    )
    expect(res.httpStatus).toBe(201)
    expect(run).toHaveBeenCalledOnce()
    expect(updateLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        autoApplied: true,
        output: expect.objectContaining({
          serverGate: expect.objectContaining({
            veto: { held: false, signals: [] },
            score: expect.objectContaining({ isGreen: true }),
          }),
        }),
      }),
    )
  })

  it("HELD when the veto is clear but the server score is NOT green (score is the third AND leg)", async () => {
    // Confidence high + veto clear, but the DEFAULT fail-closed scorer holds it:
    // the score leg is real and load-bearing, not vacuous.
    const run = vi.fn()
    const res = await runGatedWrite({
      ...build({ confidence: 0.99, run }),
      deriveVeto: () => Promise.resolve({ held: false, signals: [] }),
    })
    expect(res.httpStatus).toBe(202)
    expect(res.body).toMatchObject({ status: "held" })
    expect(run).not.toHaveBeenCalled()
    // The honest score verdict is persisted (sub-green, blocked), never faked.
    expect(updateLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        autoApplied: false,
        output: expect.objectContaining({
          serverGate: expect.objectContaining({
            score: expect.objectContaining({ isGreen: false, blocked: true }),
          }),
        }),
      }),
    )
  })
})
