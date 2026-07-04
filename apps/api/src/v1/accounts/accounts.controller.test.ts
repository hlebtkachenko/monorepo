import { type INestApplication, Module, VersioningType } from "@nestjs/common"
import { APP_FILTER, APP_PIPE } from "@nestjs/core"
import { Test } from "@nestjs/testing"
import { ZodValidationPipe } from "nestjs-zod"
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
 * Contract tests for `/v1/accounts` (list / get / patch).
 *
 * Same strategy as `organization.controller.test.ts`: `withOrganization` is
 * mocked with an in-memory RLS emulation — the callback's `db` only ever sees
 * `account` rows whose `organization_id` equals the GUC scope (first arg),
 * mirroring the real `organization_isolation` policy. The genuine policy is
 * proven against live Postgres in packages/db; here the mock pins that the
 * CONTROLLER derives its tenant exclusively from the verified principal —
 * never from request input — and that a cross-tenant row surfaces as 404, and
 * that PATCH is gated on the `accounting:write` scope.
 */

interface AccountRow {
  id: string
  organization_id: string
  chart_id: string
  period_id: string
  parent_id: string | null
  number: string
  name: string
  nature: string
  normal_balance: "DEBIT" | "CREDIT" | null
  tracks_open_items: boolean
  class: number | null
  group_code: string | null
  synthetic_code: string | null
  is_synthetic: boolean | null
  specializes_directive_code: string | null
}

const state = vi.hoisted(() => ({
  rows: [] as AccountRow[],
  scopeCalls: [] as Array<{ orgId: string; userId: string | null }>,
  /** Keys passed to the last `.set()` — proves the UPDATE payload allowlist. */
  lastSetKeys: [] as string[],
}))

vi.mock("@workspace/auth/api-key-verifier", () => ({
  verifyApiKey: vi.fn(),
}))

vi.mock("@workspace/db/schema", () => ({
  account: {
    id: "account.id",
    chart_id: "account.chart_id",
    period_id: "account.period_id",
    parent_id: "account.parent_id",
    number: "account.number",
    name: "account.name",
    nature: "account.nature",
    normal_balance: "account.normal_balance",
    tracks_open_items: "account.tracks_open_items",
    class: "account.class",
    group_code: "account.group_code",
    synthetic_code: "account.synthetic_code",
    is_synthetic: "account.is_synthetic",
    specializes_directive_code: "account.specializes_directive_code",
  },
}))

type Pred =
  | { column: string; value: unknown }
  | { and: Array<{ column: string; value: unknown }> }

vi.mock("@workspace/db", () => {
  const eq = (column: unknown, value: unknown) => ({ column, value })
  const and = (...preds: Array<{ column: string; value: unknown }>) => ({
    and: preds,
  })
  const sql = (strings: TemplateStringsArray) => ({ sql: strings.join("") })

  const fieldOf = (marker: string) => marker.split(".")[1] as keyof AccountRow
  const matches = (row: AccountRow, pred: Pred | null): boolean => {
    if (!pred) return true
    if ("and" in pred) return pred.and.every((p) => matches(row, p))
    return row[fieldOf(pred.column)] === pred.value
  }
  const project = (
    row: AccountRow,
    projection: Record<string, string>,
  ): Record<string, unknown> => {
    const out: Record<string, unknown> = {}
    for (const [key, marker] of Object.entries(projection)) {
      out[key] = row[fieldOf(marker)]
    }
    return out
  }

  const withOrganization = async (
    orgId: string,
    userId: string | null,
    fn: (db: unknown) => Promise<unknown>,
  ) => {
    state.scopeCalls.push({ orgId, userId })
    const visible = () => state.rows.filter((r) => r.organization_id === orgId)

    const db = {
      select(projection: Record<string, string>) {
        let predicate: Pred | null = null
        const chain = {
          from: () => chain,
          where: (pred: Pred | null) => {
            predicate = pred ?? null
            return chain
          },
          orderBy: () => chain,
          limit: (n: number) =>
            Promise.resolve(
              visible()
                .filter((r) => matches(r, predicate))
                .slice(0, n)
                .map((r) => project(r, projection)),
            ),
          then: (resolve: (v: Array<Record<string, unknown>>) => unknown) =>
            resolve(
              visible()
                .filter((r) => matches(r, predicate))
                .map((r) => project(r, projection)),
            ),
        }
        return chain
      },
      update(_table: unknown) {
        let patch: Partial<AccountRow> = {}
        let predicate: Pred | null = null
        const chain = {
          set: (p: Partial<AccountRow>) => {
            patch = p
            state.lastSetKeys = Object.keys(p)
            return chain
          },
          where: (pred: Pred | null) => {
            predicate = pred ?? null
            return chain
          },
          returning: (projection: Record<string, string>) => {
            const hit = visible().filter((r) => matches(r, predicate))
            for (const r of hit) Object.assign(r, patch)
            return Promise.resolve(hit.map((r) => project(r, projection)))
          },
        }
        return chain
      },
    }
    return fn(db)
  }

  return { eq, and, sql, withOrganization }
})

