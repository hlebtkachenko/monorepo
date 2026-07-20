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
 * Contract tests for the org-onboarding surface
 * (`POST /v1/accounting/number-series`, `POST /v1/accounting/periods`,
 * `GET /v1/accounting/periods`).
 *
 * Same strategy as `accounts.controller.test.ts`: `withOrganization` is mocked
 * with an in-memory RLS emulation (the callback only ever sees rows whose
 * `organization_id` equals the GUC scope), and the domain scaffold primitives
 * are mocked to RECORD the tenant context they receive. The point these tests
 * pin: the CONTROLLER derives its tenant exclusively from the verified
 * principal — never from request input — for reads AND writes, and org A can
 * neither see nor create in org B. The genuine RLS policy + the real coupled
 * scaffold are proven against live Postgres in packages/db + org-provisioning.
 */

interface PeriodRow {
  id: string
  organization_id: string
  period_start: string
  period_end: string
  status: "OPEN" | "CLOSED"
  regime_code: string
  accounting_size_code: string | null
  accounting_currency: string
  fx_rate_policy: string | null
}

const state = vi.hoisted(() => ({
  periods: [] as PeriodRow[],
  scopeCalls: [] as Array<{ orgId: string; userId: string | null }>,
  numberSeriesCalls: [] as Array<{
    ctx: { organizationId: string; workspaceId: string }
    input: Record<string, unknown>
  }>,
  scaffoldCalls: [] as Array<{
    ctx: { organizationId: string; workspaceId: string; regime: string }
    params: Record<string, unknown>
  }>,
  resolveCalls: [] as Array<{ orgId: string; override?: string }>,
  /** When set, the next resolveOrgAccountingProfile call throws it. */
  resolveThrows: null as Error | null,
  /** When set, the next scaffoldAccountingPeriod call throws it. */
  scaffoldThrows: null as Error | null,
}))

vi.mock("@workspace/auth/api-key-verifier", () => ({
  verifyApiKey: vi.fn(),
}))

vi.mock("@workspace/db/schema", () => ({
  accounting_period: {
    id: "accounting_period.id",
    period_start: "accounting_period.period_start",
    period_end: "accounting_period.period_end",
    status: "accounting_period.status",
    regime_code: "accounting_period.regime_code",
    accounting_size_code: "accounting_period.accounting_size_code",
    accounting_currency: "accounting_period.accounting_currency",
    fx_rate_policy: "accounting_period.fx_rate_policy",
  },
}))

vi.mock("@workspace/accounting", () => ({
  createNumberSeries: vi.fn(
    async (
      _db: unknown,
      ctx: { organizationId: string; workspaceId: string },
      input: Record<string, unknown>,
    ) => {
      state.numberSeriesCalls.push({ ctx, input })
      return "0196f1de-0000-7000-8000-0000000000e1"
    },
  ),
  defaultSeriesCategory: vi.fn((_entityType: string, code: string) =>
    code === "FP" ? "RECEIVED_INVOICE" : null,
  ),
}))

vi.mock("@workspace/org-provisioning", () => {
  class ScaffoldValidationError extends Error {
    code: string
    constructor(message: string, code: string) {
      super(message)
      this.name = "ScaffoldValidationError"
      this.code = code
    }
  }
  return {
    ScaffoldValidationError,
    derivePeriodBounds: (input: {
      periodStart: string
      periodEnd?: string | null
    }) => ({
      periodStart: input.periodStart,
      periodEnd: input.periodEnd ?? "2025-12-31",
    }),
    resolveOrgAccountingProfile: vi.fn(
      async (_db: unknown, orgId: string, override?: string) => {
        state.resolveCalls.push({ orgId, override })
        if (state.resolveThrows) {
          const e = state.resolveThrows
          state.resolveThrows = null
          throw e
        }
        return {
          regime: "DOUBLE_ENTRY",
          requiresChart: true,
          fiscalYearStartMonth: 1,
        }
      },
    ),
    scaffoldAccountingPeriod: vi.fn(
      async (
        _db: unknown,
        ctx: {
          organizationId: string
          workspaceId: string
          regime: string
          requiresChart: boolean
        },
        params: Record<string, unknown>,
      ) => {
        state.scaffoldCalls.push({ ctx, params })
        if (state.scaffoldThrows) {
          const e = state.scaffoldThrows
          state.scaffoldThrows = null
          throw e
        }
        return {
          periodId: "0196f1de-0000-7000-8000-0000000000d9",
          chartId: "0196f1de-0000-7000-8000-0000000000c9",
          accountsSeeded: 218,
          seriesCreated: 8,
        }
      },
    ),
  }
})

vi.mock("@workspace/db", () => {
  const fieldOf = (marker: string) => marker.split(".")[1] as keyof PeriodRow
  const project = (
    row: PeriodRow,
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
    const visible = () =>
      state.periods.filter((p) => p.organization_id === orgId)
    const db = {
      select(projection: Record<string, string>) {
        const chain = {
          from: () => chain,
          orderBy: () =>
            Promise.resolve(visible().map((p) => project(p, projection))),
        }
        return chain
      },
    }
    return fn(db)
  }

  return { withOrganization }
})

