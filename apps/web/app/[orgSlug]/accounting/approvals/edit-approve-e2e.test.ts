/**
 * [M1.7 · Advisor #638 F2] End-to-end coverage for edit-before-approve, closing
 * the loop the pure-merge suite (`edit-approve.test.ts`) stops short of: it
 * drives the REAL domain posting call (`post` → `postDoubleEntry`), so an edited
 * held write is proved to BOOK the reviewer's corrected payload — and an invalid
 * edit is proved to keep the row held.
 *
 * Replicates the exact primitives `resolveHeldWrite`'s approve branch runs
 * (actions.ts): read + already-resolved guard, edit schema gate, real
 * `applyHeldWriteEdit` + `stripGateEnvelope`, `lockPeriodInTx`, real `post`, real
 * `updateToolCallLogOutput` — all in ONE `withOrganization` transaction with the
 * same outer try/catch, against the PG18 testcontainer (repo convention: see
 * `reject-reset.test.ts`, rather than the full Server Action which needs a
 * request scope). The single-transaction shape is load-bearing: R4 balance is a
 * DEFERRABLE INITIALLY DEFERRED trigger firing at COMMIT, so an unbalanced edit
 * only fails when the whole approve tx commits — rolling the resolution write
 * back with the posting, which is why the held row survives.
 *
 * Covers: (1) an edited posting line (account + amount) is what gets booked while
 * `input_json` stays the untouched original; (2) §42 červené storno — a NEGATIVE
 * amount edit passes the signed schema and books (guards F1, commit 86c5b495);
 * (3) the Advisor's F2 — an unbalanced edit → ok:false, row stays held, nothing
 * booked; (4) a malformed edit is rejected before any domain call.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import postgres from "postgres"

import {
  applyHeldWriteEdit,
  HeldWriteEditSchema,
  type HeldWriteEdit,
} from "../../../_components/held-writes/edit-model"
import { stripGateEnvelope } from "@workspace/shared/api"
import type {
  AccountNature,
  DebitCredit,
  DocumentInput,
  EventInput,
  OrgCtx,
  PostInput,
} from "@workspace/accounting"

process.env["BETTER_AUTH_SECRET"] =
  process.env["BETTER_AUTH_SECRET"] ??
  "web-integration-test-secret-0123456789ab"

// db + accounting singletons are dynamically imported so DATABASE_URL is set by
// globalSetup before they bind (repo convention, AFF-119).
let withOrganization: (typeof import("@workspace/db"))["withOrganization"]
let executeRows: (typeof import("@workspace/db"))["executeRows"]
let sqlTag: (typeof import("@workspace/db"))["sql"]
let updateToolCallLogOutput: (typeof import("@workspace/db"))["updateToolCallLogOutput"]
let lockPeriodInTx: (typeof import("@workspace/db"))["lockPeriodInTx"]

let createPeriod: (typeof import("@workspace/accounting"))["createPeriod"]
let createChart: (typeof import("@workspace/accounting"))["createChart"]
let createAccount: (typeof import("@workspace/accounting"))["createAccount"]
let createNumberSeries: (typeof import("@workspace/accounting"))["createNumberSeries"]
let createEvent: (typeof import("@workspace/accounting"))["createEvent"]
let captureDocument: (typeof import("@workspace/accounting"))["captureDocument"]
let post: (typeof import("@workspace/accounting"))["post"]

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
    updateToolCallLogOutput,
    lockPeriodInTx,
  } = await import("@workspace/db"))
  ;({
    createPeriod,
    createChart,
    createAccount,
    createNumberSeries,
    createEvent,
    captureDocument,
    post,
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

/**
 * `truncateAll` leaves the accounting tables alone (and runs under
 * `session_replication_role = replica`, disabling cascades), so this suite's
 * accounting_period / accounting_event / posting rows would survive as orphans
 * and break the FK-order cleanup of any later-sorted DB test (e.g. `closing/*`'s
 * `DELETE FROM accounting_period`). Clear our accounting rows first — replica
 * mode disables the append-only + FK-order guards, so a flat order-independent
 * delete list is safe — then hand off to `truncateAll` for the platform tables.
 */
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
// Seed
// ---------------------------------------------------------------------------