const { verifyApiKey } = await import("@workspace/auth/api-key-verifier")
const { ListAccountsResponseSchema, GetAccountResponseSchema } =
  await import("@workspace/shared/api")
const { AccountsController } = await import("./accounts.controller")
const { DomainExceptionFilter } = await import("../domain-exception.filter")

const verifyApiKeyMock = vi.mocked(verifyApiKey)

const ORG_A = "0196f1de-0000-7000-8000-00000000000a"
const ORG_B = "0196f1de-0000-7000-8000-00000000000b"
const PERIOD_A1 = "0196f1de-0000-7000-8000-0000000000d1"
const PERIOD_A2 = "0196f1de-0000-7000-8000-0000000000d2"
const ACC_A_311 = "0196f1de-0000-7000-8000-000000000311"
const ACC_A_518 = "0196f1de-0000-7000-8000-000000000518"
const ACC_B_311 = "0196f1de-0000-7000-8000-000000000b11"

function row(over: Partial<AccountRow> & { id: string }): AccountRow {
  return {
    organization_id: ORG_A,
    chart_id: "0196f1de-0000-7000-8000-0000000000c1",
    period_id: PERIOD_A1,
    parent_id: null,
    number: "311",
    name: "Odběratelé",
    nature: "ASSET",
    normal_balance: "DEBIT",
    tracks_open_items: true,
    class: 3,
    group_code: "31",
    synthetic_code: "311",
    is_synthetic: true,
    specializes_directive_code: "311",
    ...over,
  }
}

function principalFor(orgId: string, scopes: readonly string[] = []) {
  return {
    userId: "0196f1de-0000-7000-8000-0000000000aa",
    organizationId: orgId,
    workspaceId: "0196f1de-0000-7000-8000-0000000000bb",
    scopes,
  }
}

@Module({
  controllers: [AccountsController],
  providers: [
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    // Mirror V1Module: the global ZodValidationPipe validates body/query DTOs,
    // so these contract tests exercise real schema validation (unknown-key
    // stripping, enum/uuid rejection), not just the controller's happy path.
    { provide: APP_PIPE, useClass: ZodValidationPipe },
  ],
})
class TestModule {}