const { verifyApiKey } = await import("@workspace/auth/api-key-verifier")
const {
  CreateNumberSeriesResponseSchema,
  CreateAccountingPeriodResponseSchema,
  ListAccountingPeriodsResponseSchema,
} = await import("@workspace/shared/api")
const { OnboardingController } = await import("./onboarding.controller")
const { ScaffoldValidationError } = await import("@workspace/org-provisioning")
const { DomainExceptionFilter } = await import("../domain-exception.filter")

const verifyApiKeyMock = vi.mocked(verifyApiKey)

const ORG_A = "0196f1de-0000-7000-8000-00000000000a"
const ORG_B = "0196f1de-0000-7000-8000-00000000000b"
const WS_A = "0196f1de-0000-7000-8000-0000000000a1"
const PERIOD_A = "0196f1de-0000-7000-8000-0000000000d1"
const PERIOD_B = "0196f1de-0000-7000-8000-0000000000d2"

function periodRow(over: Partial<PeriodRow> & { id: string }): PeriodRow {
  return {
    organization_id: ORG_A,
    period_start: "2025-01-01",
    period_end: "2025-12-31",
    status: "OPEN",
    regime_code: "DOUBLE_ENTRY",
    accounting_size_code: null,
    accounting_currency: "CZK",
    fx_rate_policy: null,
    ...over,
  }
}

function principalFor(orgId: string, scopes: readonly string[] = []) {
  return {
    userId: "0196f1de-0000-7000-8000-0000000000aa",
    organizationId: orgId,
    workspaceId: WS_A,
    scopes,
    actorKind: "human" as const,
  }
}

@Module({
  controllers: [OnboardingController],
  providers: [
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
  ],
})
class TestModule {}

