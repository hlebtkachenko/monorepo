import { type INestApplication, Module, VersioningType } from "@nestjs/common"
import { APP_FILTER } from "@nestjs/core"
import { Test } from "@nestjs/testing"
import supertest from "supertest"
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

/**
 * Contract tests for the held-writes review surface
 * (`GET /v1/accounting/held-writes` + `POST …/held-writes/{id}/resolve`).
 *
 * Mirrors the organization.controller test strategy: `withOrganization` is
 * mocked with an in-memory RLS emulation (the callback's db only ever sees
 * rows whose organization_id equals the GUC scope), the domain fns
 * (`createEvent` / `captureDocument` / `post`) are spies like in the
 * accounting-writes gate tests, and `updateToolCallLogOutput` is a spy so the
 * audit finalization contract is pinned without a live Postgres.
 */

type Pred =
  | { type: "eq"; column: string; value: unknown }
  | { type: "isNull"; column: string }
  | { type: "and"; conds: Pred[] }

interface LogRow {
  id: string
  organization_id: string
  tool_name: string
  idempotency_key: string
  actor_kind: string
  user_id: string | null
  conversation_id: string | null
  input_json: Record<string, unknown>
  output_json: Record<string, unknown> | null
  confidence: string | null
  rationale: string | null
  auto_applied: boolean
  approved_by_user_id: string | null
  created_at: Date
}

const state = vi.hoisted(() => ({
  rows: [] as LogRow[],
  scopeCalls: [] as Array<{ orgId: string; userId: string | null }>,
}))

vi.mock("@workspace/auth/api-key-verifier", () => ({
  verifyApiKey: vi.fn(),
}))

vi.mock("@workspace/accounting", () => ({
  createEvent: vi.fn(),
  captureDocument: vi.fn(),
  post: vi.fn(),
}))

vi.mock("@workspace/db/schema", () => ({
  tool_call_log: {
    id: "tool_call_log.id",
    organization_id: "tool_call_log.organization_id",
    tool_name: "tool_call_log.tool_name",
    idempotency_key: "tool_call_log.idempotency_key",
    actor_kind: "tool_call_log.actor_kind",
    confidence: "tool_call_log.confidence",
    rationale: "tool_call_log.rationale",
    created_at: "tool_call_log.created_at",
    input_json: "tool_call_log.input_json",
    auto_applied: "tool_call_log.auto_applied",
    approved_by_user_id: "tool_call_log.approved_by_user_id",
    user_id: "tool_call_log.user_id",
  },
}))

vi.mock("@workspace/db", () => {
  const eq = (column: string, value: unknown): Pred => ({
    type: "eq",
    column,
    value,
  })
  const isNull = (column: string): Pred => ({ type: "isNull", column })
  const and = (...conds: Pred[]): Pred => ({ type: "and", conds })
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings,
    values,
  })

  const field = (row: LogRow, column: string): unknown =>
    row[column.split(".")[1] as keyof LogRow]

  const evalPred = (pred: Pred, row: LogRow): boolean => {
    if (pred.type === "and") return pred.conds.every((c) => evalPred(c, row))
    if (pred.type === "isNull") return field(row, pred.column) === null
    return field(row, pred.column) === pred.value
  }

  const withOrganization = async (
    orgId: string,
    userId: string | null,
    fn: (db: unknown) => Promise<unknown>,
  ) => {
    state.scopeCalls.push({ orgId, userId })
    // RLS emulation: rows outside the GUC scope do not exist for the callback.
    const visible = () => state.rows.filter((r) => r.organization_id === orgId)

    const db = {
      select(projection: Record<string, string>) {
        let predicate: Pred | null = null
        const materialize = (limit?: number) => {
          const matched = visible()
            .filter((row) => (predicate ? evalPred(predicate, row) : true))
            .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
          return (limit == null ? matched : matched.slice(0, limit)).map(
            (row) => {
              const out: Record<string, unknown> = {}
              for (const [key, marker] of Object.entries(projection)) {
                out[key] = field(row, marker)
              }
              return out
            },
          )
        }
        const chain = {
          from: () => chain,
          where: (pred: Pred) => {
            predicate = pred
            return chain
          },
          orderBy: () => Promise.resolve(materialize()),
          limit: (n: number) => Promise.resolve(materialize(n)),
        }
        return chain
      },
    }
    return fn(db)
  }

  return {
    eq,
    isNull,
    and,
    sql,
    withOrganization,
    lockPeriodInTx: vi.fn().mockResolvedValue(undefined),
    updateToolCallLogOutput: vi.fn().mockResolvedValue(undefined),
    executeRows: vi
      .fn()
      .mockResolvedValue([{ now: new Date("2026-07-03T10:00:00.000Z") }]),
  }
})

