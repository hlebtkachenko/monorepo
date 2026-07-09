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
 * Contract tests for `/v1/invoices`.
 *
 * Reads: `withOrganization` is mocked with an in-memory RLS emulation — each
 * table's rows are pre-filtered to the GUC scope (the first `withOrganization`
 * arg), mirroring `organization_isolation`. Proves the CONTROLLER derives its
 * tenant only from the verified principal, that a cross-tenant invoice is 404,
 * and that filters + the header/line/partial mapping are correct.
 *
 * Create: the server safety gate (`runGatedWrite`) and `captureDocument` are
 * mocked — the real gate is proven in the accounting-writes suites. Here we pin
 * the CONTROLLER's own contract: `direction` maps to the invoice
 * summary_record_type, tenant/user come from the principal (never the body),
 * the write is scope-gated, and applied/held map to 201/202.
 */

interface SummaryRow {
  id: string
  organization_id: string
  type: string
  period_id: string
  designation: string
  sequence_number: number
  issued_at: Date
  tax_point_date: string | null
  received_date: string | null
  rounding_amount: string
  created_at: Date
}
interface LineRow {
  id: string
  organization_id: string
  summary_record_id: string
  accounting_event_id: string
  description: string | null
  created_at: Date
}
interface PartialRow {
  id: string
  organization_id: string
  individual_record_id: string
  base_amount: string
  vat_rate: string | null
  vat_amount: string
  vat_mode: string
  vat_jurisdiction: string | null
  vat_deductible: boolean
  currency_code: string
  base_in_accounting_currency: string
  vat_in_accounting_currency: string
  quantity: string | null
  measure_unit: string | null
  unit_price: string | null
  created_at: Date
}
interface AggRow {
  invoiceId: string
  organization_id: string
  totalBase: string
  totalVat: string
  lineCount: number
}

const state = vi.hoisted(() => ({
  summaryRows: [] as SummaryRow[],
  lineRows: [] as LineRow[],
  partialRows: [] as PartialRow[],
  aggRows: [] as AggRow[],
  scopeCalls: [] as Array<{ orgId: string; userId: string | null }>,
  gateOpts: null as Record<string, unknown> | null,
  captureInputs: [] as Array<Record<string, unknown>>,
}))

vi.mock("@workspace/auth/api-key-verifier", () => ({ verifyApiKey: vi.fn() }))

const marker =
  (table: string) =>
  (cols: string[]): Record<string, string> =>
    Object.fromEntries(cols.map((c) => [c, `${table}.${c}`]))

vi.mock("@workspace/db/schema", () => ({
  summary_record: marker("summary_record")([
    "id",
    "type",
    "period_id",
    "designation",
    "sequence_number",
    "issued_at",
    "tax_point_date",
    "received_date",
    "rounding_amount",
    "created_at",
  ]),
  individual_record: marker("individual_record")([
    "id",
    "summary_record_id",
    "accounting_event_id",
    "description",
    "created_at",
  ]),
  partial_record: marker("partial_record")([
    "id",
    "individual_record_id",
    "base_amount",
    "vat_rate",
    "vat_amount",
    "vat_mode",
    "vat_jurisdiction",
    "vat_deductible",
    "currency_code",
    "base_in_accounting_currency",
    "vat_in_accounting_currency",
    "quantity",
    "measure_unit",
    "unit_price",
    "created_at",
  ]),
}))

type Pred =
  | { column: string; value: unknown }
  | { and: Pred[] }
  | { inArray: { column: string; values: unknown[] } }

