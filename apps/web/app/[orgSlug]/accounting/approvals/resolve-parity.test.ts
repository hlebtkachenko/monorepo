/**
 * [WP1 Task 1.5 · audit S9] Held-write resolve PARITY, against the PG18
 * testcontainer.
 *
 * Since WP1 Task 1.1 the web approvals action (`resolveHeldWrite`) and the public
 * API (`held-writes.controller.ts` `executeStored`) both delegate to ONE shared
 * dispatcher — `executeHeldWrite` (`@workspace/accounting`). So "web ↔ API land
 * identically" is guaranteed by construction, and the surviving risk is that a
 * gated op is NOT mapped in the dispatcher (a stuck-held row) or that the
 * dispatcher lands the wrong shape. This suite drives the REAL dispatcher against
 * a real DB for EVERY `GATED_WRITE_OPERATION_IDS` op:
 *
 *  - Exhaustiveness: the fixture map must equal `GATED_WRITE_OPERATION_IDS`, so a
 *    new gated op fails this test until it is mapped here AND in the dispatcher.
 *  - Landing: each op lands its real domain row(s) and returns the documented
 *    result shape.
 *  - Storno: a NEGATIVE-amount reviewer edit (§42 / ČÚS 001) is EXECUTED via
 *    `editedInput` and books, while the stored payload is what gets validated.
 *  - Stale: a stored payload that no longer validates 422s (throws
 *    `HELD_WRITE_STALE_MESSAGE`), on both surfaces, without touching the domain.
 *
 * The web-only author≠approver + role guards (S1/S2) live in `resolveHeldWrite`
 * BEFORE the dispatcher call; they are mirrored here against a real seeded row
 * (the repo convention — the real "use server" action needs a request scope, so
 * `edit-approve-e2e.test.ts` / `reject-reset.test.ts` replicate the branch too).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import postgres from "postgres"

import { GATED_WRITE_OPERATION_IDS } from "@workspace/shared/api"
import type {
  AccountNature,
  DebitCredit,
  DocumentInput,
  EventInput,
  OrgCtx,
} from "@workspace/accounting"

process.env["BETTER_AUTH_SECRET"] =
  process.env["BETTER_AUTH_SECRET"] ??
  "web-integration-test-secret-0123456789ab"

// Dynamically imported so DATABASE_URL is set by globalSetup before the db /
// accounting singletons bind (repo convention, AFF-119).
let withOrganization: (typeof import("@workspace/db"))["withOrganization"]
let executeRows: (typeof import("@workspace/db"))["executeRows"]
let sqlTag: (typeof import("@workspace/db"))["sql"]

let executeHeldWrite: (typeof import("@workspace/accounting"))["executeHeldWrite"]
let HELD_WRITE_STALE_MESSAGE: (typeof import("@workspace/accounting"))["HELD_WRITE_STALE_MESSAGE"]
let createPeriod: (typeof import("@workspace/accounting"))["createPeriod"]
let createChart: (typeof import("@workspace/accounting"))["createChart"]
let createAccount: (typeof import("@workspace/accounting"))["createAccount"]
let createNumberSeries: (typeof import("@workspace/accounting"))["createNumberSeries"]
let createEvent: (typeof import("@workspace/accounting"))["createEvent"]
let captureDocument: (typeof import("@workspace/accounting"))["captureDocument"]
let createAsset: (typeof import("@workspace/accounting"))["createAsset"]

let adminClient: (typeof import("@workspace/db/tests/fixtures"))["adminClient"]
let truncateAll: (typeof import("@workspace/db/tests/fixtures"))["truncateAll"]
let seedTwoOrganizations: (typeof import("@workspace/db/tests/fixtures"))["seedTwoOrganizations"]

let sql: postgres.Sql

beforeAll(async () => {
  ;({ adminClient, truncateAll, seedTwoOrganizations } =
    await import("@workspace/db/tests/fixtures"))
  ;({
    withOrganization,
    executeRows,
    sql: sqlTag,
  } = await import("@workspace/db"))
  ;({
    executeHeldWrite,
    HELD_WRITE_STALE_MESSAGE,
    createPeriod,
    createChart,
    createAccount,
    createNumberSeries,
    createEvent,
    captureDocument,
    createAsset,
  } = await import("@workspace/accounting"))
  sql = adminClient()
  await resetAll()
}, 60_000)

afterAll(async () => {
  await resetAll()
  await sql.end({ timeout: 5 })
})

beforeEach(async () => {
  await resetAll()
})

const ACCOUNTING_TABLES = [
  "account_period_balance",
  "monetary_period_summary",
  "open_item_settlement",
  "open_item",
  "posting_double_entry_line",
  "posting_monetary_line",
  "posting",
  "partial_record",
  "individual_record",
  "summary_record",
  "signature",
  "period_output",
  "depreciation_plan",
  "inventory_count",
  "asset",
  "accounting_event",
  "account",
  "chart_of_accounts",
  "number_series",
  "accounting_period",
] as const

async function resetAll(): Promise<void> {
  await sql.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL session_replication_role = replica`)
    for (const table of ACCOUNTING_TABLES) {
      await tx.unsafe(`DELETE FROM ${table}`)
    }
  })
  await truncateAll(sql)
}

// ---------------------------------------------------------------------------
// Seed — a DOUBLE_ENTRY org with every number series + one event, doc, and asset
// the six gated ops need to land against real rows.
// ---------------------------------------------------------------------------

const DEMO_ACCOUNTS: ReadonlyArray<{
  number: string
  name: string
  nature: AccountNature
  normalBalance: DebitCredit
}> = [
  {
    number: "321",
    name: "Dodavatelé",
    nature: "LIABILITY",
    normalBalance: "CREDIT",
  },
  {
    number: "518",
    name: "Ostatní služby",
    nature: "EXPENSE",
    normalBalance: "DEBIT",
  },
  {
    number: "548",
    name: "Provozní náklady",
    nature: "EXPENSE",
    normalBalance: "DEBIT",
  },
]

let seedSeq = 0

interface Scenario {
  organizationId: string
  workspaceId: string
  userId: string
  otherUserId: string
  periodId: string
  eventSeriesId: string
  documentSeriesId: string
  assetSeriesId: string
  inventorySeriesId: string
  summaryRecordId: string
  eventId: string
  assetId: string
  accounts: Record<string, string>
}

async function seedScenario(): Promise<Scenario> {
  const { workspaceId, orgAId, userAId, userBId } =
    await seedTwoOrganizations(sql)
  const ctx: OrgCtx = { organizationId: orgAId, workspaceId }
  const tag = ++seedSeq
  const seeded = await withOrganization(orgAId, userAId, async (db) => {
    const periodId = await createPeriod(db, ctx, {
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      regimeCode: "DOUBLE_ENTRY",
      accountingCurrency: "CZK",
    })
    const chartId = await createChart(db, ctx, { periodId })
    const accounts: Record<string, string> = {}
    for (const a of DEMO_ACCOUNTS) {
      accounts[a.number] = await createAccount(db, ctx, {
        chartId,
        periodId,
        number: a.number,
        name: a.name,
        nature: a.nature,
        normalBalance: a.normalBalance,
      })
    }
    const eventSeriesId = await createNumberSeries(db, ctx, {
      entityType: "EVENT",
      code: `EV${tag}`,
      pattern: "EV{YYYY}{NNNN}",
    })
    const documentSeriesId = await createNumberSeries(db, ctx, {
      entityType: "DOCUMENT",
      code: `FP${tag}`,
      pattern: "FP{YYYY}{NNNN}",
    })
    const assetSeriesId = await createNumberSeries(db, ctx, {
      entityType: "ASSET",
      code: `DHM${tag}`,
      pattern: "INV{NNNN}",
    })
    const inventorySeriesId = await createNumberSeries(db, ctx, {
      entityType: "INVENTORY_COUNT",
      code: `INV${tag}`,
      pattern: "IS{YYYY}{NNNN}",
    })
    const ev = await createEvent(db, ctx, {
      periodId,
      seriesId: eventSeriesId,
      description: "Služba dle faktury",
      occurredAt: "2026-06-01",
      responsibleUserId: userAId,
    } satisfies EventInput)
    const doc = await captureDocument(db, ctx, {
      periodId,
      seriesId: documentSeriesId,
      type: "RECEIVED_INVOICE",
      issuedAt: "2026-06-01",
      receivedDate: "2026-06-01",
      lines: [
        {
          eventId: ev.eventId,
          partials: [
            {
              baseAmount: "1000.00",
              vatMode: "STANDARD",
              vatRate: "21",
              vatAmount: "210.00",
              currencyCode: "CZK",
            },
          ],
        },
      ],
    } as unknown as DocumentInput)
    const asset = await createAsset(db, ctx, {
      seriesId: assetSeriesId,
      name: "Existující stroj",
      category: "TANGIBLE_DEPRECIABLE",
      accountNumber: "022",
      commissioningDate: "2026-01-01",
      acquisitionCost: "120000.00",
      responsibleUserId: userAId,
    })
    return {
      periodId,
      eventSeriesId,
      documentSeriesId,
      assetSeriesId,
      inventorySeriesId,
      summaryRecordId: doc.summaryRecordId,
      eventId: ev.eventId,
      assetId: asset.id,
      accounts,
    }
  })
  return {
    organizationId: orgAId,
    workspaceId,
    userId: userAId,
    otherUserId: userBId,
    ...seeded,
  }
}

const ENVELOPE = {
  confidence: 0.55,
  rationale: "Agent read it off the OCR'd document.",
  conversationId: "00000000-0000-7000-8000-0000000000aa",
}

/** A stored `input_json` per gated op + how to assert what it lands. */
type Fixture = {
  input: (s: Scenario) => Record<string, unknown>
  assertLanded: (s: Scenario, result: Record<string, unknown>) => Promise<void>
}

