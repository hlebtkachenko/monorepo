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
 * Contract tests for the booking-templates surface (M2.1)
 * (`GET|POST /v1/booking-templates`, `POST …/{id}/confirm`, `POST …/match`).
 *
 * Mirrors the OCR-templates controller test strategy exactly: `withWorkspace`
 * is mocked with an in-memory RLS emulation (the callback's db only ever sees
 * rows whose workspace_id equals the GUC scope), so cross-workspace isolation
 * and the human-confirm trust gate are exercised without a live Postgres.
 *
 * The load-bearing assertion for the §I9 amendment lives in the "match"
 * describe block: a DRAFT (unconfirmed) template is NEVER returned by match,
 * only a CONFIRMED one — proving the trust gate holds at the API boundary,
 * not just in the pure `matchBookingTemplate` unit tests.
 */

type Pred =
  | { type: "eq"; column: string; value: unknown }
  | { type: "and"; conds: Pred[] }

interface TemplateRow {
  id: string
  workspace_id: string
  counterparty_key: string
  direction: string
  supply_kind: string
  jurisdiction: string
  confirmed_decision: Record<string, unknown>
  human_confirmed_at: Date | null
  match_count: number
  held_count: number
  last_reject_at: Date | null
  version: number
  learned_at: Date
  provenance: Record<string, unknown> | null
  created_at: Date
  updated_at: Date
}

const state = vi.hoisted(() => ({
  rows: [] as TemplateRow[],
  scopeCalls: [] as Array<{ workspaceId: string; userId: string }>,
  nextId: 0,
}))

vi.mock("@workspace/auth/api-key-verifier", () => ({
  verifyApiKey: vi.fn(),
}))

vi.mock("@workspace/db/schema", () => ({
  booking_template: {
    id: "booking_template.id",
    workspace_id: "booking_template.workspace_id",
    counterparty_key: "booking_template.counterparty_key",
    direction: "booking_template.direction",
    supply_kind: "booking_template.supply_kind",
    jurisdiction: "booking_template.jurisdiction",
    confirmed_decision: "booking_template.confirmed_decision",
    human_confirmed_at: "booking_template.human_confirmed_at",
    match_count: "booking_template.match_count",
    held_count: "booking_template.held_count",
    last_reject_at: "booking_template.last_reject_at",
    version: "booking_template.version",
    learned_at: "booking_template.learned_at",
    provenance: "booking_template.provenance",
    created_at: "booking_template.created_at",
    updated_at: "booking_template.updated_at",
  },
}))

