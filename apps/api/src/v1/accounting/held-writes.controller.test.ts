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
  // The capture-approve path now calls the shared capture-then-book unit (parity
  // with the web approvals path); it composes captureDocument + bookDocument, so
  // we spy on it directly and let its return shape drive the response.
  captureAndBookIfInvoice: vi.fn(),
  post: vi.fn(),
  // The API resolve path replays postings via postWithObligation (aliased
  // postPosting), NOT the bare post — mock the one the controller actually calls.
  postWithObligation: vi.fn(),
  // Tier 3 register-card creators (asset / depreciation plan / inventory count).
  createAsset: vi.fn(),
  createDepreciationPlan: vi.fn(),
  createInventoryCount: vi.fn(),
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
          // terminal `.orderBy(...)`. `.limit` now stores the bound and returns the
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
    // [WS-2] Shared trust-state reset the reject branch calls. Spied so the tests
    // assert it fires with the templateId read from output_json.serverGate (and
    // NOT on approve / absent-template).
    unconfirmTemplateOnReject: vi.fn().mockResolvedValue(undefined),
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
const captureAndBookMock = vi.mocked(accounting.captureAndBookIfInvoice)
const postMock = vi.mocked(accounting.post)
const postWithObligationMock = vi.mocked(accounting.postWithObligation)
const createAssetMock = vi.mocked(accounting.createAsset)
const createDepreciationPlanMock = vi.mocked(accounting.createDepreciationPlan)
const createInventoryCountMock = vi.mocked(accounting.createInventoryCount)
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

/** A stored capture payload that still validates against the current schema. */
const VALID_CAPTURE_INPUT = {
  periodId: "0196f1de-0000-7000-8000-000000000101",
  seriesId: "0196f1de-0000-7000-8000-000000000102",
  type: "RECEIVED_INVOICE",
  issuedAt: "2025-03-14",
  lines: [
    {
      eventId: "0196f1de-0000-7000-8000-000000000401",
      partials: [
        { baseAmount: "1000.00", vatMode: "STANDARD", currencyCode: "CZK" },
      ],
    },
  ],
  confidence: 0.6,
  rationale: "Vendor unclear",
}

/** A stored asset-card payload that still validates against the current schema. */
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

/** Stored payloads (one per gated op) that still validate — for the replay-coverage test. */
const VALID_POSTING_INPUT = {
  kind: "double",
  entry: {
    periodId: "0196f1de-0000-7000-8000-000000000101",
    summaryRecordId: "0196f1de-0000-7000-8000-000000000701",
    accountingEventId: "0196f1de-0000-7000-8000-000000000401",
    postingDate: "2025-03-14",
    lines: [
      {
        accountId: "0196f1de-0000-7000-8000-000000000801",
        side: "DEBIT",
        amount: "1000.00",
      },
      {
        accountId: "0196f1de-0000-7000-8000-000000000802",
        side: "CREDIT",
        amount: "1000.00",
      },
    ],
  },
  confidence: 0.6,
  rationale: "Ruční zaúčtování",
}

const VALID_DEPRECIATION_PLAN_INPUT = {
  periodId: "0196f1de-0000-7000-8000-000000000101",
  assetId: "0196f1de-0000-7000-8000-000000000501",
  method: "STRAIGHT_LINE",
  startDate: "2025-03-14",
  monthlyAmount: "1250.00",
  expenseAccountNumber: "551",
  accumulatedAccountNumber: "082",
  confidence: 0.6,
  rationale: "Odpisový plán",
}

const VALID_INVENTORY_COUNT_INPUT = {
  periodId: "0196f1de-0000-7000-8000-000000000101",
  seriesId: "0196f1de-0000-7000-8000-000000000102",
  countDate: "2025-12-31",
  confidence: 0.6,
  rationale: "Roční inventura",
}

/**
 * The stored payload + domain-mock stub for every gated op — the replay-coverage
 * test drives each through the resolve switch. Adding a gated op to
 * GATED_WRITE_OPERATION_IDS without adding a case here fails the exhaustiveness
 * assertion; a missing replay branch then surfaces as the switch default (a
 * permanently un-approvable, stuck-held row).
 */