vi.mock("@workspace/db", () => {
  const eq = (column: unknown, value: unknown) => ({ column, value })
  const and = (...preds: Pred[]) => ({ and: preds })
  const inArray = (column: unknown, values: unknown[]) => ({
    inArray: { column, values },
  })
  const sql = (strings: TemplateStringsArray) => ({ sql: strings.join("") })

  const fieldOf = (marker: string): string => marker.split(".")[1] ?? ""
  const matches = (
    row: Record<string, unknown>,
    pred: Pred | null,
  ): boolean => {
    if (!pred) return true
    if ("and" in pred) return pred.and.every((p) => matches(row, p))
    if ("inArray" in pred) {
      return pred.inArray.values.includes(
        row[fieldOf(pred.inArray.column as string)],
      )
    }
    return row[fieldOf(pred.column as string)] === pred.value
  }
  const project = (
    row: Record<string, unknown>,
    projection: Record<string, string>,
  ): Record<string, unknown> => {
    const out: Record<string, unknown> = {}
    for (const [key, mk] of Object.entries(projection)) {
      out[key] = row[fieldOf(mk)]
    }
    return out
  }

  const withOrganization = async (
    orgId: string,
    userId: string | null,
    fn: (db: unknown) => Promise<unknown>,
  ) => {
    state.scopeCalls.push({ orgId, userId })
    const asRows = (rs: unknown[]) => rs as Record<string, unknown>[]
    const summary = asRows(
      state.summaryRows.filter((r) => r.organization_id === orgId),
    )
    const lines = asRows(
      state.lineRows.filter((r) => r.organization_id === orgId),
    )
    const partials = asRows(
      state.partialRows.filter((r) => r.organization_id === orgId),
    )
    const aggs = state.aggRows.filter((r) => r.organization_id === orgId)

    const db = {
      select(projection: Record<string, string>) {
        let table = ""
        let predicate: Pred | null = null
        let joined = false
        const rowsFor = (): Record<string, unknown>[] => {
          if (table === "summary_record") {
            return summary
              .filter((r) => matches(r, predicate))
              .map((r) => project(r, projection))
          }
          if (table === "individual_record" && joined) {
            // aggregate branch — projection holds sql objects; return canned aggs
            return aggs
              .filter((r) =>
                matches({ summary_record_id: r.invoiceId }, predicate),
              )
              .map((r) => ({
                invoiceId: r.invoiceId,
                totalBase: r.totalBase,
                totalVat: r.totalVat,
                lineCount: r.lineCount,
              }))
          }
          if (table === "individual_record") {
            return lines
              .filter((r) => matches(r, predicate))
              .map((r) => project(r, projection))
          }
          return partials
            .filter((r) => matches(r, predicate))
            .map((r) => project(r, projection))
        }
        const chain = {
          from: (t: Record<string, string>) => {
            table = fieldOf(Object.values(t)[0]!)
              ? Object.values(t)[0]!.split(".")[0]!
              : ""
            return chain
          },
          innerJoin: () => {
            joined = true
            return chain
          },
          leftJoin: () => {
            joined = true
            return chain
          },
          where: (p: Pred | null) => {
            predicate = p ?? null
            return chain
          },
          groupBy: () => Promise.resolve(rowsFor()),
          orderBy: () => chain,
          limit: (n: number) => Promise.resolve(rowsFor().slice(0, n)),
          then: (resolve: (v: unknown) => unknown) => resolve(rowsFor()),
        }
        return chain
      },
      update() {
        let values: Record<string, unknown> = {}
        return {
          set(next: Record<string, unknown>) {
            values = next
            return this
          },
          where(predicate: Pred) {
            for (const row of state.summaryRows) {
              if (
                row.organization_id === orgId &&
                matches(row as unknown as Record<string, unknown>, predicate)
              ) {
                Object.assign(row, values)
              }
            }
            return Promise.resolve()
          },
        }
      },
    }
    return fn(db)
  }

  return { eq, and, inArray, sql, withOrganization }
})

vi.mock("@workspace/accounting", () => ({
  captureDocument: vi.fn(
    async (_db: unknown, _ctx: unknown, input: Record<string, unknown>) => {
      state.captureInputs.push(input)
      return {
        summaryRecordId: "0196f1de-0000-7000-8000-0000000ffff1",
        designation: "FP2025-00099",
        sequenceNumber: 99,
        lines: [],
      }
    },
  ),
}))