vi.mock("@workspace/db", () => {
  const eq = (column: string, value: unknown): Pred => ({
    type: "eq",
    column,
    value,
  })
  const and = (...conds: Array<Pred | undefined>): Pred => ({
    type: "and",
    conds: conds.filter((c): c is Pred => c !== undefined),
  })
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => ({
    __sql: strings.join("?"),
    values,
  })

  const col = (row: TemplateRow, column: string): unknown =>
    row[column.split(".")[1] as keyof TemplateRow]

  const evalPred = (pred: Pred | undefined, row: TemplateRow): boolean => {
    if (!pred) return true
    if (pred.type === "and") return pred.conds.every((c) => evalPred(c, row))
    return col(row, pred.column) === pred.value
  }

  const project = (row: TemplateRow, projection: Record<string, string>) => {
    const out: Record<string, unknown> = {}
    for (const [key, marker] of Object.entries(projection)) {
      out[key] = col(row, marker)
    }
    return out
  }

  const applyPatch = (row: TemplateRow, patch: Record<string, unknown>) => {
    const mutable = row as unknown as Record<string, unknown>
    for (const [key, value] of Object.entries(patch)) {
      if (value && typeof value === "object" && "__sql" in value) {
        const marker = value as { __sql: string }
        if (marker.__sql.includes("now()")) {
          mutable[key] = new Date("2026-07-10T12:00:00.000Z")
        }
        continue
      }
      mutable[key] = value
    }
  }

  const withWorkspace = async (
    workspaceId: string,
    userId: string,
    fn: (db: unknown) => Promise<unknown>,
  ) => {
    state.scopeCalls.push({ workspaceId, userId })
    const visible = () =>
      state.rows.filter((r) => r.workspace_id === workspaceId)

    const db = {
      select(projection: Record<string, string>) {
        let predicate: Pred | undefined
        const filtered = () =>
          visible()
            .filter((r) => evalPred(predicate, r))
            .map((r) => project(r, projection))
        // `where(...)` is directly awaitable (like real Drizzle), unsorted;
        // `.orderBy(...)` additionally sorts. Both are exercised: `list`
        // chains `.orderBy(...)`, `match` awaits `.where(...)` directly.
        const chain = {
          from: () => chain,
          where: (pred: Pred | undefined) => {
            predicate = pred
            return chain
          },
          orderBy: () =>
            Promise.resolve(
              visible()
                .filter((r) => evalPred(predicate, r))
                .sort((a, b) =>
                  (a.counterparty_key + a.direction).localeCompare(
                    b.counterparty_key + b.direction,
                  ),
                )
                .map((r) => project(r, projection)),
            ),
          then: (
            onFulfilled: (rows: unknown) => unknown,
            onRejected?: (err: unknown) => unknown,
          ) => Promise.resolve(filtered()).then(onFulfilled, onRejected),
        }
        return chain
      },
      insert() {
        return {
          values: (vals: Record<string, unknown>) => ({
            returning: (projection: Record<string, string>) => {
              const now = new Date("2026-07-10T10:00:00.000Z")
              const row: TemplateRow = {
                id: `0196f1de-0000-7000-8000-00000000${String(
                  ++state.nextId,
                ).padStart(4, "0")}`,
                workspace_id: vals.workspace_id as string,
                counterparty_key: vals.counterparty_key as string,
                direction: vals.direction as string,
                supply_kind: vals.supply_kind as string,
                jurisdiction: vals.jurisdiction as string,
                confirmed_decision: vals.confirmed_decision as Record<
                  string,
                  unknown
                >,
                human_confirmed_at:
                  (vals.human_confirmed_at as Date | null) ?? null,
                match_count: (vals.match_count as number) ?? 0,
                held_count: (vals.held_count as number) ?? 0,
                last_reject_at: null,
                version: (vals.version as number) ?? 1,
                learned_at: now,
                provenance:
                  (vals.provenance as Record<string, unknown>) ?? null,
                created_at: now,
                updated_at: now,
              }
              // Emulate the partial unique index (0054): reject a SECOND
              // confirmed row for the same signature within a workspace.
              if (row.human_confirmed_at) {
                const clash = state.rows.some(
                  (r) =>
                    r.workspace_id === row.workspace_id &&
                    r.counterparty_key === row.counterparty_key &&
                    r.direction === row.direction &&
                    r.supply_kind === row.supply_kind &&
                    r.jurisdiction === row.jurisdiction &&
                    r.human_confirmed_at !== null,
                )
                if (clash) {
                  const err = new Error("duplicate key value") as Error & {
                    code: string
                  }
                  err.code = "23505"
                  throw err
                }
              }
              state.rows.push(row)
              return Promise.resolve([project(row, projection)])
            },
          }),
        }
      },
      update() {
        let patch: Record<string, unknown> = {}
        const chain = {
          set: (p: Record<string, unknown>) => {
            patch = p
            return chain
          },
          where: (pred: Pred | undefined) => ({
            returning: (projection: Record<string, string>) => {
              const target = visible().find((r) => evalPred(pred, r))
              if (!target) return Promise.resolve([])
              if (patch.human_confirmed_at !== undefined) {
                const clash = state.rows.some(
                  (r) =>
                    r.id !== target.id &&
                    r.workspace_id === target.workspace_id &&
                    r.counterparty_key === target.counterparty_key &&
                    r.direction === target.direction &&
                    r.supply_kind === target.supply_kind &&
                    r.jurisdiction === target.jurisdiction &&
                    r.human_confirmed_at !== null,
                )
                if (clash) {
                  const err = new Error("duplicate key value") as Error & {
                    code: string
                  }
                  err.code = "23505"
                  throw err
                }
              }
              applyPatch(target, patch)
              return Promise.resolve([project(target, projection)])
            },
          }),
        }
        return chain
      },
    }
    return fn(db)
  }

  return { eq, and, sql, withWorkspace }
})

const { verifyApiKey } = await import("@workspace/auth/api-key-verifier")
const { BookingTemplatesController } =
  await import("./booking-templates.controller")
const { DomainExceptionFilter } = await import("../domain-exception.filter")

const verifyApiKeyMock = vi.mocked(verifyApiKey)

const WORKSPACE_A = "0196f1de-0000-7000-8000-0000000000aa"
const WORKSPACE_B = "0196f1de-0000-7000-8000-0000000000bb"
const ORG = "0196f1de-0000-7000-8000-0000000000cc"
const USER = "0196f1de-0000-7000-8000-0000000000dd"

const TPL_A = "0196f1de-0000-7000-8000-000000000001"
const TPL_B = "0196f1de-0000-7000-8000-000000000002"