describe("OnboardingController (/v1/accounting onboarding)", () => {
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
    state.periods = [
      periodRow({ id: PERIOD_A }),
      periodRow({ id: PERIOD_B, organization_id: ORG_B }),
    ]
    state.scopeCalls = []
    state.numberSeriesCalls = []
    state.scaffoldCalls = []
    state.resolveCalls = []
    state.resolveThrows = null
    state.scaffoldThrows = null
  })

  // ── auth ──────────────────────────────────────────────────────────────────

  it("401s creating a number series without an Authorization header", async () => {
    await supertest(app.getHttpServer())
      .post("/v1/accounting/number-series")
      .send({ entityType: "DOCUMENT", code: "FP", pattern: "FP{YYYY}{NNNN}" })
      .expect(401)
    expect(verifyApiKeyMock).not.toHaveBeenCalled()
  })

  // ── create number series ────────────────────────────────────────────────

  it("creates a number series scoped to the principal's org, never the body", async () => {
    verifyApiKeyMock.mockResolvedValue(
      principalFor(ORG_A, ["accounting:write"]),
    )
    const res = await supertest(app.getHttpServer())
      .post("/v1/accounting/number-series")
      .set("Authorization", "Bearer affk_live_a")
      .send({
        entityType: "DOCUMENT",
        code: "FP",
        pattern: "FP{YYYY}{NNNN}",
        organization_id: ORG_B,
        organizationId: ORG_B,
      })
      .expect(201)

    const parsed = CreateNumberSeriesResponseSchema.safeParse(res.body)
    expect(parsed.error?.issues ?? []).toEqual([])
    expect(res.body.series.code).toBe("FP")
    expect(res.body.series.nextNumber).toBe(1)

    // The domain fn received the principal's org — the smuggled id is stripped.
    expect(state.numberSeriesCalls).toHaveLength(1)
    expect(state.numberSeriesCalls[0]?.ctx.organizationId).toBe(ORG_A)
    expect(state.numberSeriesCalls[0]?.ctx.workspaceId).toBe(WS_A)
    expect(state.numberSeriesCalls[0]?.input).not.toHaveProperty(
      "organization_id",
    )
    // A canonical default DOCUMENT série is bucketed under its config category.
    expect(state.numberSeriesCalls[0]?.input.category).toBe("RECEIVED_INVOICE")
    expect(state.scopeCalls).toEqual([
      { orgId: ORG_A, userId: principalFor(ORG_A).userId },
    ])
  })

  it("403s creating a number series without the accounting:write scope", async () => {
    verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A, ["read"]))
    const res = await supertest(app.getHttpServer())
      .post("/v1/accounting/number-series")
      .set("Authorization", "Bearer affk_live_a")
      .send({ entityType: "DOCUMENT", code: "FP", pattern: "FP{YYYY}{NNNN}" })
      .expect(403)
    expect(res.body.error.code).toBe("forbidden")
    expect(state.numberSeriesCalls).toHaveLength(0)
  })

  it("rejects an invalid entityType via the zod pipe", async () => {
    verifyApiKeyMock.mockResolvedValue(
      principalFor(ORG_A, ["accounting:write"]),
    )
    const res = await supertest(app.getHttpServer())
      .post("/v1/accounting/number-series")
      .set("Authorization", "Bearer affk_live_a")
      .send({ entityType: "NONSENSE", code: "FP", pattern: "x" })
    expect([400, 422]).toContain(res.status)
  })

  // ── create period (coupled scaffold) ──────────────────────────────────────

  it("opens a period via the coupled scaffold, scoped to the principal's org", async () => {
    verifyApiKeyMock.mockResolvedValue(
      principalFor(ORG_A, ["accounting:write"]),
    )
    const res = await supertest(app.getHttpServer())
      .post("/v1/accounting/periods")
      .set("Authorization", "Bearer affk_live_a")
      .send({
        periodStart: "2025-01-01",
        periodEnd: "2025-12-31",
        organization_id: ORG_B,
      })
      .expect(201)

    const parsed = CreateAccountingPeriodResponseSchema.safeParse(res.body)
    expect(parsed.error?.issues ?? []).toEqual([])
    // The coupled scaffold ran: chart + seeded accounts + default series.
    expect(res.body.chartId).not.toBeNull()
    expect(res.body.accountsSeeded).toBe(218)
    expect(res.body.seriesCreated).toBe(8)
    expect(res.body.regimeCode).toBe("DOUBLE_ENTRY")

    expect(state.resolveCalls).toEqual([{ orgId: ORG_A, override: undefined }])
    expect(state.scaffoldCalls).toHaveLength(1)
    expect(state.scaffoldCalls[0]?.ctx.organizationId).toBe(ORG_A)
    expect(state.scaffoldCalls[0]?.ctx.workspaceId).toBe(WS_A)
  })

  it("403s opening a period without the accounting:write scope", async () => {
    verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A, ["read"]))
    await supertest(app.getHttpServer())
      .post("/v1/accounting/periods")
      .set("Authorization", "Bearer affk_live_a")
      .send({ periodStart: "2025-01-01" })
      .expect(403)
    expect(state.scaffoldCalls).toHaveLength(0)
  })

  it("422s when the regime is ambiguous (a statutory failure, not a 500)", async () => {
    verifyApiKeyMock.mockResolvedValue(
      principalFor(ORG_A, ["accounting:write"]),
    )
    state.resolveThrows = new ScaffoldValidationError(
      "regime is ambiguous for OSVC; pass regimeCode",
      "REGIME_AMBIGUOUS",
    )
    const res = await supertest(app.getHttpServer())
      .post("/v1/accounting/periods")
      .set("Authorization", "Bearer affk_live_a")
      .send({ periodStart: "2025-01-01" })
      .expect(422)
    expect(res.body.error.error_type).toBe("VALIDATION")
    expect(state.scaffoldCalls).toHaveLength(0)
  })

  it("409s when the requested period overlaps an existing one (F1 double-book guard)", async () => {
    verifyApiKeyMock.mockResolvedValue(
      principalFor(ORG_A, ["accounting:write"]),
    )
    state.scaffoldThrows = new ScaffoldValidationError(
      "the requested účetní období 2025-06-01…2026-05-31 overlaps an existing period 2025-01-01…2025-12-31",
      "PERIOD_OVERLAP",
    )
    const res = await supertest(app.getHttpServer())
      .post("/v1/accounting/periods")
      .set("Authorization", "Bearer affk_live_a")
      .send({ periodStart: "2025-06-01", periodEnd: "2026-05-31" })
      .expect(409)
    expect(res.body.error.code).toBe("conflict")
    expect(res.body.error.error_type).toBe("CONFLICT")
    // The scaffold was invoked (guard lives inside it) but nothing was created.
    expect(state.scaffoldCalls).toHaveLength(1)
  })

  // ── list periods ─────────────────────────────────────────────────────────

  it("lists only the caller's own periods, parsing the shared schema", async () => {
    verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
    const res = await supertest(app.getHttpServer())
      .get("/v1/accounting/periods")
      .set("Authorization", "Bearer affk_live_a")
      .expect(200)

    const parsed = ListAccountingPeriodsResponseSchema.safeParse(res.body)
    expect(parsed.error?.issues ?? []).toEqual([])
    expect(res.body.periods.map((p: { id: string }) => p.id)).toEqual([
      PERIOD_A,
    ])
    expect(JSON.stringify(res.body)).not.toContain(PERIOD_B)
  })

  it("scopes the period list to org B when the key belongs to org B", async () => {
    verifyApiKeyMock.mockResolvedValue(principalFor(ORG_B))
    const res = await supertest(app.getHttpServer())
      .get("/v1/accounting/periods")
      .set("Authorization", "Bearer affk_live_b")
      .expect(200)
    expect(res.body.periods.map((p: { id: string }) => p.id)).toEqual([
      PERIOD_B,
    ])
    expect(JSON.stringify(res.body)).not.toContain(PERIOD_A)
  })
})