const { verifyApiKey } = await import("@workspace/auth/api-key-verifier")
const accounting = await import("@workspace/accounting")
const db = await import("@workspace/db")
const { HeldWritesController } = await import("./held-writes.controller")
const { DomainExceptionFilter } = await import("../domain-exception.filter")

const verifyApiKeyMock = vi.mocked(verifyApiKey)
const createEventMock = vi.mocked(accounting.createEvent)
const captureDocumentMock = vi.mocked(accounting.captureDocument)
const postMock = vi.mocked(accounting.post)
const updateLogMock = vi.mocked(db.updateToolCallLogOutput)

const ORG_A = "0196f1de-0000-7000-8000-00000000000a"
const ORG_B = "0196f1de-0000-7000-8000-00000000000b"
const WORKSPACE = "0196f1de-0000-7000-8000-0000000000bb"
const APPROVER = "0196f1de-0000-7000-8000-0000000000aa"
const AUTHOR = "0196f1de-0000-7000-8000-0000000000cc"

const HELD_A1 = "0196f1de-0000-7000-8000-000000000001"
const HELD_A2 = "0196f1de-0000-7000-8000-000000000002"
const APPLIED_A = "0196f1de-0000-7000-8000-000000000003"
const RESOLVED_A = "0196f1de-0000-7000-8000-000000000004"
const HELD_B = "0196f1de-0000-7000-8000-000000000005"
const UNKNOWN_ID = "0196f1de-0000-7000-8000-0000000000ff"

/** A stored payload that still validates against the current event schema. */
const VALID_EVENT_INPUT = {
  periodId: "0196f1de-0000-7000-8000-000000000101",
  seriesId: "0196f1de-0000-7000-8000-000000000102",
  description: "FP — nájem kanceláře",
  occurredAt: "2025-03-14",
  confidence: 0.6,
  rationale: "Vendor unclear",
}

function logRow(over: Partial<LogRow> & { id: string }): LogRow {
  return {
    organization_id: ORG_A,
    tool_name: "createAccountingEvent",
    idempotency_key: `key-${over.id.slice(-2)}`,
    actor_kind: "ai_on_behalf",
    user_id: AUTHOR,
    conversation_id: "0196f1de-0000-7000-8000-000000000201",
    input_json: { ...VALID_EVENT_INPUT },
    output_json: { status: "held", payloadHash: "hash" },
    confidence: "0.60",
    rationale: "Vendor unclear",
    auto_applied: false,
    approved_by_user_id: null,
    created_at: new Date("2026-07-01T08:00:00.000Z"),
    ...over,
  }
}

function principalFor(orgId: string, userId: string | null = APPROVER) {
  return {
    userId,
    organizationId: orgId,
    workspaceId: WORKSPACE,
    scopes: ["read", "write"] as const,
  }
}

@Module({
  controllers: [HeldWritesController],
  providers: [{ provide: APP_FILTER, useClass: DomainExceptionFilter }],
})
class TestModule {}

