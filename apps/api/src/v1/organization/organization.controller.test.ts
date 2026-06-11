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
 * T13 — contract tests for the worked-example endpoint.
 *
 * `GET /v1/organization` exercises the whole foundation chain: API-key auth
 * (ApiKeyGuard -> verifyApiKey) -> RLS tenancy (`withOrganization`) -> typed
 * response. The `openapi-lint` gate only proves registry == committed spec;
 * these tests close the other half: the controller's RUNTIME response parses
 * against the shared Zod schema, missing/invalid keys 401 with the standard
 * envelope, and a key for org A can never read org B's row.
 *
 * DB strategy: `withOrganization` is mocked with an in-memory RLS emulation —
 * the callback's `db` only ever sees rows whose `organization_id` equals the
 * GUC scope (first argument), mirroring the real `organization_isolation`
 * policy. The genuine policy behavior is proven against live Postgres in
 * `packages/db/tests/rls-cross-organization.test.ts` (T7); here the mock pins
 * that the CONTROLLER derives its scope exclusively from the verified
 * principal — never from request input.
 */

interface OrgRow {
  id: string
  organization_id: string
  slug: string
  legal_name: string
  fiscal_year_start_month: number
}

const state = vi.hoisted(() => ({
  rows: [] as OrgRow[],
  /** Records every withOrganization(scopeOrgId, userId) call. */
  scopeCalls: [] as Array<{ orgId: string; userId: string | null }>,
}))

vi.mock("@workspace/auth/api-key-verifier", () => ({
  verifyApiKey: vi.fn(),
}))

vi.mock("@workspace/db/schema", () => ({
  // Column markers: the fake query builder maps `organization.<col>` to the
  // matching row field. Only the columns the controller projects are needed.
  organization: {
    id: "organization.id",
    slug: "organization.slug",
    legal_name: "organization.legal_name",
    fiscal_year_start_month: "organization.fiscal_year_start_month",
  },
}))

vi.mock("@workspace/db", () => {
  const eq = (column: unknown, value: unknown) => ({ column, value })

  const withOrganization = async (
    orgId: string,
    userId: string | null,
    fn: (db: unknown) => Promise<unknown>,
  ) => {
    state.scopeCalls.push({ orgId, userId })
    // RLS emulation: rows outside the GUC scope do not exist for the callback,
    // no matter what the WHERE clause asks for.
    const visible = state.rows.filter((r) => r.organization_id === orgId)

    const db = {
      select(projection: Record<string, string>) {
        let predicate: { column: string; value: unknown } | null = null
        const chain = {
          from: () => chain,
          where: (pred: { column: string; value: unknown }) => {
            predicate = pred
            return chain
          },
          limit: (n: number) => {
            const matched = visible.filter((row) => {
              if (!predicate) return true
              const field = predicate.column.split(".")[1] as keyof OrgRow
              return row[field] === predicate.value
            })
            return Promise.resolve(
              matched.slice(0, n).map((row) => {
                const out: Record<string, unknown> = {}
                for (const [key, marker] of Object.entries(projection)) {
                  out[key] = row[marker.split(".")[1] as keyof OrgRow]
                }
                return out
              }),
            )
          },
        }
        return chain
      },
    }
    return fn(db)
  }

  return { eq, withOrganization }
})

const { verifyApiKey } = await import("@workspace/auth/api-key-verifier")
const { GetOrganizationResponseSchema } = await import("@workspace/shared/api")
const { OrganizationController } = await import("./organization.controller")
const { DomainExceptionFilter } = await import("../domain-exception.filter")

const verifyApiKeyMock = vi.mocked(verifyApiKey)

const ORG_A = {
  id: "0196f1de-0000-7000-8000-00000000000a",
  slug: "org-a",
  legal_name: "Organization A s.r.o.",
  fiscal_year_start_month: 1,
}
const ORG_B = {
  id: "0196f1de-0000-7000-8000-00000000000b",
  slug: "org-b",
  legal_name: "Organization B s.r.o.",
  fiscal_year_start_month: 7,
}
/** An org the key is scoped to but whose row does not exist. */
const ORG_GONE_ID = "0196f1de-0000-7000-8000-00000000000c"