const DECISION = {
  vatMode: "STANDARD",
  vatJurisdiction: "DOMESTIC",
  vatRate: "21",
  scenario: "P-SERVICES-21",
  saldoAccount: "321",
  commodityCode: null,
  reasoning: ["confirmed template"],
}

function principalFor(
  workspaceId: string,
  actorKind: "human" | "agent" = "human",
) {
  return {
    userId: USER,
    organizationId: ORG,
    workspaceId,
    scopes: ["accounting:write"] as const,
    actorKind,
  }
}

function templateRow(over: Partial<TemplateRow> & { id: string }): TemplateRow {
  const now = new Date("2026-07-01T08:00:00.000Z")
  return {
    workspace_id: WORKSPACE_A,
    counterparty_key: "27082440",
    direction: "RECEIVED",
    supply_kind: "SERVICES",
    jurisdiction: "DOMESTIC",
    confirmed_decision: DECISION,
    human_confirmed_at: null,
    match_count: 0,
    held_count: 0,
    last_reject_at: null,
    version: 1,
    learned_at: now,
    provenance: null,
    created_at: now,
    updated_at: now,
    ...over,
  }
}

@Module({
  controllers: [BookingTemplatesController],
  providers: [{ provide: APP_FILTER, useClass: DomainExceptionFilter }],
})
class TestModule {}