/** Minimal chart: one supplier liability + two expense accounts. */
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
  periodId: string
  summaryRecordId: string
  eventId: string
  /** account number → id */
  accounts: Record<string, string>
}

/**
 * DOUBLE_ENTRY org, open 2026 period, 3-account chart, event + document series,
 * and one captured received invoice — enough for a real `createAccountingPosting`
 * (kind "double") to reference a doklad + případ and post against valid accounts.
 */
async function seedScenario(): Promise<Scenario> {
  const { workspaceId, orgAId, userAId } = await seedTwoOrganizations(sql)
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
    return {
      periodId,
      summaryRecordId: doc.summaryRecordId,
      eventId: ev.eventId,
      accounts,
    }
  })
  return { organizationId: orgAId, workspaceId, userId: userAId, ...seeded }
}

/**
 * The `input_json` a held `createAccountingPosting` (kind "double") carries: a
 * `{ kind, entry }` domain payload plus a gate envelope `stripGateEnvelope` peels
 * off. `responsibleUserId` is intentionally absent — the approve branch injects
 * the approving user, never the agent's.
 */
function postingInput(
  s: Scenario,
  lines: Array<{ account: string; side: DebitCredit; amount: string }>,
): Record<string, unknown> {
  return {
    kind: "double",
    entry: {
      periodId: s.periodId,
      summaryRecordId: s.summaryRecordId,
      accountingEventId: s.eventId,
      postingDate: "2026-06-01",
      lines: lines.map((l) => ({
        accountId: s.accounts[l.account],
        side: l.side,
        amount: l.amount,
      })),
    },
    confidence: 0.55,
    rationale: "Agent read the posting off the OCR'd invoice.",
    conversationId: "00000000-0000-7000-8000-0000000000aa",
  }
}

async function seedHeldPostingWrite(
  s: Scenario,
  input: Record<string, unknown>,
): Promise<string> {
  const [row] = await sql<Array<{ id: string }>>`
    INSERT INTO tool_call_log (
      organization_id, tool_name, idempotency_key, actor_kind, user_id,
      input_json, output_json, auto_applied, approved_by_user_id
    )
    VALUES (
      ${s.organizationId}::uuid, 'createAccountingPosting',
      ${"key-" + Math.random().toString(36).slice(2)}, 'ai_on_behalf', ${s.userId}::uuid,
      ${sql.json(input as never)},
      ${sql.json({ payloadHash: "h", serverGate: { templateId: null }, status: "held", reviewId: "r" })},
      false, null
    )
    RETURNING id`
  if (!row) throw new Error("held posting write insert failed")
  return row.id
}

interface HeldLogRow {
  tool_name: string
  input_json: unknown
  auto_applied: boolean
  approved_by_user_id: string | null
}

/**
 * Faithful replica of `resolveHeldWrite`'s approve branch for a
 * `createAccountingPosting`, in ONE `withOrganization` tx with the same outer
 * try/catch, so a COMMIT-time balance failure rolls the resolution back with the
 * posting.
 */
async function approvePosting(input: {
  scenario: Scenario
  toolCallLogId: string
  edit?: HeldWriteEdit
}): Promise<{
  ok: boolean
  error?: string
  applied?: { postingId: string; lineIds: string[] }
}> {
  const { scenario: s, toolCallLogId } = input

  // Mirrors ResolveSchema.safeParse — an edit that fails the wire schema is
  // rejected before anything touches the domain (the gate F1 relaxed for signed
  // posting-line amounts).
  let edit: HeldWriteEdit | undefined
  if (input.edit !== undefined) {
    const parsed = HeldWriteEditSchema.safeParse(input.edit)
    if (!parsed.success) return { ok: false, error: "invalid edit" }
    edit = parsed.data
  }

  const orgCtx = {
    organizationId: s.organizationId,
    workspaceId: s.workspaceId,
  }
  try {
    return await withOrganization(s.organizationId, s.userId, async (db) => {
      const rows = await executeRows<HeldLogRow>(
        db,
        sqlTag`select tool_name, input_json, auto_applied,
                      approved_by_user_id::text as approved_by_user_id
               from tool_call_log where id = ${toolCallLogId}::uuid`,
      )
      const row = rows[0]
      if (!row) return { ok: false, error: "not found" }
      if (row.auto_applied || row.approved_by_user_id !== null) {
        return { ok: false, error: "already resolved" }
      }

      const rawInput = (row.input_json ?? {}) as Record<string, unknown>
      const mergedInput = edit
        ? applyHeldWriteEdit(row.tool_name, rawInput, edit)
        : rawInput
      const fields = stripGateEnvelope(mergedInput)

      const { kind, entry } = fields as { kind?: unknown; entry?: unknown }
      await lockPeriodInTx(
        db,
        orgCtx.organizationId,
        (entry as { periodId: string }).periodId,
      )
      const posting = await post(db, orgCtx, {
        kind,
        entry: {
          ...(entry as Record<string, unknown>),
          responsibleUserId: s.userId,
        },
      } as unknown as PostInput)
      const applied = { postingId: posting.postingId, lineIds: posting.lineIds }

      await updateToolCallLogOutput(db, {
        toolCallLogId,
        output: {
          resolution: "approved",
          ...applied,
          ...(edit ? { edit } : {}),
        },
        approvedByUserId: s.userId,
      })
      return { ok: true, applied }
    })
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "failed" }
  }
}