async function countRows(table: string, id: string): Promise<number> {
  const [row] = await sql<Array<{ n: string }>>`
    SELECT count(*)::text AS n FROM ${sql(table)} WHERE id = ${id}::uuid`
  return Number(row?.n ?? "0")
}

const FIXTURES: Record<string, Fixture> = {
  createAccountingEvent: {
    input: (s) => ({
      periodId: s.periodId,
      seriesId: s.eventSeriesId,
      description: "Nová služba",
      occurredAt: "2026-06-15",
      ...ENVELOPE,
    }),
    assertLanded: async (_s, result) => {
      expect(result["eventId"]).toBeTruthy()
      expect(result["designation"]).toBeTruthy()
      expect(
        await countRows("accounting_event", result["eventId"] as string),
      ).toBe(1)
    },
  },
  captureAccountingDocument: {
    input: (s) => ({
      periodId: s.periodId,
      seriesId: s.documentSeriesId,
      type: "INTERNAL",
      issuedAt: "2026-06-15",
      lines: [
        {
          eventId: s.eventId,
          partials: [
            {
              baseAmount: "500.00",
              vatMode: "OUTSIDE_VAT",
              currencyCode: "CZK",
            },
          ],
        },
      ],
      ...ENVELOPE,
    }),
    assertLanded: async (_s, result) => {
      expect(result["summaryRecordId"]).toBeTruthy()
      expect(
        await countRows("summary_record", result["summaryRecordId"] as string),
      ).toBe(1)
    },
  },
  createAccountingPosting: {
    input: (s) => ({
      kind: "double",
      entry: {
        periodId: s.periodId,
        summaryRecordId: s.summaryRecordId,
        accountingEventId: s.eventId,
        postingDate: "2026-06-15",
        lines: [
          { accountId: s.accounts["518"], side: "DEBIT", amount: "1000.00" },
          { accountId: s.accounts["321"], side: "CREDIT", amount: "1000.00" },
        ],
      },
      ...ENVELOPE,
    }),
    assertLanded: async (_s, result) => {
      expect(result["postingId"]).toBeTruthy()
      expect(await countRows("posting", result["postingId"] as string)).toBe(1)
    },
  },
  createAsset: {
    input: (s) => ({
      periodId: s.periodId,
      seriesId: s.assetSeriesId,
      name: "Notebook Dell",
      category: "TANGIBLE_DEPRECIABLE",
      accountNumber: "022",
      commissioningDate: "2026-06-15",
      acquisitionCost: "45000.00",
      ...ENVELOPE,
    }),
    assertLanded: async (_s, result) => {
      expect(result["assetId"]).toBeTruthy()
      expect(result["designation"]).toBeTruthy()
      expect(await countRows("asset", result["assetId"] as string)).toBe(1)
    },
  },
  createDepreciationPlan: {
    input: (s) => ({
      periodId: s.periodId,
      assetId: s.assetId,
      method: "STRAIGHT_LINE",
      startDate: "2026-06-15",
      monthlyAmount: "1250.00",
      expenseAccountNumber: "551",
      accumulatedAccountNumber: "082",
      usefulLifeMonths: 60,
      ...ENVELOPE,
    }),
    assertLanded: async (_s, result) => {
      expect(result["depreciationPlanId"]).toBeTruthy()
      expect(
        await countRows(
          "depreciation_plan",
          result["depreciationPlanId"] as string,
        ),
      ).toBe(1)
    },
  },
  createInventoryCount: {
    input: (s) => ({
      periodId: s.periodId,
      seriesId: s.inventorySeriesId,
      countDate: "2026-12-31",
      description: "Roční inventura",
      ...ENVELOPE,
    }),
    assertLanded: async (_s, result) => {
      expect(result["inventoryCountId"]).toBeTruthy()
      expect(result["designation"]).toBeTruthy()
      expect(
        await countRows(
          "inventory_count",
          result["inventoryCountId"] as string,
        ),
      ).toBe(1)
    },
  },
}

