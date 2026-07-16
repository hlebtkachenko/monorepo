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
import { GATED_WRITE_OPERATION_IDS } from "@workspace/shared/api"
import { ValidationError } from "@workspace/shared/errors"

/**
 * Contract tests for the held-writes review surface
 * (`GET /v1/accounting/held-writes` + `POST …/held-writes/{id}/resolve`).
 *
 * Since WP1 Task 1.1 the per-op replay body lives in the SHARED
 * `executeHeldWrite` dispatcher (`@workspace/accounting`), so this controller
 * test asserts the CONTROLLER contract only: auth + author≠approver + #517
 * capability guards, the FOR-UPDATE stale/double-resolve guards, inbox_item
 * provenance minting + ctx threading, delegation to `executeHeldWrite` with the
 * right args, and the resolved `output_json` audit shape (resolution + note +
 * resolvedAt + serverGate + payloadHash forwarding). The per-op domain mapping
 * (safeParse / stripGateEnvelope / storno) is covered by the dispatcher's own
 * unit test and the real-DB `resolve-parity.test.ts` (Task 1.5).
 *
 * `withOrganization` is mocked with an in-memory RLS emulation (the callback's
 * db only ever sees rows whose organization_id equals the GUC scope);
 * `executeHeldWrite` + `updateToolCallLogOutput` are spies so the delegation and
 * audit-finalization contract are pinned without a live Postgres.
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
  // The single shared replay dispatcher (WP1 Task 1.1). The controller delegates
  // every approve to it; the per-op body is tested against it directly + a real DB.
  executeHeldWrite: vi.fn(),
  // Tier 4 provenance — minted at approve; returns the inbox_item id.
  mintInboxItem: vi
    .fn()
    .mockResolvedValue("0196f1de-0000-7000-8000-000000000f01"),
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
    output_json: "tool_call_log.output_json",
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
        let limitN: number | undefined
        const chain = {
          from: () => chain,
          where: (pred: Pred) => {
            predicate = pred
            return chain
          },
          orderBy: () => Promise.resolve(materialize()),
          // The resolve read is `.limit(1).for("update")`; the list read is
          // terminal `.orderBy(...)`. `.limit` stores the bound and returns the
          // chain so the trailing `.for("update")` (row lock) resolves the rows.
          limit: (n: number) => {
            limitN = n
            return chain
          },
          for: () => Promise.resolve(materialize(limitN)),
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
    unconfirmTemplateOnReject: vi.fn().mockResolvedValue(undefined),
    // Only used for the `select now()` resolvedAt stamp — the held row itself is
    // read via the drizzle builder above.
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
const executeHeldWriteMock = vi.mocked(accounting.executeHeldWrite)
const updateLogMock = vi.mocked(db.updateToolCallLogOutput)
const unconfirmMock = vi.mocked(db.unconfirmTemplateOnReject)

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

/** A stored asset-card payload (register-card op — NOT inbox-stamped). */
const VALID_ASSET_INPUT = {
  periodId: "0196f1de-0000-7000-8000-000000000101",
  seriesId: "0196f1de-0000-7000-8000-000000000102",
  name: "Notebook Dell Latitude",
  category: "TANGIBLE_DEPRECIABLE",
  accountNumber: "022",
  commissioningDate: "2025-03-14",
  acquisitionCost: "45000.00",
  confidence: 0.6,
  rationale: "Nová karta majetku",
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

function principalFor(
  orgId: string,
  userId: string | null = APPROVER,
  actorKind: "human" | "agent" = "human",
) {
  return {
    userId,
    organizationId: orgId,
    workspaceId: WORKSPACE,
    scopes: ["read", "write"] as const,
    actorKind,
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
    executeHeldWriteMock.mockReset()
    updateLogMock.mockClear()
    unconfirmMock.mockClear()
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

    it("[#517] DENIES an agent-actor key from listing the review queue", async () => {
      verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A, APPROVER, "agent"))
      const res = await supertest(app.getHttpServer())
        .get("/v1/accounting/held-writes")
        .set("Authorization", "Bearer affk_live_agent")
        .expect(403)
      expect(res.body.error.code).toBe("forbidden")
    })
  })

  describe("POST /v1/accounting/held-writes/:id/resolve", () => {
    it("reject marks the row resolved without any domain write (note + resolvedAt + payloadHash)", async () => {
      verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
      const res = await supertest(app.getHttpServer())
        .post(`/v1/accounting/held-writes/${HELD_A1}/resolve`)
        .set("Authorization", "Bearer affk_live_a")
        .send({ action: "reject", note: "Wrong counterparty" })
        .expect(200)

      expect(res.body).toEqual({ id: HELD_A1, resolution: "rejected" })
      expect(executeHeldWriteMock).not.toHaveBeenCalled()
      expect(updateLogMock).toHaveBeenCalledOnce()
      expect(updateLogMock).toHaveBeenCalledWith(expect.anything(), {
        toolCallLogId: HELD_A1,
        output: {
          resolution: "rejected",
          note: "Wrong counterparty",
          resolvedAt: "2026-07-03T10:00:00.000Z",
          // [S3] logRow's default output_json carries payloadHash: "hash".
          payloadHash: "hash",
        },
        approvedByUserId: APPROVER,
      })
    })

    it("approve delegates to executeHeldWrite with the APPROVER + minted inbox ctx, persists the audit shape", async () => {
      verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
      executeHeldWriteMock.mockResolvedValue({
        eventId: "0196f1de-0000-7000-8000-000000000301",
        designation: "UP2026001",
        sequenceNumber: 1,
      })

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
      expect(executeHeldWriteMock).toHaveBeenCalledOnce()
      const [, ctx, toolName, storedInput, approverUserId] =
        executeHeldWriteMock.mock.calls[0] as unknown as [
          unknown,
          { organizationId: string; workspaceId: string; inboxId: unknown },
          string,
          unknown,
          string,
        ]
      // createAccountingEvent IS inbox-stamped → the minted inbox_item id threads
      // onto the ctx so every row the replay inserts is "Created by Agent".
      expect(ctx).toEqual({
        organizationId: ORG_A,
        workspaceId: WORKSPACE,
        inboxId: "0196f1de-0000-7000-8000-000000000f01",
      })
      expect(toolName).toBe("createAccountingEvent")
      // The controller hands the STORED payload verbatim; the dispatcher validates
      // + strips it (covered by the dispatcher + parity tests).
      expect(storedInput).toEqual(VALID_EVENT_INPUT)
      expect(approverUserId).toBe(APPROVER)

      expect(updateLogMock).toHaveBeenCalledWith(expect.anything(), {
        toolCallLogId: HELD_A1,
        output: expect.objectContaining({
          resolution: "approved",
          note: "Checked the invoice",
          resolvedAt: "2026-07-03T10:00:00.000Z",
          eventId: "0196f1de-0000-7000-8000-000000000301",
          payloadHash: "hash",
        }),
        approvedByUserId: APPROVER,
      })
    })

    it("[Tier 4] a register-card op (createAsset) is NOT inbox-stamped → ctx.inboxId is null", async () => {
      verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
      executeHeldWriteMock.mockResolvedValue({
        assetId: "0196f1de-0000-7000-8000-000000000501",
        designation: "DM2026001",
        sequenceNumber: 1,
      })
      state.rows.push(
        logRow({
          id: "0196f1de-0000-7000-8000-0000000005a1",
          tool_name: "createAsset",
          input_json: { ...VALID_ASSET_INPUT },
        }),
      )

      await supertest(app.getHttpServer())
        .post(
          `/v1/accounting/held-writes/0196f1de-0000-7000-8000-0000000005a1/resolve`,
        )
        .set("Authorization", "Bearer affk_live_a")
        .send({ action: "approve" })
        .expect(200)

      expect(executeHeldWriteMock).toHaveBeenCalledOnce()
      const [, ctx, toolName] = executeHeldWriteMock.mock
        .calls[0] as unknown as [
        unknown,
        { organizationId: string; workspaceId: string; inboxId: unknown },
        string,
      ]
      expect(toolName).toBe("createAsset")
      expect(ctx).toEqual({
        organizationId: ORG_A,
        workspaceId: WORKSPACE,
        inboxId: null,
      })
    })

    it("[replay-coverage] every gated op delegates to executeHeldWrite (none is hard-coded away)", async () => {
      for (const [index, toolName] of GATED_WRITE_OPERATION_IDS.entries()) {
        verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
        executeHeldWriteMock.mockReset()
        executeHeldWriteMock.mockResolvedValue({ ok: true })
        const rowId = `0196f1de-0000-7000-8000-0000000009${String(index).padStart(2, "0")}`
        state.rows.push(logRow({ id: rowId, tool_name: toolName }))

        const res = await supertest(app.getHttpServer())
          .post(`/v1/accounting/held-writes/${rowId}/resolve`)
          .set("Authorization", "Bearer affk_live_a")
          .send({ action: "approve" })

        expect(res.status, `${toolName} must be resolvable`).toBe(200)
        expect(res.body.resolution).toBe("approved")
        expect(executeHeldWriteMock).toHaveBeenCalledOnce()
        expect(executeHeldWriteMock.mock.calls[0]?.[2]).toBe(toolName)
      }
    })

    it("surfaces a dispatcher ValidationError (stale stored payload) as 422 without persisting", async () => {
      verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
      executeHeldWriteMock.mockRejectedValue(
        new ValidationError(
          "The stored payload no longer validates against the current request schema",
        ),
      )
      const res = await supertest(app.getHttpServer())
        .post(`/v1/accounting/held-writes/${HELD_A1}/resolve`)
        .set("Authorization", "Bearer affk_live_a")
        .send({ action: "approve" })
        .expect(422)
      expect(res.body.error.code).toBe("validation_error")
      expect(updateLogMock).not.toHaveBeenCalled()
    })

    it("[G2-R1] REJECTS approve when the approver is the author (author != approver)", async () => {
      verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A, AUTHOR))
      const res = await supertest(app.getHttpServer())
        .post(`/v1/accounting/held-writes/${HELD_A1}/resolve`)
        .set("Authorization", "Bearer affk_live_author")
        .send({ action: "approve" })
        .expect(403)
      expect(res.body.error.code).toBe("forbidden")
      expect(executeHeldWriteMock).not.toHaveBeenCalled()
      expect(updateLogMock).not.toHaveBeenCalled()
    })

    it("[G2-R1] ALLOWS a DIFFERENT user to approve the same write", async () => {
      verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A, APPROVER))
      executeHeldWriteMock.mockResolvedValue({
        eventId: "0196f1de-0000-7000-8000-000000000302",
        designation: "UP2026002",
        sequenceNumber: 2,
      })
      const res = await supertest(app.getHttpServer())
        .post(`/v1/accounting/held-writes/${HELD_A1}/resolve`)
        .set("Authorization", "Bearer affk_live_reviewer")
        .send({ action: "approve" })
        .expect(200)
      expect(res.body.resolution).toBe("approved")
      expect(executeHeldWriteMock).toHaveBeenCalledOnce()
    })

    it("[G2-R1] the AUTHOR may still REJECT their own write (reject is not a bypass)", async () => {
      verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A, AUTHOR))
      const res = await supertest(app.getHttpServer())
        .post(`/v1/accounting/held-writes/${HELD_A1}/resolve`)
        .set("Authorization", "Bearer affk_live_author")
        .send({ action: "reject" })
        .expect(200)
      expect(res.body).toEqual({ id: HELD_A1, resolution: "rejected" })
      expect(executeHeldWriteMock).not.toHaveBeenCalled()
    })

    it("[#517] DENIES an agent-actor key APPROVING (even a different author's write)", async () => {
      verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A, APPROVER, "agent"))
      const res = await supertest(app.getHttpServer())
        .post(`/v1/accounting/held-writes/${HELD_A1}/resolve`)
        .set("Authorization", "Bearer affk_live_agent")
        .send({ action: "approve" })
        .expect(403)
      expect(res.body.error.code).toBe("forbidden")
      expect(executeHeldWriteMock).not.toHaveBeenCalled()
      expect(updateLogMock).not.toHaveBeenCalled()
    })

    it("[#517] DENIES an agent-actor key REJECTING (the endpoint is denied entirely)", async () => {
      verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A, APPROVER, "agent"))
      const res = await supertest(app.getHttpServer())
        .post(`/v1/accounting/held-writes/${HELD_A1}/resolve`)
        .set("Authorization", "Bearer affk_live_agent")
        .send({ action: "reject" })
        .expect(403)
      expect(res.body.error.code).toBe("forbidden")
      expect(updateLogMock).not.toHaveBeenCalled()
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
      expect(executeHeldWriteMock).not.toHaveBeenCalled()
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
      expect(executeHeldWriteMock).not.toHaveBeenCalled()
    })

    it("[WS-2] a HUMAN reject of a capture with a templateId un-confirms that template", async () => {
      const TPL = "0196f1de-0000-7000-8000-000000000abc"
      state.rows.push(
        logRow({
          id: "0196f1de-0000-7000-8000-000000000010",
          tool_name: "captureAccountingDocument",
          output_json: {
            status: "held",
            payloadHash: "hash",
            serverGate: { templateId: TPL, templateNovel: true },
          },
        }),
      )
      verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
      await supertest(app.getHttpServer())
        .post(
          "/v1/accounting/held-writes/0196f1de-0000-7000-8000-000000000010/resolve",
        )
        .set("Authorization", "Bearer affk_live_a")
        .send({ action: "reject", note: "Bad extraction" })
        .expect(200)
      expect(unconfirmMock).toHaveBeenCalledOnce()
      expect(unconfirmMock).toHaveBeenCalledWith(expect.anything(), TPL)
    })

    it("[WS-2] APPROVE never touches the template trust state (even with a templateId on the row)", async () => {
      const TPL = "0196f1de-0000-7000-8000-000000000abd"
      state.rows.push(
        logRow({
          id: "0196f1de-0000-7000-8000-000000000011",
          output_json: {
            status: "held",
            payloadHash: "hash",
            serverGate: { templateId: TPL, templateNovel: true },
          },
        }),
      )
      verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
      executeHeldWriteMock.mockResolvedValue({
        eventId: "0196f1de-0000-7000-8000-000000000401",
        designation: "UP2026099",
        sequenceNumber: 9,
      })
      await supertest(app.getHttpServer())
        .post(
          "/v1/accounting/held-writes/0196f1de-0000-7000-8000-000000000011/resolve",
        )
        .set("Authorization", "Bearer affk_live_a")
        .send({ action: "approve" })
        .expect(200)
      expect(unconfirmMock).not.toHaveBeenCalled()
    })

    it("[WS-2] reject of a write with NO templateId is a helper no-op (called with null)", async () => {
      verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
      await supertest(app.getHttpServer())
        .post(`/v1/accounting/held-writes/${HELD_A1}/resolve`)
        .set("Authorization", "Bearer affk_live_a")
        .send({ action: "reject" })
        .expect(200)
      expect(unconfirmMock).toHaveBeenCalledOnce()
      expect(unconfirmMock).toHaveBeenCalledWith(expect.anything(), null)
    })

    describe("[F1 / M3.2 / S3] serverGate.shadow + payloadHash survive resolve", () => {
      // `updateToolCallLogOutput` fully REPLACES `output_json`, so both the M3
      // calibration x-axis (serverGate.shadow) and the idempotency payloadHash
      // must be forwarded across resolve. These pin both on the resolved row.
      const SHADOW_ID_REJECT = "0196f1de-0000-7000-8000-000000000020"
      const SHADOW_ID_APPROVE = "0196f1de-0000-7000-8000-000000000021"

      const heldOutputWithShadow = {
        status: "held",
        payloadHash: "hash-shadow",
        reviewId: "unused",
        serverGate: {
          veto: { held: false, signals: [] },
          score: { cRaw: 0, cFinal: 0, isGreen: false, blocked: true },
          shadow: {
            v: 1,
            serverLane: { cRaw: 0.42 },
            claimLane: { cRaw: 0.9 },
          },
          templateId: null,
        },
      }

      it("REJECT forwards serverGate.shadow + payloadHash alongside resolution", async () => {
        state.rows.push(
          logRow({ id: SHADOW_ID_REJECT, output_json: heldOutputWithShadow }),
        )
        verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
        await supertest(app.getHttpServer())
          .post(`/v1/accounting/held-writes/${SHADOW_ID_REJECT}/resolve`)
          .set("Authorization", "Bearer affk_live_a")
          .send({ action: "reject" })
          .expect(200)

        expect(updateLogMock).toHaveBeenCalledWith(expect.anything(), {
          toolCallLogId: SHADOW_ID_REJECT,
          output: expect.objectContaining({
            resolution: "rejected",
            payloadHash: "hash-shadow",
            serverGate: expect.objectContaining({
              shadow: expect.objectContaining({
                serverLane: expect.objectContaining({ cRaw: 0.42 }),
              }),
            }),
          }),
          approvedByUserId: APPROVER,
        })
      })

      it("APPROVE forwards serverGate.shadow + payloadHash alongside resolution", async () => {
        state.rows.push(
          logRow({ id: SHADOW_ID_APPROVE, output_json: heldOutputWithShadow }),
        )
        verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
        executeHeldWriteMock.mockResolvedValue({
          eventId: "0196f1de-0000-7000-8000-000000000501",
          designation: "UP2026050",
          sequenceNumber: 5,
        })

        await supertest(app.getHttpServer())
          .post(`/v1/accounting/held-writes/${SHADOW_ID_APPROVE}/resolve`)
          .set("Authorization", "Bearer affk_live_a")
          .send({ action: "approve" })
          .expect(200)

        expect(updateLogMock).toHaveBeenCalledWith(expect.anything(), {
          toolCallLogId: SHADOW_ID_APPROVE,
          output: expect.objectContaining({
            resolution: "approved",
            payloadHash: "hash-shadow",
            serverGate: expect.objectContaining({
              shadow: expect.objectContaining({
                serverLane: expect.objectContaining({ cRaw: 0.42 }),
              }),
            }),
          }),
          approvedByUserId: APPROVER,
        })
      })

      it("a row with NO prior serverGate (pre-W1.5) resolves without fabricating one", async () => {
        const NO_SHADOW_ID = "0196f1de-0000-7000-8000-000000000022"
        state.rows.push(logRow({ id: NO_SHADOW_ID }))
        verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
        await supertest(app.getHttpServer())
          .post(`/v1/accounting/held-writes/${NO_SHADOW_ID}/resolve`)
          .set("Authorization", "Bearer affk_live_a")
          .send({ action: "reject" })
          .expect(200)

        expect(updateLogMock).toHaveBeenCalledWith(expect.anything(), {
          toolCallLogId: NO_SHADOW_ID,
          output: expect.not.objectContaining({
            serverGate: expect.anything(),
          }),
          approvedByUserId: APPROVER,
        })
      })
    })
  })
})