type ReplayFixture = {
  input: Record<string, unknown>
  stub: () => void
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
    createEventMock.mockReset()
    captureAndBookMock.mockReset()
    postMock.mockReset()
    postWithObligationMock.mockReset()
    createAssetMock.mockReset()
    createDepreciationPlanMock.mockReset()
    createInventoryCountMock.mockReset()
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
      // The queue exposes other pending held payloads (an exfiltration surface);
      // the client sandbox denies list_accounting_held_writes and the server
      // backstops it.
      verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A, APPROVER, "agent"))
      const res = await supertest(app.getHttpServer())
        .get("/v1/accounting/held-writes")
        .set("Authorization", "Bearer affk_live_agent")
        .expect(403)
      expect(res.body.error.code).toBe("forbidden")
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
      expect(captureAndBookMock).not.toHaveBeenCalled()
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
      expect(ctx).toEqual({
        organizationId: ORG_A,
        workspaceId: WORKSPACE,
        inboxId: "0196f1de-0000-7000-8000-000000000f01",
      })
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

    it("[Tier 3] approve replays a held createAsset — periodId + gate envelope stripped, APPROVER responsible", async () => {
      verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
      createAssetMock.mockResolvedValue({
        id: "0196f1de-0000-7000-8000-000000000501",
        designation: "DM2026001",
        sequenceNumber: 1,
      } as never)
      state.rows.push(
        logRow({
          id: "0196f1de-0000-7000-8000-0000000005a1",
          tool_name: "createAsset",
          input_json: { ...VALID_ASSET_INPUT },
        }),
      )

      const res = await supertest(app.getHttpServer())
        .post(
          `/v1/accounting/held-writes/0196f1de-0000-7000-8000-0000000005a1/resolve`,
        )
        .set("Authorization", "Bearer affk_live_a")
        .send({ action: "approve" })
        .expect(200)

      expect(res.body.result).toEqual({
        assetId: "0196f1de-0000-7000-8000-000000000501",
        designation: "DM2026001",
        sequenceNumber: 1,
      })
      expect(createAssetMock).toHaveBeenCalledOnce()
      const [, ctx, input] = createAssetMock.mock.calls[0] as unknown as [
        unknown,
        { organizationId: string; workspaceId: string },
        Record<string, unknown>,
      ]
      expect(ctx).toEqual({
        organizationId: ORG_A,
        workspaceId: WORKSPACE,
        inboxId: "0196f1de-0000-7000-8000-000000000f01",
      })
      expect(input).toMatchObject({
        name: VALID_ASSET_INPUT.name,
        category: VALID_ASSET_INPUT.category,
        accountNumber: VALID_ASSET_INPUT.accountNumber,
        acquisitionCost: VALID_ASSET_INPUT.acquisitionCost,
        responsibleUserId: APPROVER,
      })
      // periodId binds the proposal to the period for the lock — it must NOT
      // reach the org-scoped card insert.
      expect(input).not.toHaveProperty("periodId")
      // The gate envelope must NOT leak into the domain input.
      expect(input).not.toHaveProperty("confidence")
      expect(input).not.toHaveProperty("rationale")
    })

    it("[replay-coverage] every gated op resolves through a branch — none hits the unknown-operation default", async () => {
      const fixtures: Record<string, ReplayFixture> = {
        createAccountingEvent: {
          input: VALID_EVENT_INPUT,
          stub: () =>
            createEventMock.mockResolvedValue({
              eventId: "0196f1de-0000-7000-8000-000000000301",
              designation: "UP2026001",
              sequenceNumber: 1,
            } as never),
        },
        captureAccountingDocument: {
          input: VALID_CAPTURE_INPUT,
          stub: () =>
            captureAndBookMock.mockResolvedValue({
              doc: {
                summaryRecordId: "0196f1de-0000-7000-8000-000000000702",
                designation: "FP2026001",
                sequenceNumber: 1,
                lines: [],
              },
              postingIds: [],
            } as never),
        },
        createAccountingPosting: {
          input: VALID_POSTING_INPUT,
          stub: () =>
            postWithObligationMock.mockResolvedValue({
              postingId: "0196f1de-0000-7000-8000-000000000901",
              lineIds: [],
              openItemId: null,
            } as never),
        },
        createAsset: {
          input: VALID_ASSET_INPUT,
          stub: () =>
            createAssetMock.mockResolvedValue({
              id: "0196f1de-0000-7000-8000-000000000501",
              designation: "DM2026001",
              sequenceNumber: 1,
            } as never),
        },
        createDepreciationPlan: {
          input: VALID_DEPRECIATION_PLAN_INPUT,
          stub: () =>
            createDepreciationPlanMock.mockResolvedValue(
              "0196f1de-0000-7000-8000-000000000601" as never,
            ),
        },
        createInventoryCount: {
          input: VALID_INVENTORY_COUNT_INPUT,
          stub: () =>
            createInventoryCountMock.mockResolvedValue({
              id: "0196f1de-0000-7000-8000-000000000651",
              designation: "IS2026001",
              sequenceNumber: 1,
            } as never),
        },
      }

      // Exhaustiveness: the canonical gated-op list and the fixture map agree, so
      // a new op can't be added without a replay assertion.
      expect(Object.keys(fixtures).sort()).toEqual(
        [...GATED_WRITE_OPERATION_IDS].sort(),
      )

      for (const [index, toolName] of GATED_WRITE_OPERATION_IDS.entries()) {
        verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
        fixtures[toolName]!.stub()
        const rowId = `0196f1de-0000-7000-8000-0000000009${String(index).padStart(2, "0")}`
        state.rows.push(
          logRow({
            id: rowId,
            tool_name: toolName,
            input_json: { ...fixtures[toolName]!.input },
          }),
        )

        const res = await supertest(app.getHttpServer())
          .post(`/v1/accounting/held-writes/${rowId}/resolve`)
          .set("Authorization", "Bearer affk_live_a")
          .send({ action: "approve" })

        // A missing replay branch throws the switch default → 422; a covered op
        // returns 200 with a domain result.
        expect(res.status, `${toolName} must be resolvable`).toBe(200)
        expect(res.body.resolution).toBe("approved")
        expect(res.body.result).toBeDefined()
      }
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

    it("[#517] DENIES an agent-actor key APPROVING (even a different author's write)", async () => {
      // The durable server-side key capability: an `agent` key can propose gated
      // writes but can NEVER resolve one — independent of, and stricter than, the
      // author!=approver rider (here the agent is NOT the author, yet is denied).
      verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A, APPROVER, "agent"))
      const res = await supertest(app.getHttpServer())
        .post(`/v1/accounting/held-writes/${HELD_A1}/resolve`)
        .set("Authorization", "Bearer affk_live_agent")
        .send({ action: "approve" })
        .expect(403)
      expect(res.body.error.code).toBe("forbidden")
      expect(createEventMock).not.toHaveBeenCalled()
      expect(updateLogMock).not.toHaveBeenCalled()
    })

    it("[#517] DENIES an agent-actor key REJECTING (the endpoint is denied entirely)", async () => {
      // Deny is total: an agent cannot even close a review by rejecting it — a
      // human must resolve every held write.
      verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A, APPROVER, "agent"))
      const res = await supertest(app.getHttpServer())
        .post(`/v1/accounting/held-writes/${HELD_A1}/resolve`)
        .set("Authorization", "Bearer affk_live_agent")
        .send({ action: "reject" })
        .expect(403)
      expect(res.body.error.code).toBe("forbidden")
      expect(updateLogMock).not.toHaveBeenCalled()
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

    it("[#554] approves a stored capture WITHOUT leaking templateId or extractionMethod into the domain input", async () => {
      // A held capture whose stored payload carries the gate-only templateId +
      // extractionMethod must approve with BOTH stripped (symmetric with the API
      // capture controller and the web replay path) — neither is domain data.
      state.rows.push(
        logRow({
          id: "0196f1de-0000-7000-8000-000000000020",
          tool_name: "captureAccountingDocument",
          input_json: {
            ...VALID_CAPTURE_INPUT,
            templateId: "0196f1de-0000-7000-8000-0000000000e1",
            extractionMethod: "ocr",
          },
        }),
      )
      verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
      // VALID_CAPTURE_INPUT is a RECEIVED_INVOICE, so the shared unit books it and
      // returns postingIds — the API approve now lands the posting (parity with the
      // web approvals path) instead of an orphaned capture.
      captureAndBookMock.mockResolvedValue({
        doc: {
          summaryRecordId: "0196f1de-0000-7000-8000-000000000501",
          designation: "FP2026001",
          sequenceNumber: 1,
          lines: [],
        },
        postingIds: ["0196f1de-0000-7000-8000-000000000601"],
      } as never)
      const res = await supertest(app.getHttpServer())
        .post(
          "/v1/accounting/held-writes/0196f1de-0000-7000-8000-000000000020/resolve",
        )
        .set("Authorization", "Bearer affk_live_a")
        .send({ action: "approve" })
        .expect(200)
      // Parity: the booked posting id is surfaced on the resolve result.
      expect(res.body.result.postingIds).toEqual([
        "0196f1de-0000-7000-8000-000000000601",
      ])
      expect(captureAndBookMock).toHaveBeenCalledOnce()
      // 4th arg is the APPROVER (responsibleUserId), not the author.
      const [, , input, responsibleUserId] = captureAndBookMock.mock
        .calls[0] as unknown as [
        unknown,
        unknown,
        Record<string, unknown>,
        string,
      ]
      expect(responsibleUserId).toBe(APPROVER)
      expect(input).not.toHaveProperty("templateId")
      expect(input).not.toHaveProperty("extractionMethod")
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

    it("[WS-2] a HUMAN reject of a capture with a templateId un-confirms that template", async () => {
      // The templateId lives in the gate's audit `output_json.serverGate.templateId`
      // (server-side, never client input). A reject must reset the template's trust
      // state via the shared helper — the same reset the web approvals path uses.
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
      // The controller reads serverGate.templateId ONLY in the reject branch. A
      // schema-valid event payload whose audit row still carries a templateId
      // proves approve resolves without calling the trust-state reset.
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
      createEventMock.mockResolvedValue({
        eventId: "0196f1de-0000-7000-8000-000000000401",
        designation: "UP2026099",
        sequenceNumber: 9,
      } as never)
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
      // A structured-export write carries no serverGate.templateId → the helper is
      // still invoked but with null, and it short-circuits (no-op) internally.
      verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
      await supertest(app.getHttpServer())
        .post(`/v1/accounting/held-writes/${HELD_A1}/resolve`)
        .set("Authorization", "Bearer affk_live_a")
        .send({ action: "reject" })
        .expect(200)
      expect(unconfirmMock).toHaveBeenCalledOnce()
      expect(unconfirmMock).toHaveBeenCalledWith(expect.anything(), null)
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

    describe("[F1 / M3.2] serverGate.shadow survives resolve (the calibration data prerequisite)", () => {
      // `updateToolCallLogOutput` fully REPLACES `output_json`, so without the
      // fix a resolved row would have `resolution` but NOT `serverGate.shadow`
      // — the M3 calibration pipeline (`ingestReviewedRunLog`, #646) needs BOTH
      // on the SAME row to yield a real fit sample. These pin that a resolved
      // row now carries both.
      const SHADOW_ID_REJECT = "0196f1de-0000-7000-8000-000000000020"
      const SHADOW_ID_APPROVE = "0196f1de-0000-7000-8000-000000000021"

      const heldOutputWithShadow = {
        status: "held",
        payloadHash: "hash",
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

      it("REJECT forwards serverGate.shadow alongside resolution", async () => {
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
            serverGate: expect.objectContaining({
              shadow: expect.objectContaining({
                serverLane: expect.objectContaining({ cRaw: 0.42 }),
              }),
            }),
          }),
          approvedByUserId: APPROVER,
        })
      })

      it("APPROVE forwards serverGate.shadow alongside resolution", async () => {
        state.rows.push(
          logRow({ id: SHADOW_ID_APPROVE, output_json: heldOutputWithShadow }),
        )
        verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
        createEventMock.mockResolvedValue({
          eventId: "0196f1de-0000-7000-8000-000000000501",
          designation: "UP2026050",
          sequenceNumber: 5,
        } as never)

        await supertest(app.getHttpServer())
          .post(`/v1/accounting/held-writes/${SHADOW_ID_APPROVE}/resolve`)
          .set("Authorization", "Bearer affk_live_a")
          .send({ action: "approve" })
          .expect(200)

        expect(updateLogMock).toHaveBeenCalledWith(expect.anything(), {
          toolCallLogId: SHADOW_ID_APPROVE,
          output: expect.objectContaining({
            resolution: "approved",
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
        // logRow()'s default output_json ({status:"held", payloadHash:"hash"})
        // carries no serverGate key at all. The fix must not invent one — the
        // EXACT-shape assertion in "reject marks the row resolved without any
        // domain write" (above) already pins this (no serverGate key appears),
        // this test names the invariant explicitly against a fresh row.
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