describe("HeldWritesController", () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestModule],
    }).compile()
    app = moduleRef.createNestApplication()
    app.enableVersioning({ type: VersioningType.URI, prefix: "v" })
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    verifyApiKeyMock.mockReset()
    createEventMock.mockReset()
    captureDocumentMock.mockReset()
    postMock.mockReset()
    updateLogMock.mockClear()
    state.scopeCalls = []
    state.rows = [
      logRow({ id: HELD_A2, created_at: new Date("2026-07-02T08:00:00.000Z") }),
      logRow({ id: HELD_A1 }),
      logRow({ id: APPLIED_A, auto_applied: true }),
      logRow({ id: RESOLVED_A, approved_by_user_id: APPROVER }),
      logRow({ id: HELD_B, organization_id: ORG_B }),
    ]
  })

  describe("GET /v1/accounting/held-writes", () => {
    it("returns only the caller's org's HELD rows, oldest first, with the stored input", async () => {
      verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
      const res = await supertest(app.getHttpServer())
        .get("/v1/accounting/held-writes")
        .set("Authorization", "Bearer affk_live_a")
        .expect(200)

      expect(res.body.heldWrites.map((w: { id: string }) => w.id)).toEqual([
        HELD_A1,
        HELD_A2,
      ])
      expect(JSON.stringify(res.body)).not.toContain(HELD_B)
      expect(JSON.stringify(res.body)).not.toContain(APPLIED_A)
      expect(JSON.stringify(res.body)).not.toContain(RESOLVED_A)
      expect(res.body.heldWrites[0]).toMatchObject({
        id: HELD_A1,
        toolName: "createAccountingEvent",
        idempotencyKey: "key-01",
        actorKind: "ai_on_behalf",
        confidence: "0.60",
        rationale: "Vendor unclear",
        createdAt: "2026-07-01T08:00:00.000Z",
        input: VALID_EVENT_INPUT,
      })
      // The tenancy scope comes from the principal, never request input.
      expect(state.scopeCalls).toEqual([{ orgId: ORG_A, userId: APPROVER }])
    })

    it("401s without an API key", async () => {
      await supertest(app.getHttpServer())
        .get("/v1/accounting/held-writes")
        .expect(401)
      expect(verifyApiKeyMock).not.toHaveBeenCalled()
    })
  })

  describe("POST /v1/accounting/held-writes/:id/resolve", () => {
    it("reject marks the row resolved without any domain write", async () => {
      verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
      const res = await supertest(app.getHttpServer())
        .post(`/v1/accounting/held-writes/${HELD_A1}/resolve`)
        .set("Authorization", "Bearer affk_live_a")
        .send({ action: "reject", note: "Wrong counterparty" })
        .expect(200)

      expect(res.body).toEqual({ id: HELD_A1, resolution: "rejected" })
      expect(createEventMock).not.toHaveBeenCalled()
      expect(captureDocumentMock).not.toHaveBeenCalled()
      expect(postMock).not.toHaveBeenCalled()
      expect(updateLogMock).toHaveBeenCalledOnce()
      expect(updateLogMock).toHaveBeenCalledWith(expect.anything(), {
        toolCallLogId: HELD_A1,
        output: {
          resolution: "rejected",
          note: "Wrong counterparty",
          resolvedAt: "2026-07-03T10:00:00.000Z",
        },
        approvedByUserId: APPROVER,
      })
    })

    it("approve executes the stored payload with the APPROVER as responsible user", async () => {
      verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
      createEventMock.mockResolvedValue({
        eventId: "0196f1de-0000-7000-8000-000000000301",
        designation: "UP2026001",
        sequenceNumber: 1,
      } as never)

      const res = await supertest(app.getHttpServer())
        .post(`/v1/accounting/held-writes/${HELD_A1}/resolve`)
        .set("Authorization", "Bearer affk_live_a")
        .send({ action: "approve", note: "Checked the invoice" })
        .expect(200)

      expect(res.body).toEqual({
        id: HELD_A1,
        resolution: "approved",
        result: {
          eventId: "0196f1de-0000-7000-8000-000000000301",
          designation: "UP2026001",
          sequenceNumber: 1,
        },
      })
      expect(createEventMock).toHaveBeenCalledOnce()
      const [, ctx, input] = createEventMock.mock.calls[0] as unknown as [
        unknown,
        { organizationId: string; workspaceId: string },
        Record<string, unknown>,
      ]
      expect(ctx).toEqual({ organizationId: ORG_A, workspaceId: WORKSPACE })
      expect(input).toMatchObject({
        periodId: VALID_EVENT_INPUT.periodId,
        seriesId: VALID_EVENT_INPUT.seriesId,
        description: VALID_EVENT_INPUT.description,
        responsibleUserId: APPROVER,
      })
      // The gate envelope must NOT leak into the domain input.
      expect(input).not.toHaveProperty("confidence")
      expect(input).not.toHaveProperty("rationale")
      expect(updateLogMock).toHaveBeenCalledWith(expect.anything(), {
        toolCallLogId: HELD_A1,
        output: expect.objectContaining({
          resolution: "approved",
          note: "Checked the invoice",
          eventId: "0196f1de-0000-7000-8000-000000000301",
        }),
        approvedByUserId: APPROVER,
      })
    })

    it("[G2-R1] REJECTS approve when the approver is the author (author != approver)", async () => {
      // The Brain's own user-bound key approving its OWN queued write is denied.
      verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A, AUTHOR))
      const res = await supertest(app.getHttpServer())
        .post(`/v1/accounting/held-writes/${HELD_A1}/resolve`)
        .set("Authorization", "Bearer affk_live_author")
        .send({ action: "approve" })
        .expect(403)
      expect(res.body.error.code).toBe("forbidden")
      expect(createEventMock).not.toHaveBeenCalled()
      expect(updateLogMock).not.toHaveBeenCalled()
    })

    it("[G2-R1] ALLOWS a DIFFERENT user to approve the same write", async () => {
      // APPROVER != AUTHOR — the review passes.
      verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A, APPROVER))
      createEventMock.mockResolvedValue({
        eventId: "0196f1de-0000-7000-8000-000000000302",
        designation: "UP2026002",
        sequenceNumber: 2,
      } as never)
      const res = await supertest(app.getHttpServer())
        .post(`/v1/accounting/held-writes/${HELD_A1}/resolve`)
        .set("Authorization", "Bearer affk_live_reviewer")
        .send({ action: "approve" })
        .expect(200)
      expect(res.body.resolution).toBe("approved")
      expect(createEventMock).toHaveBeenCalledOnce()
    })

    it("[G2-R1] the AUTHOR may still REJECT their own write (reject is not a bypass)", async () => {
      verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A, AUTHOR))
      const res = await supertest(app.getHttpServer())
        .post(`/v1/accounting/held-writes/${HELD_A1}/resolve`)
        .set("Authorization", "Bearer affk_live_author")
        .send({ action: "reject" })
        .expect(200)
      expect(res.body).toEqual({ id: HELD_A1, resolution: "rejected" })
      expect(createEventMock).not.toHaveBeenCalled()
    })

    it("[WP-D] approves a signals-carrying payload WITHOUT leaking signals into the domain input", async () => {
      // A held payload that carries the [WP-D] evidence envelope must approve with
      // `signals` STRIPPED (like confidence/rationale) — it is not domain data.
      state.rows.push(
        logRow({
          id: "0196f1de-0000-7000-8000-000000000007",
          input_json: {
            ...VALID_EVENT_INPUT,
            signals: { kbRule: "high_active", capSignals: ["novel_ico"] },
          },
        }),
      )
      verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
      createEventMock.mockResolvedValue({
        eventId: "0196f1de-0000-7000-8000-000000000303",
        designation: "UP2026003",
        sequenceNumber: 3,
      } as never)
      await supertest(app.getHttpServer())
        .post(
          "/v1/accounting/held-writes/0196f1de-0000-7000-8000-000000000007/resolve",
        )
        .set("Authorization", "Bearer affk_live_a")
        .send({ action: "approve" })
        .expect(200)
      expect(createEventMock).toHaveBeenCalledOnce()
      const [, , input] = createEventMock.mock.calls[0] as unknown as [
        unknown,
        unknown,
        Record<string, unknown>,
      ]
      expect(input).not.toHaveProperty("signals")
      expect(input).not.toHaveProperty("confidence")
    })

    it("[WP-D] approves a PRE-MIGRATION payload with NO signals (additive-optional, no 422)", async () => {
      // VALID_EVENT_INPUT has no `signals` key. It must still re-validate against
      // the CURRENT schema and apply — proving the new field is truly optional and
      // does not brick pending held writes as 422.
      verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
      createEventMock.mockResolvedValue({
        eventId: "0196f1de-0000-7000-8000-000000000304",
        designation: "UP2026004",
        sequenceNumber: 4,
      } as never)
      const res = await supertest(app.getHttpServer())
        .post(`/v1/accounting/held-writes/${HELD_A1}/resolve`)
        .set("Authorization", "Bearer affk_live_a")
        .send({ action: "approve" })
        .expect(200)
      expect(res.body.resolution).toBe("approved")
      expect(createEventMock).toHaveBeenCalledOnce()
    })

    it("404s on an unknown id", async () => {
      verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
      const res = await supertest(app.getHttpServer())
        .post(`/v1/accounting/held-writes/${UNKNOWN_ID}/resolve`)
        .set("Authorization", "Bearer affk_live_a")
        .send({ action: "approve" })
        .expect(404)
      expect(res.body.error.code).toBe("not_found")
      expect(updateLogMock).not.toHaveBeenCalled()
    })

    it("404s on another org's held row (RLS-invisible, never a 409 leak)", async () => {
      verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
      const res = await supertest(app.getHttpServer())
        .post(`/v1/accounting/held-writes/${HELD_B}/resolve`)
        .set("Authorization", "Bearer affk_live_a")
        .send({ action: "reject" })
        .expect(404)
      expect(res.body.error.code).toBe("not_found")
    })

    it("409s on an already-resolved row (double resolve)", async () => {
      verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
      const res = await supertest(app.getHttpServer())
        .post(`/v1/accounting/held-writes/${RESOLVED_A}/resolve`)
        .set("Authorization", "Bearer affk_live_a")
        .send({ action: "approve" })
        .expect(409)
      expect(res.body.error.code).toBe("conflict")
      expect(createEventMock).not.toHaveBeenCalled()
      expect(updateLogMock).not.toHaveBeenCalled()
    })

    it("409s on an auto-applied row", async () => {
      verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
      const res = await supertest(app.getHttpServer())
        .post(`/v1/accounting/held-writes/${APPLIED_A}/resolve`)
        .set("Authorization", "Bearer affk_live_a")
        .send({ action: "reject" })
        .expect(409)
      expect(res.body.error.code).toBe("conflict")
    })

    it("403s when the API key has no bound user", async () => {
      verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A, null))
      const res = await supertest(app.getHttpServer())
        .post(`/v1/accounting/held-writes/${HELD_A1}/resolve`)
        .set("Authorization", "Bearer affk_live_service")
        .send({ action: "approve" })
        .expect(403)
      expect(res.body.error.code).toBe("forbidden")
      expect(createEventMock).not.toHaveBeenCalled()
    })

    it("422s a stale stored payload instead of crashing the domain", async () => {
      const staleInput = { ...VALID_EVENT_INPUT } as Record<string, unknown>
      delete staleInput["rationale"]
      state.rows.push(
        logRow({
          id: "0196f1de-0000-7000-8000-000000000006",
          input_json: staleInput,
        }),
      )
      verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
      const res = await supertest(app.getHttpServer())
        .post(
          "/v1/accounting/held-writes/0196f1de-0000-7000-8000-000000000006/resolve",
        )
        .set("Authorization", "Bearer affk_live_a")
        .send({ action: "approve" })
        .expect(422)
      expect(res.body.error.code).toBe("validation_error")
      expect(createEventMock).not.toHaveBeenCalled()
      expect(updateLogMock).not.toHaveBeenCalled()
    })
  })
})
