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
// admission controller at load (the in-memory one unless
// ACCOUNTING_ADMISSION_SHARED=1), so the mock must expose a usable (permissive)
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
  class InMemoryAdmissionController {
    acquire(): { release: () => void } {
      return { release: () => {} }
    }
  }
  // The DB controller is only constructed when ACCOUNTING_ADMISSION_SHARED=1
  // (unset in tests); a stub keeps the singleton's static import resolvable.
  class DbAdmissionController {
    acquire(): Promise<{ release: () => void }> {
      return Promise.resolve({ release: () => {} })
    }
  }
  return {
    withOrganization: vi.fn(),
    writeToolCallLog: vi.fn(),
    updateToolCallLogOutput: vi.fn(),
    lockPeriodInTx: vi.fn(),
    executeRows: vi.fn(),
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings,
      values,
    }),
    // [I8] The confident-wrong circuit-breaker read the gate performs at run
    // entry. Default (0) = breaker closed / clean pass; overridden per-test to
    // exercise the >0 (refuse) and unreadable (refuse) fail-closed legs.
    readConfidentWrongCount: vi.fn(),
    InMemoryAdmissionController,
    DbAdmissionController,
    AdmissionRejected,
  }
})

const db = await import("@workspace/db")
const { runGatedWrite, runGatedWriteWithSeams, canonicalHash } =
  await import("./accounting-writes.gate")

const writeLog = vi.mocked(db.writeToolCallLog)
const updateLog = vi.mocked(db.updateToolCallLogOutput)
const withOrg = vi.mocked(db.withOrganization)
const lockPeriod = vi.mocked(db.lockPeriodInTx)
const readCW = vi.mocked(db.readConfidentWrongCount)
const executeRows = vi.mocked(db.executeRows)

// A permissive admission for the TEST-ONLY seam form (mirrors the mocked
// singleton's always-admit behavior). Seam tests call `runGatedWriteWithSeams`
// with an explicit admission + scorer; production code uses `runGatedWrite`.
const admitting = {
  acquire: () => ({ release: () => {} }),
} as unknown as AdmissionController