vi.mock("../accounting/accounting-veto", () => ({
  deriveCaptureVeto: vi.fn(() => ({ held: false, signals: [] })),
}))

vi.mock("../accounting/accounting-writes.gate", () => ({
  runGatedWrite: vi.fn(async (opts: Record<string, unknown>) => {
    state.gateOpts = opts
    const run = opts.run as (
      db: unknown,
      ctx: { organizationId: string; workspaceId: string },
    ) => Promise<unknown>
    const applied = opts.applied as (r: unknown) => Record<string, unknown>
    const principal = opts.principal as {
      organizationId: string
      workspaceId: string
    }
    const captured = await run(
      {},
      {
        organizationId: principal.organizationId,
        workspaceId: principal.workspaceId,
      },
    )
    return {
      httpStatus: 201,
      body: { status: "applied", ...applied(captured) },
      replayed: false,
    }
  }),
}))

const { verifyApiKey } = await import("@workspace/auth/api-key-verifier")
const accounting = await import("@workspace/accounting")
const { ListInvoicesResponseSchema, GetInvoiceResponseSchema } =
  await import("@workspace/shared/api")
const { InvoicesController } = await import("./invoices.controller")
const { DomainExceptionFilter } = await import("../domain-exception.filter")

const verifyApiKeyMock = vi.mocked(verifyApiKey)
const captureDocumentMock = vi.mocked(accounting.captureDocument)

const ORG_A = "0196f1de-0000-7000-8000-00000000000a"
const ORG_B = "0196f1de-0000-7000-8000-00000000000b"
const PERIOD_1 = "0196f1de-0000-7000-8000-0000000000d1"
const PERIOD_2 = "0196f1de-0000-7000-8000-0000000000d2"
const INV_RECV = "0196f1de-0000-7000-8000-000000000fa1"
const INV_ISSUED = "0196f1de-0000-7000-8000-000000000fa2"
const INV_B = "0196f1de-0000-7000-8000-000000000fb1"
const EVENT_ID = "0196f1de-0000-7000-8000-0000000000e1"
const SERIES_ID = "0196f1de-0000-7000-8000-0000000000c9"

function principalFor(orgId: string, scopes: readonly string[] = []) {
  return {
    userId: "0196f1de-0000-7000-8000-0000000000aa",
    organizationId: orgId,
    workspaceId: "0196f1de-0000-7000-8000-0000000000bb",
    scopes,
    actorKind: "human" as const,
  }
}

@Module({
  controllers: [InvoicesController],
  providers: [
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
  ],
})
class TestModule {}