async function dispatch(
  s: Scenario,
  toolName: string,
  input: Record<string, unknown>,
  editedInput?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return withOrganization(s.organizationId, s.userId, (db) =>
    executeHeldWrite(
      db,
      {
        organizationId: s.organizationId,
        workspaceId: s.workspaceId,
        inboxId: null,
      },
      toolName,
      input,
      s.userId,
      editedInput,
    ),
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("held-write resolve parity — shared dispatcher lands every gated op", () => {
  it("[exhaustiveness] the fixture map equals GATED_WRITE_OPERATION_IDS", () => {
    // A new gated op added to the const without a fixture here fails immediately,
    // and a fixture with no dispatcher case fails the per-op test below.
    expect(Object.keys(FIXTURES).sort()).toEqual(
      [...GATED_WRITE_OPERATION_IDS].sort(),
    )
  })

  for (const toolName of GATED_WRITE_OPERATION_IDS) {
    it(`lands ${toolName} through executeHeldWrite (the single web↔API path)`, async () => {
      const s = await seedScenario()
      const fixture = FIXTURES[toolName]!
      const result = await dispatch(s, toolName, fixture.input(s))
      await fixture.assertLanded(s, result)
    })
  }

  it("throws HELD_WRITE_STALE_MESSAGE for a stored payload that no longer validates (S5)", async () => {
    const s = await seedScenario()
    const stale = FIXTURES["createAccountingEvent"]!.input(s)
    delete stale["seriesId"] // now fails CreateAccountingEventRequestSchema
    await expect(dispatch(s, "createAccountingEvent", stale)).rejects.toThrow(
      HELD_WRITE_STALE_MESSAGE,
    )
  })

  it("[storno] executes a NEGATIVE-amount reviewer edit while validating the stored payload (§42 / ČÚS 001)", async () => {
    const s = await seedScenario()
    const stored = FIXTURES["createAccountingPosting"]!.input(s)
    // The reviewer edit negates both lines — schema-INVALID (unsigned Decimal) but
    // domain-valid (balanced storno). It must EXECUTE (never safeParse'd), while the
    // always-valid stored payload is what closes S5.
    const edited = {
      ...stored,
      entry: {
        ...(stored["entry"] as Record<string, unknown>),
        lines: [
          { accountId: s.accounts["518"], side: "DEBIT", amount: "-1000.00" },
          { accountId: s.accounts["321"], side: "CREDIT", amount: "-1000.00" },
        ],
      },
    }
    const result = await dispatch(s, "createAccountingPosting", stored, edited)
    const lines = await sql<Array<{ side: string; amount: string }>>`
      SELECT side, amount::text AS amount FROM posting_double_entry_line
      WHERE posting_id = ${result["postingId"] as string}::uuid ORDER BY id`
    expect(lines).toHaveLength(2)
    expect(Number(lines.find((l) => l.side === "DEBIT")!.amount)).toBe(-1000)
    expect(Number(lines.find((l) => l.side === "CREDIT")!.amount)).toBe(-1000)
  })
})

// ---------------------------------------------------------------------------
// S1/S2 web guards — mirrored from resolveHeldWrite (actions.ts) against a real
// seeded row, per the repo replica convention (the "use server" action needs a
// request scope). The API side of these guards is tested end-to-end against the
// real controller in `apps/api/.../held-writes.controller.test.ts`.
// ---------------------------------------------------------------------------

const ROLE_DENY_ERROR = "Nemáte oprávnění vyřizovat návrhy."
const AUTHOR_ERROR =
  "Návrh nemůže schválit jeho autor; musí ho posoudit jiný uživatel."

/** Faithful mirror of resolveHeldWrite's authz guards (role gate + author≠approver). */
async function resolveGuards(
  s: Scenario,
  ctx: { userId: string; role: string },
  toolCallLogId: string,
  action: "approve" | "reject",
): Promise<{ ok: boolean; error?: string }> {
  if (ctx.role !== "owner" && ctx.role !== "admin" && ctx.role !== "member") {
    return { ok: false, error: ROLE_DENY_ERROR }
  }
  return withOrganization(s.organizationId, ctx.userId, async (db) => {
    const rows = await executeRows<{
      approved_by_user_id: string | null
      user_id: string | null
    }>(
      db,
      sqlTag`select approved_by_user_id::text as approved_by_user_id,
                    user_id::text as user_id
             from tool_call_log where id = ${toolCallLogId}::uuid for update`,
    )
    const row = rows[0]
    if (!row) return { ok: false, error: "not found" }
    if (row.approved_by_user_id !== null) {
      return { ok: false, error: "already resolved" }
    }
    if (action === "approve" && row.user_id === ctx.userId) {
      return { ok: false, error: AUTHOR_ERROR }
    }
    return { ok: true }
  })
}

async function seedHeldEvent(s: Scenario, authorId: string): Promise<string> {
  const [row] = await sql<Array<{ id: string }>>`
    INSERT INTO tool_call_log (
      organization_id, tool_name, idempotency_key, actor_kind, user_id,
      input_json, output_json, auto_applied, approved_by_user_id
    ) VALUES (
      ${s.organizationId}::uuid, 'createAccountingEvent',
      ${"key-" + Math.random().toString(36).slice(2)}, 'ai_on_behalf', ${authorId}::uuid,
      ${sql.json(FIXTURES["createAccountingEvent"]!.input(s) as never)},
      ${sql.json({ status: "held", payloadHash: "h" })}, false, null
    ) RETURNING id`
  if (!row) throw new Error("held event insert failed")
  return row.id
}

describe("held-write resolve guards (S1/S2, web)", () => {
  it("[S2] a guest / agent role is denied before any DB read", async () => {
    const s = await seedScenario()
    const logId = await seedHeldEvent(s, s.userId)
    for (const role of ["guest", "agent"]) {
      const res = await resolveGuards(
        s,
        { userId: s.otherUserId, role },
        logId,
        "approve",
      )
      expect(res).toEqual({ ok: false, error: ROLE_DENY_ERROR })
    }
  })

  it("[S1] the AUTHOR cannot APPROVE their own held write, but a different user can", async () => {
    const s = await seedScenario()
    const logId = await seedHeldEvent(s, s.userId) // authored by userId

    const selfApprove = await resolveGuards(
      s,
      { userId: s.userId, role: "owner" },
      logId,
      "approve",
    )
    expect(selfApprove).toEqual({ ok: false, error: AUTHOR_ERROR })

    const otherApprove = await resolveGuards(
      s,
      { userId: s.otherUserId, role: "owner" },
      logId,
      "approve",
    )
    expect(otherApprove.ok).toBe(true)
  })

  it("[S1] the AUTHOR MAY still REJECT their own write (reject is not a bypass)", async () => {
    const s = await seedScenario()
    const logId = await seedHeldEvent(s, s.userId)
    const res = await resolveGuards(
      s,
      { userId: s.userId, role: "owner" },
      logId,
      "reject",
    )
    expect(res.ok).toBe(true)
  })
})