const principal = {
  userId: "user-1" as string | null,
  organizationId: "org-1",
  workspaceId: "ws-1",
  scopes: [] as readonly string[],
  actorKind: "human" as const,
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

// A scorer that HONORS the server-derived signals the gate threads in. It is
// GREEN unless the gate injected `novel_template` (a Tier-3 DEFER) — then it is a
// blocked, sub-green decision. This proves the gate actually threads the
// server-derived template-novelty signal INTO the score (not merely the AND
// result), and that the hold comes from the SERVER, not any client capSignal.
const templateAwareScorer = (
  _signals: unknown,
  serverDerivedSignals: readonly string[] = [],
): GateDecision =>
  serverDerivedSignals.includes("novel_template")
    ? {
        cRaw: 0,
        cFinal: 0,
        isGreen: false,
        needsReview: true,
        blocked: true,
        firedSignals: ["extraction_failed", "novel_template"],
        reasons: ["blocked: novel_template"],
      }
    : decision(true)

// [#554] A scorer that HONORS the OCR fail-closed signal: GREEN unless the gate
// injected `unverified_template` (a Tier-3 DEFER) — then blocked, sub-green. Proves
// the gate threads the server-derived OCR signal INTO the score, and that the hold
// comes from the SERVER, never a client input.
const ocrAwareScorer = (
  _signals: unknown,
  serverDerivedSignals: readonly string[] = [],
): GateDecision =>
  serverDerivedSignals.includes("unverified_template")
    ? {
        cRaw: 0,
        cFinal: 0,
        isGreen: false,
        needsReview: true,
        blocked: true,
        firedSignals: ["extraction_failed", "unverified_template"],
        reasons: ["blocked: unverified_template"],
      }
    : decision(true)

describe("runGatedWrite", () => {
  beforeEach(() => {
    writeLog.mockReset()
    updateLog.mockReset()
    withOrg.mockReset()
    lockPeriod.mockReset()
    readCW.mockReset()
    executeRows.mockReset()
    lockPeriod.mockResolvedValue(undefined)
    executeRows.mockResolvedValue([{ status: "OPEN" }])
    // Run the callback with a throwaway db handle, one transaction.
    withOrg.mockImplementation((_org, _user, fn) =>
      (fn as (db: unknown) => Promise<unknown>)({}),
    )
    writeLog.mockResolvedValue({ toolCallLogId: "log-1", replayed: false })
    updateLog.mockResolvedValue(undefined as never)
    // [I8] Breaker closed by default (the cold-start norm): count 0 = clean pass.
    readCW.mockResolvedValue(0)
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

  // [I8] Confident-wrong circuit breaker ---------------------------------------

  it("proceeds normally when the confident-wrong count is 0 (breaker closed)", async () => {
    // Default readCW = 0. The write runs through the gate as usual (held at
    // cold start), proving a clean 0 does NOT block: writeToolCallLog IS called.
    readCW.mockResolvedValue(0)
    const run = vi.fn()
    const res = await runGatedWrite(build({ confidence: 0.99, run }))
    expect(res.httpStatus).toBe(202)
    expect(readCW).toHaveBeenCalledOnce()
    expect(writeLog).toHaveBeenCalledOnce()
  })

  it("persists the normalized accounting-period target on the audit row", async () => {
    await runGatedWrite(build({ confidence: 0.5 }))

    expect(writeLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ periodId: "p-1" }),
    )
  })

  it("REFUSES fail-closed when the confident-wrong count is > 0 (breaker open)", async () => {
    readCW.mockResolvedValue(1)
    const run = vi.fn()
    await expect(
      runGatedWrite(build({ confidence: 0.5, run })),
    ).rejects.toBeInstanceOf(RateLimitedError)
    // Refused BEFORE any work: no audit row written, no domain fn run.
    expect(writeLog).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
  })

  it("REFUSES fail-closed when the confident-wrong count is unreadable", async () => {
    readCW.mockRejectedValue(new Error("db read failed"))
    const run = vi.fn()
    await expect(
      runGatedWrite(build({ confidence: 0.5, run })),
    ).rejects.toBeInstanceOf(RateLimitedError)
    expect(writeLog).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
  })

  it("auto-applies (201) when confidence, veto, AND the server score are all green", async () => {
    const run = vi.fn().mockResolvedValue({
      eventId: "ev-9",
      designation: "FP9",
      sequenceNumber: 9,
    })
    // The green server score is INJECTED — the real scorer is fail-closed and
    // never green at cold start (that is the fail-closed-cold-start test below).
    const res = await runGatedWriteWithSeams(
      build({ confidence: 0.95, run }),
      admitting,
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
      runGatedWriteWithSeams(
        build({ confidence: 0.95 }),
        rejecting,
        greenScorer,
      ),
    ).rejects.toBeInstanceOf(RateLimitedError)
    expect(withOrg).not.toHaveBeenCalled()
  })

  it("takes the per-(org, period) lock before an auto-applied domain write", async () => {
    const run = vi.fn().mockResolvedValue({
      eventId: "ev-2",
      designation: "FP2",
      sequenceNumber: 2,
    })
    await runGatedWriteWithSeams(
      build({ confidence: 0.95, run }),
      admitting,
      greenScorer,
    )
    expect(lockPeriod).toHaveBeenCalledWith(expect.anything(), "org-1", "p-1")
    // Lock is taken before the domain mutation runs.
    expect(lockPeriod.mock.invocationCallOrder[0]).toBeLessThan(
      run.mock.invocationCallOrder[0]!,
    )
  })

  it("takes the period lock before persisting a held proposal", async () => {
    await runGatedWrite(build({ confidence: 0.5 }))
    expect(lockPeriod).toHaveBeenCalledWith(expect.anything(), "org-1", "p-1")
    expect(lockPeriod.mock.invocationCallOrder[0]).toBeLessThan(
      writeLog.mock.invocationCallOrder[0]!,
    )
  })

  it("refuses a held proposal when close wins and the period is closed", async () => {
    executeRows.mockResolvedValue([{ status: "CLOSED" }])

    await expect(
      runGatedWrite(build({ confidence: 0.5 })),
    ).rejects.toBeInstanceOf(ConflictError)
    expect(writeLog).toHaveBeenCalledOnce()
    expect(updateLog).not.toHaveBeenCalled()
  })

  it("preserves an idempotent replay after the target period closes", async () => {
    const body = { periodId: "p-1", note: "same" }
    executeRows.mockResolvedValue([{ status: "CLOSED" }])
    writeLog.mockResolvedValue({
      toolCallLogId: "log-1",
      replayed: true,
      existingOutput: {
        payloadHash: canonicalHash(body),
        status: "held",
        reviewId: "log-1",
      },
    })

    await expect(runGatedWrite(build({ body }))).resolves.toMatchObject({
      httpStatus: 202,
      replayed: true,
    })
    expect(executeRows).not.toHaveBeenCalled()
  })

  it("[#517] stamps an agent-key write as ai_on_behalf (conversationId present)", async () => {
    // The audit actor comes from the TAMPER-PROOF key capability: an agent key
    // is always an AI actor regardless of the client-supplied (spoofable)
    // conversationId, so an agent can never be logged as 'human'.
    await runGatedWrite({
      ...build({ confidence: 0.5, conversationId: "conv-1" }),
      principal: { ...principal, actorKind: "agent" },
    })
    expect(writeLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorKind: "ai_on_behalf" }),
    )
  })

  it("[W1.2] rejects a user-bound agent key with NO conversationId as 422 (not 500), before opening a tx", async () => {
    // An `ai_on_behalf` audit row requires both userId and conversationId
    // (packages/db validateActorKind). A user-bound AGENT key that omits
    // conversationId used to stamp ai_on_behalf with a null conversationId,
    // making writeToolCallLog throw a plain Error deep in the write path (500).
    // It must surface as a clean 4xx at the boundary BEFORE the write path runs.
    await expect(
      runGatedWrite({
        ...build({ confidence: 0.5, conversationId: undefined }),
        principal: { ...principal, actorKind: "agent" },
      }),
    ).rejects.toBeInstanceOf(ValidationError)
    // The invariant is surfaced BEFORE the transaction / write log ever runs.
    expect(withOrg).not.toHaveBeenCalled()
    expect(writeLog).not.toHaveBeenCalled()
  })

  it("[W1.2] a user-bound agent key WITH a conversationId still books normally (happy path)", async () => {
    // Same agent principal, but conversationId present → the guard is a no-op
    // and the write proceeds through writeToolCallLog as ai_on_behalf.
    const res = await runGatedWrite({
      ...build({ confidence: 0.5, conversationId: "conv-1" }),
      principal: { ...principal, actorKind: "agent" },
    })
    expect(res.httpStatus).toBe(202)
    expect(writeLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorKind: "ai_on_behalf",
        conversationId: "conv-1",
      }),
    )
  })

  it("[#517] stamps a bare human-key write (no conversationId) as human", async () => {
    await runGatedWrite(build({ confidence: 0.5 }))
    expect(writeLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorKind: "human" }),
    )
  })

  it("HOLDS an auto-apply-confidence write when the server veto fires, EVEN with a green score [G2-B1]", async () => {
    // Veto INDEPENDENCE: inject a GREEN server score so the ONLY thing that can
    // hold the write is the veto. A claimed-0.99 booking the server vetoes still
    // holds — the veto is AND-composed, never routed through the score engine.
    const run = vi.fn()
    const res = await runGatedWriteWithSeams(
      {
        ...build({ confidence: 0.99, run }),
        deriveVeto: () =>
          Promise.resolve({ held: true, signals: ["asset_vs_expense"] }),
      },
      admitting,
      greenScorer,
    )
    expect(res.httpStatus).toBe(202)
    expect(res.body).toMatchObject({ status: "held" })
    expect(run).not.toHaveBeenCalled()
    expect(lockPeriod).toHaveBeenCalledWith(expect.anything(), "org-1", "p-1")
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
    const res = await runGatedWriteWithSeams(
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
      admitting,
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
    const res = await runGatedWriteWithSeams(
      {
        ...build({ confidence: 0.99, run }),
        deriveVeto: () => Promise.resolve({ held: false, signals: [] }),
      },
      admitting,
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

  // [WS-2 / B1.5 / #554] The server-DERIVED OCR-template basis leg — ONE seam
  // returning {templateNovel, ocrUnverified}. `templateNovel` (found + unconfirmed)
  // forces `novel_template`; `ocrUnverified` (OCR + no confirmed template basis)
  // forces `unverified_template`. Both are Tier-3 DEFER kinds the gate threads INTO
  // the score → HELD. Server-side (not a client capSignal), agent-scoped, add-only.
  // The scorers honor the injected signals so these prove the gate threaded them in.
  const agentPrincipal = { ...principal, actorKind: "agent" as const }
  const novelBasis = () =>
    Promise.resolve({ templateNovel: true, ocrUnverified: false })
  const confirmedBasis = () =>
    Promise.resolve({ templateNovel: false, ocrUnverified: false })
  const ocrUnverifiedBasis = () =>
    Promise.resolve({ templateNovel: false, ocrUnverified: true })
  const clearBasis = () =>
    Promise.resolve({ templateNovel: false, ocrUnverified: false })

  it("HOLDS an AGENT capture on an UNCONFIRMED template even when the score would be green (server-derived, no client signal)", async () => {
    // No `signals` envelope at all — the hold cannot come from a client capSignal.
    // The scorer is green UNLESS the gate injects `novel_template`; the veto is clear.
    const run = vi.fn()
    const res = await runGatedWriteWithSeams(
      {
        ...build({ confidence: 0.99, conversationId: "conv-1", run }),
        principal: agentPrincipal,
        templateId: "tpl-unconfirmed",
        deriveVeto: () => Promise.resolve({ held: false, signals: [] }),
        screenTemplateBasis: novelBasis,
      },
      admitting,
      templateAwareScorer,
    )
    expect(res.httpStatus).toBe(202)
    expect(res.body).toMatchObject({ status: "held" })
    expect(run).not.toHaveBeenCalled()
    // The honest score (blocked by the server-injected novel_template) is persisted,
    // and the audit records the template was novel.
    expect(updateLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        autoApplied: false,
        output: expect.objectContaining({
          serverGate: expect.objectContaining({
            templateId: "tpl-unconfirmed",
            templateNovel: true,
            score: expect.objectContaining({
              isGreen: false,
              blocked: true,
              firedSignals: expect.arrayContaining(["novel_template"]),
            }),
          }),
        }),
      }),
    )
  })

  it("does NOT get the novel_template hold when the AGENT capture references a CONFIRMED template", async () => {
    // Same green scorer + clear veto, but the template is confirmed → no
    // server-derived signal → the write auto-applies (201).
    const run = vi.fn().mockResolvedValue({
      eventId: "ev-c",
      designation: "FP-c",
      sequenceNumber: 4,
    })
    const res = await runGatedWriteWithSeams(
      {
        ...build({ confidence: 0.99, conversationId: "conv-1", run }),
        principal: agentPrincipal,
        templateId: "tpl-confirmed",
        deriveVeto: () => Promise.resolve({ held: false, signals: [] }),
        screenTemplateBasis: confirmedBasis,
      },
      admitting,
      templateAwareScorer,
    )
    expect(res.httpStatus).toBe(201)
    expect(res.body).toMatchObject({ status: "applied" })
    expect(run).toHaveBeenCalledOnce()
    expect(updateLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        autoApplied: true,
        output: expect.objectContaining({
          serverGate: expect.objectContaining({ templateNovel: false }),
        }),
      }),
    )
  })

  it("does NOT run the basis leg for a HUMAN key (the veto is agent-scoped)", async () => {
    // A human-key capture with an UNCONFIRMED template: the leg is skipped, so the
    // write auto-applies. `screenTemplateBasis` must never be invoked.
    const basis = vi.fn(novelBasis)
    const run = vi.fn().mockResolvedValue({
      eventId: "ev-h",
      designation: "FP-h",
      sequenceNumber: 5,
    })
    const res = await runGatedWriteWithSeams(
      {
        ...build({ confidence: 0.99, run }),
        principal, // human key
        templateId: "tpl-unconfirmed",
        deriveVeto: () => Promise.resolve({ held: false, signals: [] }),
        screenTemplateBasis: basis,
      },
      admitting,
      templateAwareScorer,
    )
    expect(basis).not.toHaveBeenCalled()
    expect(res.httpStatus).toBe(201)
    expect(res.body).toMatchObject({ status: "applied" })
    expect(run).toHaveBeenCalledOnce()
    expect(updateLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        output: expect.objectContaining({
          serverGate: expect.objectContaining({ templateNovel: false }),
        }),
      }),
    )
  })

  it("RUNS the basis leg for an AGENT key with NO templateId (the #554 OCR fail-closed path) and auto-applies when it returns clear", async () => {
    // Post-merge the single seam is invoked for any agent capture (the OCR
    // fail-closed leg must run even with no templateId). A `clear` result (e.g. a
    // structured capture with no basis) fires neither signal → auto-applies.
    const basis = vi.fn(clearBasis)
    const run = vi.fn().mockResolvedValue({
      eventId: "ev-n",
      designation: "FP-n",
      sequenceNumber: 6,
    })
    const res = await runGatedWriteWithSeams(
      {
        ...build({ confidence: 0.99, conversationId: "conv-1", run }),
        principal: agentPrincipal,
        templateId: null,
        deriveVeto: () => Promise.resolve({ held: false, signals: [] }),
        screenTemplateBasis: basis,
      },
      admitting,
      templateAwareScorer,
    )
    expect(basis).toHaveBeenCalledOnce()
    expect(res.httpStatus).toBe(201)
    expect(run).toHaveBeenCalledOnce()
    expect(updateLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        autoApplied: true,
        output: expect.objectContaining({
          serverGate: expect.objectContaining({
            templateNovel: false,
            ocrUnverified: false,
          }),
        }),
      }),
    )
  })

  // [#554] The OCR fail-closed leg of the same seam. An `extraction_method: "ocr"`
  // capture that OMITS (or forges) its templateId is HELD via the server-derived
  // `unverified_template` signal — closing the omitted-templateId novelty BYPASS.
  // Structured captures are unaffected. Agent-scoped; the hold has no client input.
  it("[#554] HOLDS an AGENT OCR capture with NO templateId even when the score would be green (server-derived, no client signal)", async () => {
    // No `signals` envelope: the hold cannot come from a client capSignal. The
    // scorer is green UNLESS the gate injects `unverified_template`; the veto is clear.
    const run = vi.fn()
    const res = await runGatedWriteWithSeams(
      {
        ...build({ confidence: 0.99, conversationId: "conv-1", run }),
        principal: agentPrincipal,
        templateId: null, // OMITTED — the exact bypass #554 closes
        deriveVeto: () => Promise.resolve({ held: false, signals: [] }),
        screenTemplateBasis: ocrUnverifiedBasis,
      },
      admitting,
      ocrAwareScorer,
    )
    expect(res.httpStatus).toBe(202)
    expect(res.body).toMatchObject({ status: "held" })
    expect(run).not.toHaveBeenCalled()
    // The honest score (blocked by the server-injected unverified_template) is
    // persisted, and the audit records the OCR leg fired.
    expect(updateLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        autoApplied: false,
        output: expect.objectContaining({
          serverGate: expect.objectContaining({
            ocrUnverified: true,
            score: expect.objectContaining({
              isGreen: false,
              blocked: true,
              firedSignals: expect.arrayContaining(["unverified_template"]),
            }),
          }),
        }),
      }),
    )
  })

  it("[#554] does NOT get the OCR hold for a STRUCTURED capture (seam returns clear → auto-applies)", async () => {
    const run = vi.fn().mockResolvedValue({
      eventId: "ev-s",
      designation: "FP-s",
      sequenceNumber: 7,
    })
    const res = await runGatedWriteWithSeams(
      {
        ...build({ confidence: 0.99, conversationId: "conv-1", run }),
        principal: agentPrincipal,
        templateId: null,
        deriveVeto: () => Promise.resolve({ held: false, signals: [] }),
        screenTemplateBasis: clearBasis, // structured → no hold
      },
      admitting,
      ocrAwareScorer,
    )
    expect(res.httpStatus).toBe(201)
    expect(res.body).toMatchObject({ status: "applied" })
    expect(run).toHaveBeenCalledOnce()
    expect(updateLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        autoApplied: true,
        output: expect.objectContaining({
          serverGate: expect.objectContaining({ ocrUnverified: false }),
        }),
      }),
    )
  })

  it("[#554] does NOT run the seam for a HUMAN key (agent-scoped)", async () => {
    const screen = vi.fn(ocrUnverifiedBasis)
    const run = vi.fn().mockResolvedValue({
      eventId: "ev-hu",
      designation: "FP-hu",
      sequenceNumber: 8,
    })
    const res = await runGatedWriteWithSeams(
      {
        ...build({ confidence: 0.99, run }),
        principal, // human key
        templateId: null,
        deriveVeto: () => Promise.resolve({ held: false, signals: [] }),
        screenTemplateBasis: screen,
      },
      admitting,
      ocrAwareScorer,
    )
    expect(screen).not.toHaveBeenCalled()
    expect(res.httpStatus).toBe(201)
    expect(run).toHaveBeenCalledOnce()
  })

  // [W1.5] SHADOW-SCORE instrumentation — a SECOND, PURE scoring pass persisted at
  // serverGate.shadow. Pure audit telemetry for M3: it must NEVER change the
  // enforced verdict or autoApply, it recomputes the server-derivable verify facts
  // from the payload (never trusts the client), and it carries NO verdict.
  const captureBody = (
    vatAmount: string,
    extra: Record<string, unknown> = {},
  ) => ({
    periodId: "p-1",
    issuedAt: "2025-03-14",
    lines: [
      {
        partials: [
          {
            baseAmount: "1000.00",
            vatMode: "STANDARD",
            vatRate: "21",
            vatAmount, // 210.00 is correct; 999.00 fires the derived mismatch
          },
        ],
      },
    ],
    ...extra,
  })

  it("[W1.5] persists the shadow (serverLane.cRaw + claimLane.cRaw + claimAudit) on a capture", async () => {
    const res = await runGatedWrite(
      build({ confidence: 0.99, body: captureBody("210.00") }),
    )
    // Enforced verdict is UNCHANGED (fail-closed cold start → held).
    expect(res.httpStatus).toBe(202)
    expect(updateLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        output: expect.objectContaining({
          serverGate: expect.objectContaining({
            shadow: expect.objectContaining({
              v: 1,
              serverLane: expect.objectContaining({
                cRaw: expect.any(Number),
              }),
              claimLane: expect.objectContaining({ cRaw: expect.any(Number) }),
              claimAudit: expect.objectContaining({
                vatBaseMatchesNet: { claimed: false, derived: true },
                periodConsistent: { claimed: false, derived: true },
              }),
            }),
          }),
        }),
      }),
    )
  })

  it("[W1.5] serverLane RECOMPUTES verify server-side — a client-claimed TRUE on FALSE arithmetic uses the DERIVED false", async () => {
    // Client claims vatBaseMatchesNet TRUE, but base 1000 @ 21% ≠ 999 → derived FALSE.
    // `signals` is a top-level gate opt (read as opts.signals), not a body field.
    await runGatedWrite({
      ...build({ confidence: 0.99, body: captureBody("999.00") }),
      signals: { vatBaseMatchesNet: true },
    })
    const persisted = updateLog.mock.calls[0]?.[1] as {
      output: {
        serverGate: {
          shadow: {
            serverLane: { inputs: { verify: { vatBaseMatchesNet?: boolean } } }
            claimAudit: {
              vatBaseMatchesNet: { claimed: boolean; derived: boolean }
            }
          }
        }
      }
    }
    const shadow = persisted.output.serverGate.shadow
    // claimAudit surfaces the dishonesty: claimed true, derived false.
    expect(shadow.claimAudit.vatBaseMatchesNet).toEqual({
      claimed: true,
      derived: false,
    })
    // serverLane uses the DERIVED false, not the client's TRUE claim.
    expect(shadow.serverLane.inputs.verify.vatBaseMatchesNet).toBe(false)
  })

  // The advisor NON-NEGOTIABLE: the shadow is PURE instrumentation. The enforced
  // verdict + autoApply are IDENTICAL whether the shadow is computed or not — its
  // presence changes NOTHING enforced. Proven by running the SAME inputs through a
  // green scorer (auto-applies, shadow present) and asserting the applied outcome +
  // autoApplied flag are exactly what the pre-shadow gate produced.
  it("[W1.5] autoApply is INVARIANT to the shadow — an auto-applying write still applies (201) with the shadow present", async () => {
    const run = vi.fn().mockResolvedValue({
      eventId: "ev-inv",
      designation: "FP-inv",
      sequenceNumber: 42,
    })
    const res = await runGatedWriteWithSeams(
      build({ confidence: 0.99, body: captureBody("210.00"), run }),
      admitting,
      greenScorer,
    )
    // The enforced verdict is exactly the pre-shadow one: green score + clear veto
    // + confidence → applied. The shadow did not gate it.
    expect(res.httpStatus).toBe(201)
    expect(res.body).toMatchObject({ status: "applied", eventId: "ev-inv" })
    expect(run).toHaveBeenCalledOnce()
    expect(updateLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ autoApplied: true }),
    )
    // The shadow rode along in the audit record but never touched the decision.
    const persisted = updateLog.mock.calls[0]?.[1] as {
      output: { serverGate: { shadow: { v: number } } }
    }
    expect(persisted.output.serverGate.shadow.v).toBe(1)
  })

  it("[W1.5] a HELD write also carries a shadow whose serverLane.cRaw drops the extraction_failed block (non-zero)", async () => {
    // The enforced score is structurally 0 (extraction_failed), but the shadow's
    // serverLane drops that block → a real non-zero server x for the M3 refit.
    await runGatedWrite(
      build({ confidence: 0.99, body: captureBody("210.00") }),
    )
    const persisted = updateLog.mock.calls[0]?.[1] as {
      output: {
        serverGate: {
          score: { cRaw: number }
          shadow: { serverLane: { cRaw: number } }
        }
      }
    }
    // Enforced score cRaw stays the structural 0; the shadow's serverLane is > 0.
    expect(persisted.output.serverGate.score.cRaw).toBe(0)
    expect(persisted.output.serverGate.shadow.serverLane.cRaw).toBeGreaterThan(
      0,
    )
  })
})