// ---------------------------------------------------------------------------
// Read-back helpers (admin client — sees the COMMITTED state)
// ---------------------------------------------------------------------------

async function readLog(id: string): Promise<{
  input_json: Record<string, unknown>
  output_json: Record<string, unknown>
  approved_by_user_id: string | null
}> {
  const [row] = await sql<
    Array<{
      input_json: Record<string, unknown>
      output_json: Record<string, unknown>
      approved_by_user_id: string | null
    }>
  >`SELECT input_json, output_json, approved_by_user_id::text as approved_by_user_id
    FROM tool_call_log WHERE id = ${id}::uuid`
  if (!row) throw new Error("log row not found")
  return row
}

async function readPostingLines(
  postingId: string,
): Promise<Array<{ account_id: string; side: string; amount: string }>> {
  return sql<Array<{ account_id: string; side: string; amount: string }>>`
    SELECT account_id::text as account_id, side, amount::text as amount
    FROM posting_double_entry_line WHERE posting_id = ${postingId}::uuid ORDER BY id`
}

async function countPostings(organizationId: string): Promise<number> {
  const [row] = await sql<Array<{ n: string }>>`
    SELECT count(*)::text as n FROM posting WHERE organization_id = ${organizationId}::uuid`
  return Number(row?.n ?? "0")
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("edit-before-approve — full domain replay (Advisor #638 F2)", () => {
  it("books the EDITED posting lines (account + amount), not the original proposal", async () => {
    const s = await seedScenario()
    // Agent proposed the WRONG expense account (548) and the WRONG amount (1000).
    const logId = await seedHeldPostingWrite(
      s,
      postingInput(s, [
        { account: "548", side: "DEBIT", amount: "1000.00" },
        { account: "321", side: "CREDIT", amount: "1000.00" },
      ]),
    )
    // Reviewer corrects the debit account (548 → 518) and the amount (→ 1500).
    const edit: HeldWriteEdit = {
      postingLines: [
        { accountId: s.accounts["518"]!, side: "DEBIT", amount: "1500.00" },
        { accountId: s.accounts["321"]!, side: "CREDIT", amount: "1500.00" },
      ],
    }

    const res = await approvePosting({
      scenario: s,
      toolCallLogId: logId,
      edit,
    })
    expect(res.ok).toBe(true)
    expect(res.applied?.postingId).toBeTruthy()

    // Booked lines reflect the EDIT, never the original proposal.
    const lines = await readPostingLines(res.applied!.postingId)
    expect(lines).toHaveLength(2)
    const debit = lines.find((l) => l.side === "DEBIT")!
    const credit = lines.find((l) => l.side === "CREDIT")!
    expect(debit.account_id).toBe(s.accounts["518"]) // corrected — NOT 548
    expect(debit.account_id).not.toBe(s.accounts["548"])
    expect(Number(debit.amount)).toBe(1500) // corrected — NOT 1000
    expect(credit.account_id).toBe(s.accounts["321"])
    expect(Number(credit.amount)).toBe(1500)

    const log = await readLog(logId)
    expect(log.approved_by_user_id).toBe(s.userId)
    expect(log.output_json["resolution"]).toBe("approved")
    expect(log.output_json["postingId"]).toBe(res.applied!.postingId)
    expect(log.output_json["edit"]).toEqual(edit)

    // input_json stays the untouched original proposal (audit of what was asked).
    const originalEntry = log.input_json["entry"] as {
      lines: Array<{ accountId: string; amount: string }>
    }
    expect(originalEntry.lines[0]?.accountId).toBe(s.accounts["548"])
    expect(originalEntry.lines[0]?.amount).toBe("1000.00")
  })

  it("approves a §42 červené storno edit with NEGATIVE posting-line amounts (guards F1)", async () => {
    const s = await seedScenario()
    const logId = await seedHeldPostingWrite(
      s,
      postingInput(s, [
        { account: "518", side: "DEBIT", amount: "500.00" },
        { account: "321", side: "CREDIT", amount: "500.00" },
      ]),
    )
    // červené storno (ČÚS 001): same sides, negated amounts — a valid balanced
    // posting, reachable only if the edit schema tolerates a leading "-" (F1).
    const edit: HeldWriteEdit = {
      postingLines: [
        { accountId: s.accounts["518"]!, side: "DEBIT", amount: "-500.00" },
        { accountId: s.accounts["321"]!, side: "CREDIT", amount: "-500.00" },
      ],
    }
    // F1 guard, made unmissable: revert SIGNED_DECIMAL_RE → DECIMAL_RE and this fails.
    expect(HeldWriteEditSchema.safeParse(edit).success).toBe(true)

    const res = await approvePosting({
      scenario: s,
      toolCallLogId: logId,
      edit,
    })
    expect(res.ok).toBe(true)

    const lines = await readPostingLines(res.applied!.postingId)
    expect(lines).toHaveLength(2)
    expect(Number(lines.find((l) => l.side === "DEBIT")!.amount)).toBe(-500)
    expect(Number(lines.find((l) => l.side === "CREDIT")!.amount)).toBe(-500)

    const log = await readLog(logId)
    expect(log.approved_by_user_id).toBe(s.userId)
    expect(log.output_json["resolution"]).toBe("approved")
  })

  it("rejects an UNBALANCED edit — ok:false, row stays held, nothing booked", async () => {
    const s = await seedScenario()
    const logId = await seedHeldPostingWrite(
      s,
      postingInput(s, [
        { account: "518", side: "DEBIT", amount: "1000.00" },
        { account: "321", side: "CREDIT", amount: "1000.00" },
      ]),
    )
    // Debit up to 1500, credit left at 1000 → the R4 balance trigger (DEFERRABLE,
    // fires at COMMIT) rolls the whole tx back.
    const edit: HeldWriteEdit = {
      postingLines: [
        { accountId: s.accounts["518"]!, side: "DEBIT", amount: "1500.00" },
        { accountId: s.accounts["321"]!, side: "CREDIT", amount: "1000.00" },
      ],
    }

    const res = await approvePosting({
      scenario: s,
      toolCallLogId: logId,
      edit,
    })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/unbalanced/i)

    // The held row is untouched — the resolution write rolled back with the posting.
    const log = await readLog(logId)
    expect(log.approved_by_user_id).toBeNull()
    expect(log.output_json["status"]).toBe("held")
    expect(log.output_json["resolution"]).toBeUndefined()
    expect(await countPostings(s.organizationId)).toBe(0)
  })

  it("rejects a malformed edit amount before any domain call — row stays held", async () => {
    const s = await seedScenario()
    const logId = await seedHeldPostingWrite(
      s,
      postingInput(s, [
        { account: "518", side: "DEBIT", amount: "1000.00" },
        { account: "321", side: "CREDIT", amount: "1000.00" },
      ]),
    )

    const res = await approvePosting({
      scenario: s,
      toolCallLogId: logId,
      edit: {
        postingLines: [
          {
            accountId: s.accounts["518"]!,
            side: "DEBIT",
            amount: "not-a-number",
          },
          { accountId: s.accounts["321"]!, side: "CREDIT", amount: "1000.00" },
        ],
      } as HeldWriteEdit,
    })
    expect(res.ok).toBe(false)
    expect(res.error).toBe("invalid edit")

    const log = await readLog(logId)
    expect(log.approved_by_user_id).toBeNull()
    expect(log.output_json["status"]).toBe("held")
    expect(await countPostings(s.organizationId)).toBe(0)
  })
})
