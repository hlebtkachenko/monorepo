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
 * Contract tests for the OCR-templates surface
 * (`GET|POST /v1/ocr-templates`, `PUT …/{id}`, `POST …/{id}/confirm`).
 *
 * Mirrors the held-writes controller test strategy: `withWorkspace` is mocked
 * with an in-memory RLS emulation (the callback's db only ever sees rows whose
 * workspace_id equals the GUC scope), so cross-workspace isolation is exercised
 * without a live Postgres. The verifier is mocked so we can drive human vs
 * agent actor keys.
 */

type Pred =
  | { type: "eq"; column: string; value: unknown }
  | { type: "and"; conds: Pred[] }

interface TemplateRow {
  id: string
  workspace_id: string
  supplier_key: string
  doc_kind: string
  locators: Record<string, unknown>
  layout_fingerprint: string | null
  human_confirmed_at: Date | null
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
  ocr_extraction_template: {
    id: "ocr_extraction_template.id",
    workspace_id: "ocr_extraction_template.workspace_id",
    supplier_key: "ocr_extraction_template.supplier_key",
    doc_kind: "ocr_extraction_template.doc_kind",
    locators: "ocr_extraction_template.locators",
    layout_fingerprint: "ocr_extraction_template.layout_fingerprint",
    human_confirmed_at: "ocr_extraction_template.human_confirmed_at",
    held_count: "ocr_extraction_template.held_count",
    last_reject_at: "ocr_extraction_template.last_reject_at",
    version: "ocr_extraction_template.version",
    learned_at: "ocr_extraction_template.learned_at",
    provenance: "ocr_extraction_template.provenance",
    created_at: "ocr_extraction_template.created_at",
    updated_at: "ocr_extraction_template.updated_at",
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
  // `sql` is used as both a template tag (sql`now()`) and interpolation target
  // (sql`${col} + 1`). We only need to recognise the two shapes the controller
  // produces, so return a tagged marker the update handler can interpret.
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
          mutable[key] = new Date("2026-07-05T12:00:00.000Z")
        } else if (marker.__sql.includes("+ 1")) {
          mutable[key] = (row[key as keyof TemplateRow] as number) + 1
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
    // RLS emulation: rows outside the GUC scope do not exist for the callback.
    const visible = () =>
      state.rows.filter((r) => r.workspace_id === workspaceId)

    const db = {
      select(projection: Record<string, string>) {
        let predicate: Pred | undefined
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
                  (a.supplier_key + a.doc_kind).localeCompare(
                    b.supplier_key + b.doc_kind,
                  ),
                )
                .map((r) => project(r, projection)),
            ),
        }
        return chain
      },
      insert() {
        return {
          values: (vals: Record<string, unknown>) => ({
            returning: (projection: Record<string, string>) => {
              const now = new Date("2026-07-05T10:00:00.000Z")
              const row: TemplateRow = {
                id: `0196f1de-0000-7000-8000-00000000${String(
                  ++state.nextId,
                ).padStart(4, "0")}`,
                workspace_id: vals.workspace_id as string,
                supplier_key: vals.supplier_key as string,
                doc_kind: vals.doc_kind as string,
                locators: vals.locators as Record<string, unknown>,
                layout_fingerprint:
                  (vals.layout_fingerprint as string | null) ?? null,
                human_confirmed_at:
                  (vals.human_confirmed_at as Date | null) ?? null,
                held_count: (vals.held_count as number) ?? 0,
                last_reject_at: null,
                version: (vals.version as number) ?? 1,
                learned_at: now,
                provenance:
                  (vals.provenance as Record<string, unknown>) ?? null,
                created_at: now,
                updated_at: now,
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
const { OcrTemplatesController } = await import("./ocr-templates.controller")
const { DomainExceptionFilter } = await import("../domain-exception.filter")

const verifyApiKeyMock = vi.mocked(verifyApiKey)

const WORKSPACE_A = "0196f1de-0000-7000-8000-0000000000aa"
const WORKSPACE_B = "0196f1de-0000-7000-8000-0000000000bb"
const ORG = "0196f1de-0000-7000-8000-0000000000cc"
const USER = "0196f1de-0000-7000-8000-0000000000dd"

const TPL_A = "0196f1de-0000-7000-8000-000000000001"
const TPL_B = "0196f1de-0000-7000-8000-000000000002"

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
    supplier_key: "27082440",
    doc_kind: "RECEIVED_INVOICE",
    locators: { total: "bottom-right" },
    layout_fingerprint: "sha256:9f2c",
    human_confirmed_at: null,
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
  controllers: [OcrTemplatesController],
  providers: [{ provide: APP_FILTER, useClass: DomainExceptionFilter }],
})
class TestModule {}

describe("OcrTemplatesController", () => {
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
      templateRow({ id: TPL_A, workspace_id: WORKSPACE_A }),
      templateRow({
        id: TPL_B,
        workspace_id: WORKSPACE_B,
        supplier_key: "12345678",
      }),
    ]
  })

  describe("GET /v1/ocr-templates", () => {
    it("returns only the caller's workspace templates (B's template is invisible)", async () => {
      verifyApiKeyMock.mockResolvedValue(principalFor(WORKSPACE_A))
      const res = await supertest(app.getHttpServer())
        .get("/v1/ocr-templates")
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

    it("workspace B key cannot read workspace A's template", async () => {
      verifyApiKeyMock.mockResolvedValue(principalFor(WORKSPACE_B))
      const res = await supertest(app.getHttpServer())
        .get("/v1/ocr-templates")
        .set("Authorization", "Bearer affk_live_b")
        .expect(200)

      expect(res.body.templates.map((t: { id: string }) => t.id)).toEqual([
        TPL_B,
      ])
      expect(JSON.stringify(res.body)).not.toContain(TPL_A)
    })

    it("an AGENT key may read the workspace templates", async () => {
      verifyApiKeyMock.mockResolvedValue(principalFor(WORKSPACE_A, "agent"))
      const res = await supertest(app.getHttpServer())
        .get("/v1/ocr-templates")
        .set("Authorization", "Bearer affk_live_agent")
        .expect(200)
      expect(res.body.templates.map((t: { id: string }) => t.id)).toEqual([
        TPL_A,
      ])
    })

    it("401s without an API key", async () => {
      await supertest(app.getHttpServer()).get("/v1/ocr-templates").expect(401)
      expect(verifyApiKeyMock).not.toHaveBeenCalled()
    })
  })

  describe("POST /v1/ocr-templates", () => {
    it("creates an UNCONFIRMED template (humanConfirmedAt null, heldCount 0, version 1)", async () => {
      verifyApiKeyMock.mockResolvedValue(principalFor(WORKSPACE_A))
      const res = await supertest(app.getHttpServer())
        .post("/v1/ocr-templates")
        .set("Authorization", "Bearer affk_live_a")
        .send({
          supplierKey: "99999999",
          docKind: "RECEIVED_INVOICE",
          locators: { total: "bottom" },
        })
        .expect(201)

      expect(res.body.template).toMatchObject({
        supplierKey: "99999999",
        docKind: "RECEIVED_INVOICE",
        humanConfirmedAt: null,
        heldCount: 0,
        version: 1,
      })
      // Persisted into workspace A only.
      expect(state.rows.some((r) => r.supplier_key === "99999999")).toBe(true)
    })

    it("an AGENT key may create", async () => {
      verifyApiKeyMock.mockResolvedValue(principalFor(WORKSPACE_A, "agent"))
      const res = await supertest(app.getHttpServer())
        .post("/v1/ocr-templates")
        .set("Authorization", "Bearer affk_live_agent")
        .send({
          supplierKey: "88888888",
          docKind: "RECEIVED_INVOICE",
          locators: {},
        })
        .expect(201)
      expect(res.body.template.humanConfirmedAt).toBeNull()
    })
  })

  describe("PUT /v1/ocr-templates/:id", () => {
    it("resets humanConfirmedAt to null and bumps version", async () => {
      // Start from a CONFIRMED, v1 template.
      state.rows = [
        templateRow({
          id: TPL_A,
          workspace_id: WORKSPACE_A,
          human_confirmed_at: new Date("2026-06-01T00:00:00.000Z"),
          version: 3,
        }),
      ]
      verifyApiKeyMock.mockResolvedValue(principalFor(WORKSPACE_A))
      const res = await supertest(app.getHttpServer())
        .put(`/v1/ocr-templates/${TPL_A}`)
        .set("Authorization", "Bearer affk_live_a")
        .send({ locators: { total: "top-left" } })
        .expect(200)

      expect(res.body.template.humanConfirmedAt).toBeNull()
      expect(res.body.template.version).toBe(4)
      expect(res.body.template.locators).toEqual({ total: "top-left" })
    })

    it("404s on a template in another workspace (RLS-invisible)", async () => {
      verifyApiKeyMock.mockResolvedValue(principalFor(WORKSPACE_A))
      const res = await supertest(app.getHttpServer())
        .put(`/v1/ocr-templates/${TPL_B}`)
        .set("Authorization", "Bearer affk_live_a")
        .send({ locators: {} })
        .expect(404)
      expect(res.body.error.code).toBe("not_found")
    })
  })

  describe("POST /v1/ocr-templates/:id/confirm", () => {
    it("sets humanConfirmedAt for a HUMAN key", async () => {
      verifyApiKeyMock.mockResolvedValue(principalFor(WORKSPACE_A))
      const res = await supertest(app.getHttpServer())
        .post(`/v1/ocr-templates/${TPL_A}/confirm`)
        .set("Authorization", "Bearer affk_live_a")
        .expect(200)
      expect(res.body.template.humanConfirmedAt).toBe(
        "2026-07-05T12:00:00.000Z",
      )
    })

    it("is 403 for an AGENT key (confirmation is a human trust boundary)", async () => {
      verifyApiKeyMock.mockResolvedValue(principalFor(WORKSPACE_A, "agent"))
      const res = await supertest(app.getHttpServer())
        .post(`/v1/ocr-templates/${TPL_A}/confirm`)
        .set("Authorization", "Bearer affk_live_agent")
        .expect(403)
      expect(res.body.error.code).toBe("forbidden")
      // The template stays unconfirmed.
      expect(
        state.rows.find((r) => r.id === TPL_A)?.human_confirmed_at,
      ).toBeNull()
    })

    it("404s on a template in another workspace", async () => {
      verifyApiKeyMock.mockResolvedValue(principalFor(WORKSPACE_A))
      const res = await supertest(app.getHttpServer())
        .post(`/v1/ocr-templates/${TPL_B}/confirm`)
        .set("Authorization", "Bearer affk_live_a")
        .expect(404)
      expect(res.body.error.code).toBe("not_found")
    })
  })
})