describe("BookingTemplatesController", () => {
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
    state.scopeCalls = []
    state.nextId = 0
    state.rows = [
      templateRow({
        id: TPL_A,
        workspace_id: WORKSPACE_A,
        human_confirmed_at: new Date("2026-06-01T00:00:00.000Z"),
      }),
      templateRow({
        id: TPL_B,
        workspace_id: WORKSPACE_B,
        counterparty_key: "12345678",
        human_confirmed_at: new Date("2026-06-01T00:00:00.000Z"),
      }),
    ]
  })

  describe("GET /v1/booking-templates", () => {
    it("returns only the caller's workspace templates (B's template is invisible)", async () => {
      verifyApiKeyMock.mockResolvedValue(principalFor(WORKSPACE_A))
      const res = await supertest(app.getHttpServer())
        .get("/v1/booking-templates")
        .set("Authorization", "Bearer affk_live_a")
        .expect(200)

      expect(res.body.templates.map((t: { id: string }) => t.id)).toEqual([
        TPL_A,
      ])
      expect(JSON.stringify(res.body)).not.toContain(TPL_B)
      expect(state.scopeCalls).toEqual([
        { workspaceId: WORKSPACE_A, userId: USER },
      ])
    })

    it("401s without an API key", async () => {
      await supertest(app.getHttpServer())
        .get("/v1/booking-templates")
        .expect(401)
      expect(verifyApiKeyMock).not.toHaveBeenCalled()
    })
  })

  describe("POST /v1/booking-templates", () => {
    it("creates an UNCONFIRMED template (humanConfirmedAt null, matchCount/heldCount 0, version 1)", async () => {
      verifyApiKeyMock.mockResolvedValue(principalFor(WORKSPACE_A))
      const res = await supertest(app.getHttpServer())
        .post("/v1/booking-templates")
        .set("Authorization", "Bearer affk_live_a")
        .send({
          counterpartyKey: "99999999",
          direction: "ISSUED",
          supplyKind: "GOODS",
          jurisdiction: "DOMESTIC",
          confirmedDecision: DECISION,
        })
        .expect(201)

      expect(res.body.template).toMatchObject({
        counterpartyKey: "99999999",
        humanConfirmedAt: null,
        matchCount: 0,
        heldCount: 0,
        version: 1,
      })
    })

    it("an AGENT key may create a DRAFT (draft carries no write authority)", async () => {
      verifyApiKeyMock.mockResolvedValue(principalFor(WORKSPACE_A, "agent"))
      const res = await supertest(app.getHttpServer())
        .post("/v1/booking-templates")
        .set("Authorization", "Bearer affk_live_agent")
        .send({
          counterpartyKey: "88888888",
          direction: "RECEIVED",
          supplyKind: "SERVICES",
          jurisdiction: "DOMESTIC",
          confirmedDecision: DECISION,
        })
        .expect(201)
      expect(res.body.template.humanConfirmedAt).toBeNull()
    })
  })

  describe("POST /v1/booking-templates/:id/confirm", () => {
    it("sets humanConfirmedAt for a HUMAN key", async () => {
      state.rows = [templateRow({ id: TPL_A, human_confirmed_at: null })]
      verifyApiKeyMock.mockResolvedValue(principalFor(WORKSPACE_A))
      const res = await supertest(app.getHttpServer())
        .post(`/v1/booking-templates/${TPL_A}/confirm`)
        .set("Authorization", "Bearer affk_live_a")
        .expect(200)
      expect(res.body.template.humanConfirmedAt).toBe(
        "2026-07-10T12:00:00.000Z",
      )
    })

    it("is 403 for an AGENT key (confirmation is a human trust boundary — §I9 amendment)", async () => {
      state.rows = [templateRow({ id: TPL_A, human_confirmed_at: null })]
      verifyApiKeyMock.mockResolvedValue(principalFor(WORKSPACE_A, "agent"))
      const res = await supertest(app.getHttpServer())
        .post(`/v1/booking-templates/${TPL_A}/confirm`)
        .set("Authorization", "Bearer affk_live_agent")
        .expect(403)
      expect(res.body.error.code).toBe("forbidden")
      expect(
        state.rows.find((r) => r.id === TPL_A)?.human_confirmed_at,
      ).toBeNull()
    })

    it("404s on a template in another workspace", async () => {
      verifyApiKeyMock.mockResolvedValue(principalFor(WORKSPACE_A))
      const res = await supertest(app.getHttpServer())
        .post(`/v1/booking-templates/${TPL_B}/confirm`)
        .set("Authorization", "Bearer affk_live_a")
        .expect(404)
      expect(res.body.error.code).toBe("not_found")
    })

    it("409s confirming a SECOND template for a signature already confirmed", async () => {
      const TPL_A2 = "0196f1de-0000-7000-8000-000000000003"
      state.rows = [
        templateRow({ id: TPL_A, human_confirmed_at: new Date() }),
        templateRow({ id: TPL_A2, human_confirmed_at: null }),
      ]
      verifyApiKeyMock.mockResolvedValue(principalFor(WORKSPACE_A))
      const res = await supertest(app.getHttpServer())
        .post(`/v1/booking-templates/${TPL_A2}/confirm`)
        .set("Authorization", "Bearer affk_live_a")
        .expect(409)
      expect(res.body.error.code).toBe("conflict")
    })
  })

  describe("POST /v1/booking-templates/match (§I9 amendment load-bearing test)", () => {
    const signature = {
      counterpartyKey: "27082440",
      direction: "RECEIVED",
      supplyKind: "SERVICES",
      jurisdiction: "DOMESTIC",
    }

    it("returns the matching CONFIRMED template", async () => {
      verifyApiKeyMock.mockResolvedValue(principalFor(WORKSPACE_A))
      const res = await supertest(app.getHttpServer())
        .post("/v1/booking-templates/match")
        .set("Authorization", "Bearer affk_live_a")
        .send(signature)
        .expect(200)
      expect(res.body.template).toMatchObject({
        id: TPL_A,
        confirmedDecision: DECISION,
      })
    })

    it("NEVER returns a DRAFT (unconfirmed) template — the trust gate holds at the API boundary", async () => {
      state.rows = [templateRow({ id: TPL_A, human_confirmed_at: null })]
      verifyApiKeyMock.mockResolvedValue(principalFor(WORKSPACE_A))
      const res = await supertest(app.getHttpServer())
        .post("/v1/booking-templates/match")
        .set("Authorization", "Bearer affk_live_a")
        .send(signature)
        .expect(200)
      expect(res.body.template).toBeNull()
    })

    it("returns null for a novel/unmatched signature", async () => {
      verifyApiKeyMock.mockResolvedValue(principalFor(WORKSPACE_A))
      const res = await supertest(app.getHttpServer())
        .post("/v1/booking-templates/match")
        .set("Authorization", "Bearer affk_live_a")
        .send({ ...signature, jurisdiction: "EU" })
        .expect(200)
      expect(res.body.template).toBeNull()
    })

    it("an AGENT key may call match (pure read, no write authority granted)", async () => {
      verifyApiKeyMock.mockResolvedValue(principalFor(WORKSPACE_A, "agent"))
      const res = await supertest(app.getHttpServer())
        .post("/v1/booking-templates/match")
        .set("Authorization", "Bearer affk_live_agent")
        .send(signature)
        .expect(200)
      expect(res.body.template.id).toBe(TPL_A)
    })

    it("workspace B key cannot match workspace A's confirmed template (RLS isolation)", async () => {
      verifyApiKeyMock.mockResolvedValue(principalFor(WORKSPACE_B))
      const res = await supertest(app.getHttpServer())
        .post("/v1/booking-templates/match")
        .set("Authorization", "Bearer affk_live_b")
        .send(signature)
        .expect(200)
      expect(res.body.template).toBeNull()
    })
  })
})