describe("InvoicesController (/v1/invoices)", () => {
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
    captureDocumentMock.mockClear()
    const now = new Date("2025-03-14T09:00:00.000Z")
    state.summaryRows = [
      {
        id: INV_RECV,
        organization_id: ORG_A,
        type: "RECEIVED_INVOICE",
        period_id: PERIOD_1,
        designation: "FP2025-1",
        sequence_number: 1,
        issued_at: now,
        tax_point_date: "2025-03-14",
        received_date: "2025-03-16",
        rounding_amount: "0.00",
        created_at: now,
      },
      {
        id: INV_ISSUED,
        organization_id: ORG_A,
        type: "ISSUED_INVOICE",
        period_id: PERIOD_2,
        designation: "FV2025-1",
        sequence_number: 1,
        issued_at: now,
        tax_point_date: "2025-03-14",
        received_date: null,
        rounding_amount: "0.00",
        created_at: now,
      },
      {
        id: INV_B,
        organization_id: ORG_B,
        type: "RECEIVED_INVOICE",
        period_id: PERIOD_1,
        designation: "FP2025-1",
        sequence_number: 1,
        issued_at: now,
        tax_point_date: null,
        received_date: null,
        rounding_amount: "0.00",
        created_at: now,
      },
    ]
    state.lineRows = [
      {
        id: "0196f1de-0000-7000-8000-0000000010e1",
        organization_id: ORG_A,
        summary_record_id: INV_RECV,
        accounting_event_id: EVENT_ID,
        description: "Consulting",
        created_at: now,
      },
    ]
    state.partialRows = [
      {
        id: "0196f1de-0000-7000-8000-00000000a171",
        organization_id: ORG_A,
        individual_record_id: "0196f1de-0000-7000-8000-0000000010e1",
        base_amount: "12100.00",
        vat_rate: "21.00",
        vat_amount: "2541.00",
        vat_mode: "STANDARD",
        vat_jurisdiction: "DOMESTIC",
        vat_deductible: true,
        currency_code: "CZK",
        base_in_accounting_currency: "12100.00",
        vat_in_accounting_currency: "2541.00",
        quantity: "1",
        measure_unit: "ks",
        unit_price: "12100.00",
        created_at: now,
      },
    ]
    state.aggRows = [
      {
        invoiceId: INV_RECV,
        organization_id: ORG_A,
        totalBase: "12100.00",
        totalVat: "2541.00",
        lineCount: 1,
      },
    ]
    state.scopeCalls = []
    state.gateOpts = null
    state.captureInputs = []
  })

  it("401s without an Authorization header", async () => {
    await supertest(app.getHttpServer()).get("/v1/invoices").expect(401)
  })

  it("lists only the caller's invoices with rolled-up totals", async () => {
    verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
    const res = await supertest(app.getHttpServer())
      .get("/v1/invoices")
      .set("Authorization", "Bearer affk_live_a")
      .expect(200)
    expect(ListInvoicesResponseSchema.safeParse(res.body).success).toBe(true)
    expect(res.body.invoices.map((i: { id: string }) => id(i)).sort()).toEqual(
      [INV_RECV, INV_ISSUED].sort(),
    )
    expect(JSON.stringify(res.body)).not.toContain(INV_B)
    const recv = res.body.invoices.find(
      (i: { id: string }) => i.id === INV_RECV,
    )
    expect(recv).toMatchObject({
      direction: "received",
      type: "RECEIVED_INVOICE",
      totalBase: "12100.00",
      totalVat: "2541.00",
      lineCount: 1,
      taxPointDate: "2025-03-14",
      receivedDate: "2025-03-16",
    })
  })

  it("filters by direction", async () => {
    verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
    const res = await supertest(app.getHttpServer())
      .get("/v1/invoices")
      .query({ direction: "issued" })
      .set("Authorization", "Bearer affk_live_a")
      .expect(200)
    expect(res.body.invoices).toHaveLength(1)
    expect(res.body.invoices[0].id).toBe(INV_ISSUED)
  })

  it("filters by periodId", async () => {
    verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
    const res = await supertest(app.getHttpServer())
      .get("/v1/invoices")
      .query({ periodId: PERIOD_1 })
      .set("Authorization", "Bearer affk_live_a")
      .expect(200)
    expect(res.body.invoices).toHaveLength(1)
    expect(res.body.invoices[0].id).toBe(INV_RECV)
  })

  it("derives the tenant scope from the principal, never from query input", async () => {
    verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
    await supertest(app.getHttpServer())
      .get("/v1/invoices")
      .query({ organization_id: ORG_B })
      .set("Authorization", "Bearer affk_live_a")
      .expect(200)
    expect(state.scopeCalls[0]).toEqual({
      orgId: ORG_A,
      userId: principalFor(ORG_A).userId,
    })
  })

  it("gets a single invoice with its lines and partials", async () => {
    verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
    const res = await supertest(app.getHttpServer())
      .get(`/v1/invoices/${INV_RECV}`)
      .set("Authorization", "Bearer affk_live_a")
      .expect(200)
    expect(GetInvoiceResponseSchema.safeParse(res.body).success).toBe(true)
    expect(res.body.invoice.id).toBe(INV_RECV)
    expect(res.body.invoice.lines).toHaveLength(1)
    expect(res.body.invoice.lines[0].partials[0]).toMatchObject({
      baseAmount: "12100.00",
      vatAmount: "2541.00",
      vatMode: "STANDARD",
      currencyCode: "CZK",
    })
  })

  it("corrects unresolved invoice legal dates within the principal tenant", async () => {
    verifyApiKeyMock.mockResolvedValue(
      principalFor(ORG_A, ["accounting:write"]),
    )
    const res = await supertest(app.getHttpServer())
      .patch(`/v1/invoices/${INV_RECV}/legal-dates`)
      .set("Authorization", "Bearer affk_live_a")
      .send({ taxPointDate: "2025-04-01", receivedDate: "2025-04-03" })
      .expect(200)

    expect(res.body.invoice).toMatchObject({
      id: INV_RECV,
      taxPointDate: "2025-04-01",
      receivedDate: "2025-04-03",
    })
  })

  it("rejects receipt evidence on an issued invoice", async () => {
    verifyApiKeyMock.mockResolvedValue(
      principalFor(ORG_A, ["accounting:write"]),
    )
    await supertest(app.getHttpServer())
      .patch(`/v1/invoices/${INV_ISSUED}/legal-dates`)
      .set("Authorization", "Bearer affk_live_a")
      .send({ receivedDate: "2025-04-03" })
      .expect(400)
  })

  it("does not expose a cross-tenant invoice through legal-date correction", async () => {
    verifyApiKeyMock.mockResolvedValue(
      principalFor(ORG_A, ["accounting:write"]),
    )
    await supertest(app.getHttpServer())
      .patch(`/v1/invoices/${INV_B}/legal-dates`)
      .set("Authorization", "Bearer affk_live_a")
      .send({ taxPointDate: "2025-04-01" })
      .expect(404)
  })

  it("404s a same-tenant doklad id that is not invoice-typed", async () => {
    const bank = "0196f1de-0000-7000-8000-0000000ba0a1"
    state.summaryRows.push({
      id: bank,
      organization_id: ORG_A,
      type: "BANK_STATEMENT",
      period_id: PERIOD_1,
      designation: "BV2025-1",
      sequence_number: 1,
      issued_at: new Date("2025-03-14T09:00:00.000Z"),
      tax_point_date: null,
      received_date: null,
      rounding_amount: "0.00",
      created_at: new Date("2025-03-14T09:00:00.000Z"),
    })
    verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
    await supertest(app.getHttpServer())
      .get(`/v1/invoices/${bank}`)
      .set("Authorization", "Bearer affk_live_a")
      .expect(404)
  })

  it("404s (not 403) on a cross-tenant invoice id", async () => {
    verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A))
    const res = await supertest(app.getHttpServer())
      .get(`/v1/invoices/${INV_B}`)
      .set("Authorization", "Bearer affk_live_a")
      .expect(404)
    expect(res.body.error).toMatchObject({
      code: "not_found",
      error_type: "NOT_FOUND",
    })
  })

  const validBody = (direction: "received" | "issued") => ({
    direction,
    periodId: PERIOD_1,
    seriesId: SERIES_ID,
    issuedAt: "2025-03-14",
    taxPointDate: "2025-03-14",
    ...(direction === "received" ? { receivedDate: "2025-03-16" } : {}),
    lines: [
      {
        eventId: EVENT_ID,
        partials: [
          { baseAmount: "100.00", vatMode: "STANDARD", currencyCode: "CZK" },
        ],
      },
    ],
    confidence: 0.95,
    rationale: "Domestic service invoice.",
  })

  it("creates a RECEIVED invoice: pins the type, injects the principal, 201", async () => {
    verifyApiKeyMock.mockResolvedValue(
      principalFor(ORG_A, ["accounting:write"]),
    )
    const res = await supertest(app.getHttpServer())
      .post("/v1/invoices")
      .set("Authorization", "Bearer affk_live_a")
      .set("Idempotency-Key", "idem-1")
      .send(validBody("received"))
      .expect(201)
    expect(res.body).toMatchObject({
      status: "applied",
      invoiceId: expect.any(String),
    })
    expect(state.captureInputs[0]).toMatchObject({
      type: "RECEIVED_INVOICE",
      taxPointDate: "2025-03-14",
      receivedDate: "2025-03-16",
    })
    expect(state.captureInputs[0]).not.toHaveProperty("direction")
    expect(state.captureInputs[0]).not.toHaveProperty("confidence")
    const opts = state.gateOpts as {
      operationId: string
      idempotencyKey: string
      periodId: string
      holdAmounts: string[]
      deriveVeto: unknown
      principal: { organizationId: string }
    }
    expect(opts.operationId).toBe("createInvoice")
    expect(opts.principal.organizationId).toBe(ORG_A)
    expect(opts.idempotencyKey).toBe("idem-1")
    expect(opts.periodId).toBe(PERIOD_1)
    expect(Array.isArray(opts.holdAmounts) && opts.holdAmounts.length > 0).toBe(
      true,
    )
    expect(typeof opts.deriveVeto).toBe("function")
  })

  it("creates an ISSUED invoice: maps direction to ISSUED_INVOICE", async () => {
    verifyApiKeyMock.mockResolvedValue(
      principalFor(ORG_A, ["accounting:write"]),
    )
    await supertest(app.getHttpServer())
      .post("/v1/invoices")
      .set("Authorization", "Bearer affk_live_a")
      .set("Idempotency-Key", "idem-2")
      .send(validBody("issued"))
      .expect(201)
    expect(state.captureInputs[0]).toMatchObject({ type: "ISSUED_INVOICE" })
  })

  it("strips tenant identifiers smuggled in the create body", async () => {
    verifyApiKeyMock.mockResolvedValue(
      principalFor(ORG_A, ["accounting:write"]),
    )
    await supertest(app.getHttpServer())
      .post("/v1/invoices")
      .set("Authorization", "Bearer affk_live_a")
      .set("Idempotency-Key", "idem-3")
      .send({
        ...validBody("received"),
        organization_id: ORG_B,
        workspace_id: ORG_B,
      })
      .expect(201)
    expect(state.captureInputs[0]).not.toHaveProperty("organization_id")
    expect(state.captureInputs[0]).not.toHaveProperty("workspace_id")
  })

  it("403s a create without the accounting:write scope", async () => {
    verifyApiKeyMock.mockResolvedValue(principalFor(ORG_A, ["read"]))
    const res = await supertest(app.getHttpServer())
      .post("/v1/invoices")
      .set("Authorization", "Bearer affk_live_a")
      .set("Idempotency-Key", "idem-4")
      .send(validBody("received"))
      .expect(403)
    expect(res.body.error.code).toBe("forbidden")
    expect(state.gateOpts).toBeNull()
  })

  it("rejects a create with an invalid direction", async () => {
    verifyApiKeyMock.mockResolvedValue(
      principalFor(ORG_A, ["accounting:write"]),
    )
    const res = await supertest(app.getHttpServer())
      .post("/v1/invoices")
      .set("Authorization", "Bearer affk_live_a")
      .set("Idempotency-Key", "idem-5")
      .send({ ...validBody("received"), direction: "sideways" })
    expect([400, 422]).toContain(res.status)
  })

  it("rejects a received date on an issued invoice", async () => {
    verifyApiKeyMock.mockResolvedValue(
      principalFor(ORG_A, ["accounting:write"]),
    )
    const res = await supertest(app.getHttpServer())
      .post("/v1/invoices")
      .set("Authorization", "Bearer affk_live_a")
      .set("Idempotency-Key", "idem-6")
      .send({ ...validBody("issued"), receivedDate: "2025-03-16" })
    expect([400, 422]).toContain(res.status)
    expect(state.gateOpts).toBeNull()
  })
})

function id(i: { id: string }): string {
  return i.id
}