describe("AccountsController (/v1/accounts)", () => {
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
    state.rows = [
      row({ id: ACC_A_311, number: "311", is_synthetic: true }),
      row({
        id: ACC_A_518,
        number: "518",
        name: "Ostatní služby",
        nature: "EXPENSE",
        period_id: PERIOD_A2,
        is_synthetic: false,
        parent_id: ACC_A_311,
        tracks_open_items: false,
      }),
      row({ id: ACC_B_311, organization_id: ORG_B, number: "311" }),
    ]
    state.scopeCalls = []
    state.lastSetKeys = []
  })

  it("401s without an Authorization header", async () => {
    await supertest(app.getHttpServer()).get("/v1/accounts").expect(401)
    expect(verifyApiKeyMock).not.toHaveBeenCalled()
  })

  it("401s on a key the verifier rejects", async () => {
    verifyApiKeyMock.mockResolvedValue(null)
    const res = await supertest(app.getHttpServer())
      .get("/v1/accounts")
      .set("Authorization", "Bearer affk_live_unknown")
      .expect(401)
    expect(res.body.error.code).toBe("unauthorized")
  })

  it("lists only the caller's own accounts, parsing the shared schema", async () => {
    verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
    const res = await supertest(app.getHttpServer())
      .get("/v1/accounts")
      .set("Authorization", "Bearer affk_live_a")
      .expect(200)

    const parsed = ListAccountsResponseSchema.safeParse(res.body)
    expect(parsed.error?.issues ?? []).toEqual([])
    expect(res.body.accounts.map((a: { id: string }) => a.id).sort()).toEqual(
      [ACC_A_311, ACC_A_518].sort(),
    )
    expect(JSON.stringify(res.body)).not.toContain(ACC_B_311)
  })

  it("filters by periodId", async () => {
    verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
    const res = await supertest(app.getHttpServer())
      .get("/v1/accounts")
      .query({ periodId: PERIOD_A2 })
      .set("Authorization", "Bearer affk_live_a")
      .expect(200)
    expect(res.body.accounts).toHaveLength(1)
    expect(res.body.accounts[0].id).toBe(ACC_A_518)
  })

  it("filters by isSynthetic", async () => {
    verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
    const res = await supertest(app.getHttpServer())
      .get("/v1/accounts")
      .query({ isSynthetic: "false" })
      .set("Authorization", "Bearer affk_live_a")
      .expect(200)
    expect(res.body.accounts).toHaveLength(1)
    expect(res.body.accounts[0].id).toBe(ACC_A_518)
    expect(res.body.accounts[0].isSynthetic).toBe(false)
  })

  it("derives the tenant scope from the principal, never from query input", async () => {
    verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
    const res = await supertest(app.getHttpServer())
      .get("/v1/accounts")
      .query({ organization_id: ORG_B, organizationId: ORG_B })
      .set("Authorization", "Bearer affk_live_a")
      .expect(200)
    expect(JSON.stringify(res.body)).not.toContain(ACC_B_311)
    expect(state.scopeCalls).toEqual([
      { orgId: ORG_A, userId: principalFor(ORG_A).userId },
    ])
  })

  it("gets a single account (parses the shared schema)", async () => {
    verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
    const res = await supertest(app.getHttpServer())
      .get(`/v1/accounts/${ACC_A_311}`)
      .set("Authorization", "Bearer affk_live_a")
      .expect(200)
    const parsed = GetAccountResponseSchema.safeParse(res.body)
    expect(parsed.error?.issues ?? []).toEqual([])
    expect(res.body.account.id).toBe(ACC_A_311)
  })

  it("404s (not 403) on a cross-tenant account id", async () => {
    verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
    const res = await supertest(app.getHttpServer())
      .get(`/v1/accounts/${ACC_B_311}`)
      .set("Authorization", "Bearer affk_live_a")
      .expect(404)
    expect(res.body.error).toMatchObject({
      code: "not_found",
      error_type: "NOT_FOUND",
    })
  })

  it("PATCH edits name and tracksOpenItems with the accounting:write scope", async () => {
    verifyApiKeyMock.mockResolvedValue(
      principalFor(ORG_A, ["accounting:write"]),
    )
    const res = await supertest(app.getHttpServer())
      .patch(`/v1/accounts/${ACC_A_518}`)
      .set("Authorization", "Bearer affk_live_a")
      .send({ name: "Poradenství", tracksOpenItems: true })
      .expect(200)
    expect(res.body.account).toMatchObject({
      id: ACC_A_518,
      name: "Poradenství",
      tracksOpenItems: true,
    })
  })

  it("PATCH ignores tenant identifiers smuggled in the body", async () => {
    verifyApiKeyMock.mockResolvedValue(
      principalFor(ORG_A, ["accounting:write"]),
    )
    await supertest(app.getHttpServer())
      .patch(`/v1/accounts/${ACC_A_311}`)
      .set("Authorization", "Bearer affk_live_a")
      .send({ name: "Renamed", organization_id: ORG_B, organizationId: ORG_B })
      .expect(200)
    // The org-B account is untouched — the write scoped to the principal's org.
    const bRow = state.rows.find((r) => r.id === ACC_B_311)
    expect(bRow?.name).toBe("Odběratelé")
    expect(state.scopeCalls.at(-1)).toEqual({
      orgId: ORG_A,
      userId: principalFor(ORG_A).userId,
    })
  })

  it("PATCH SET payload is limited to the editable columns + updated_at, even when hostile keys are sent", async () => {
    verifyApiKeyMock.mockResolvedValue(
      principalFor(ORG_A, ["accounting:write"]),
    )
    await supertest(app.getHttpServer())
      .patch(`/v1/accounts/${ACC_A_311}`)
      .set("Authorization", "Bearer affk_live_a")
      .send({
        name: "Renamed",
        number: "999",
        nature: "LIABILITY",
        normal_balance: "CREDIT",
        parent_id: ACC_A_518,
      })
      .expect(200)
    // The zod pipe strips unknown keys AND the controller allowlists the SET —
    // only name (+ the server-set updated_at) ever reaches the UPDATE.
    expect([...state.lastSetKeys].sort()).toEqual(["name", "updated_at"])
    const target = state.rows.find((r) => r.id === ACC_A_311)
    expect(target?.number).toBe("311")
    expect(target?.nature).toBe("ASSET")
  })

  it("rejects a wrong-typed field via the zod validation pipe", async () => {
    verifyApiKeyMock.mockResolvedValue(
      principalFor(ORG_A, ["accounting:write"]),
    )
    const res = await supertest(app.getHttpServer())
      .patch(`/v1/accounts/${ACC_A_311}`)
      .set("Authorization", "Bearer affk_live_a")
      .send({ tracksOpenItems: "yes" })
    expect([400, 422]).toContain(res.status)
  })

  it("400s on a malformed accountId in the path", async () => {
    verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
    await supertest(app.getHttpServer())
      .get("/v1/accounts/not-a-uuid")
      .set("Authorization", "Bearer affk_live_a")
      .expect(400)
  })

  it("rejects an invalid isSynthetic query value", async () => {
    verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
    const res = await supertest(app.getHttpServer())
      .get("/v1/accounts")
      .query({ isSynthetic: "maybe" })
      .set("Authorization", "Bearer affk_live_a")
    expect([400, 422]).toContain(res.status)
  })

  it("PATCH 404s on a cross-tenant account id", async () => {
    verifyApiKeyMock.mockResolvedValue(
      principalFor(ORG_A, ["accounting:write"]),
    )
    await supertest(app.getHttpServer())
      .patch(`/v1/accounts/${ACC_B_311}`)
      .set("Authorization", "Bearer affk_live_a")
      .send({ name: "Hijack" })
      .expect(404)
  })

  it("PATCH 403s when the key lacks the accounting:write scope", async () => {
    verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A, ["read"]))
    const res = await supertest(app.getHttpServer())
      .patch(`/v1/accounts/${ACC_A_311}`)
      .set("Authorization", "Bearer affk_live_a")
      .send({ name: "Nope" })
      .expect(403)
    expect(res.body.error.code).toBe("forbidden")
  })

  it("PATCH 422s on an empty body (no editable field)", async () => {
    verifyApiKeyMock.mockResolvedValue(
      principalFor(ORG_A, ["accounting:write"]),
    )
    await supertest(app.getHttpServer())
      .patch(`/v1/accounts/${ACC_A_311}`)
      .set("Authorization", "Bearer affk_live_a")
      .send({})
      .expect(422)
  })
})