function principalFor(orgId: string) {
  return {
    userId: "0196f1de-0000-7000-8000-0000000000aa",
    organizationId: orgId,
    workspaceId: "0196f1de-0000-7000-8000-0000000000bb",
    scopes: ["read"] as const,
  }
}

@Module({
  controllers: [OrganizationController],
  providers: [{ provide: APP_FILTER, useClass: DomainExceptionFilter }],
})
class TestModule {}

describe("OrganizationController (GET /v1/organization)", () => {
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
      { ...ORG_A, organization_id: ORG_A.id },
      { ...ORG_B, organization_id: ORG_B.id },
    ]
    state.scopeCalls = []
  })

  it("401s without an Authorization header (standard envelope, verifier untouched)", async () => {
    const res = await supertest(app.getHttpServer())
      .get("/v1/organization")
      .expect(401)
    expect(res.body.error).toMatchObject({
      code: "unauthorized",
      error_type: "UNAUTHORIZED",
    })
    expect(verifyApiKeyMock).not.toHaveBeenCalled()
  })

  it("401s on a key the verifier rejects", async () => {
    verifyApiKeyMock.mockResolvedValue(null)
    const res = await supertest(app.getHttpServer())
      .get("/v1/organization")
      .set("Authorization", "Bearer affk_live_unknown")
      .expect(401)
    expect(res.body.error.code).toBe("unauthorized")
    expect(verifyApiKeyMock).toHaveBeenCalledWith("affk_live_unknown")
  })

  it("200 response parses against the shared GetOrganizationResponseSchema", async () => {
    verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A.id))
    const res = await supertest(app.getHttpServer())
      .get("/v1/organization")
      .set("Authorization", "Bearer affk_live_a")
      .expect(200)

    const parsed = GetOrganizationResponseSchema.safeParse(res.body)
    expect(parsed.error?.issues ?? []).toEqual([])
    expect(parsed.success).toBe(true)
    expect(res.body.organization).toEqual({
      id: ORG_A.id,
      slug: ORG_A.slug,
      legalName: ORG_A.legal_name,
      fiscalYearStartMonth: ORG_A.fiscal_year_start_month,
    })
  })

  it("key for org A never sees org B (and vice versa)", async () => {
    verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A.id))
    const resA = await supertest(app.getHttpServer())
      .get("/v1/organization")
      .set("Authorization", "Bearer affk_live_a")
      .expect(200)
    expect(resA.body.organization.id).toBe(ORG_A.id)
    expect(JSON.stringify(resA.body)).not.toContain(ORG_B.id)
    expect(JSON.stringify(resA.body)).not.toContain(ORG_B.legal_name)

    verifyApiKeyMock.mockResolvedValue(principalFor(ORG_B.id))
    const resB = await supertest(app.getHttpServer())
      .get("/v1/organization")
      .set("Authorization", "Bearer affk_live_b")
      .expect(200)
    expect(resB.body.organization.id).toBe(ORG_B.id)
    expect(JSON.stringify(resB.body)).not.toContain(ORG_A.id)
  })

  it("derives the tenancy scope from the principal, never from request input", async () => {
    verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A.id))
    // A hostile caller smuggling organization_id in the query string must not
    // influence the scope — server-side injection is the only path.
    const res = await supertest(app.getHttpServer())
      .get("/v1/organization")
      .query({ organization_id: ORG_B.id, organizationId: ORG_B.id })
      .set("Authorization", "Bearer affk_live_a")
      .expect(200)
    expect(res.body.organization.id).toBe(ORG_A.id)
    expect(state.scopeCalls).toHaveLength(1)
    expect(state.scopeCalls[0]).toEqual({
      orgId: ORG_A.id,
      userId: principalFor(ORG_A.id).userId,
    })
  })

  it("404s with the standard envelope when the scoped org row does not exist", async () => {
    verifyApiKeyMock.mockResolvedValue(principalFor(ORG_GONE_ID))
    const res = await supertest(app.getHttpServer())
      .get("/v1/organization")
      .set("Authorization", "Bearer affk_live_gone")
      .expect(404)
    expect(res.body.error).toMatchObject({
      code: "not_found",
      error_type: "NOT_FOUND",
      message: "Organization not found",
    })
  })
})
