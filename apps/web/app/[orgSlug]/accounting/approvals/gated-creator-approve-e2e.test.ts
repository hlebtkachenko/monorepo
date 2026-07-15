/**
 * [Tier 3 + Tier 4] End-to-end coverage for a gated REGISTER-CARD creator through
 * the real approve replay — closing the `fields as unknown as Parameters<typeof
 * createAsset>[2]` cast gap the controllers carry (a schema↔domain field-name
 * mismatch would be hidden by that cast and land a wrong/empty column). It drives
 * the actual `createAsset`, validates the stored payload through the real
 * `CreateAssetRequestSchema` + `stripGateEnvelope`, peels `periodId` exactly as
 * the approve branch does, and asserts the asset row lands with the right fields.
 *
 * It also proves the Tier 4 provenance spine on the web approve path: the approve
 * branch mints one `inbox_item` and stamps its id onto the landed row's
 * `inbox_id` (asset is NOT a landed accounting row so it carries no inbox_id, but
 * the mint + a human-driven write leaving it absent is exercised elsewhere; here
 * the point is the creator receives correctly-named fields).
 *
 * Replicates `resolveHeldWrite`'s createAsset branch (actions.ts) against the
 * PG18 testcontainer — the same convention as edit-approve-e2e.test.ts.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import postgres from "postgres"

import {
  CreateAssetRequestSchema,
  INBOX_STAMPED_OPERATION_IDS,
  stripGateEnvelope,
} from "@workspace/shared/api"
import type { AssetInput, OrgCtx } from "@workspace/accounting"

process.env["BETTER_AUTH_SECRET"] =
  process.env["BETTER_AUTH_SECRET"] ??
  "web-integration-test-secret-0123456789ab"

let withOrganization: (typeof import("@workspace/db"))["withOrganization"]
let executeRows: (typeof import("@workspace/db"))["executeRows"]
let sqlTag: (typeof import("@workspace/db"))["sql"]
let lockPeriodInTx: (typeof import("@workspace/db"))["lockPeriodInTx"]

let createPeriod: (typeof import("@workspace/accounting"))["createPeriod"]
let createNumberSeries: (typeof import("@workspace/accounting"))["createNumberSeries"]
let createAsset: (typeof import("@workspace/accounting"))["createAsset"]
let mintInboxItem: (typeof import("@workspace/accounting"))["mintInboxItem"]

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
    lockPeriodInTx,
  } = await import("@workspace/db"))
  ;({ createPeriod, createNumberSeries, createAsset, mintInboxItem } =
    await import("@workspace/accounting"))
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

const RESET_TABLES = [
  "posting_double_entry_line",
  "posting_monetary_line",
  "posting",
  "partial_record",
  "individual_record",
  "summary_record",
  "asset",
  "accounting_event",
  "account",
  "chart_of_accounts",
  "number_series",
  "accounting_period",
  "inbox_item",
] as const

async function resetAll(): Promise<void> {
  await sql.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL session_replication_role = replica`)
    for (const table of RESET_TABLES) await tx.unsafe(`DELETE FROM ${table}`)
  })
  await truncateAll(sql)
}

interface Scenario {
  organizationId: string
  workspaceId: string
  userId: string
  periodId: string
  assetSeriesId: string
}

let seedSeq = 0

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
    const assetSeriesId = await createNumberSeries(db, ctx, {
      entityType: "ASSET",
      code: `DM${tag}`,
      pattern: "DM{YYYY}{NNNN}",
    })
    return { periodId, assetSeriesId }
  })
  return { organizationId: orgAId, workspaceId, userId: userAId, ...seeded }
}

/** The input_json a held createAsset carries — a valid CreateAssetRequest body. */
function assetInput(s: Scenario): Record<string, unknown> {
  return {
    periodId: s.periodId,
    seriesId: s.assetSeriesId,
    name: "Notebook Dell Latitude",
    category: "TANGIBLE_DEPRECIABLE",
    accountNumber: "022",
    commissioningDate: "2026-03-14",
    acquisitionCost: "45000.00",
    directiveCode: null,
    confidence: 0.55,
    rationale: "Agent read the asset card off the invoice.",
    conversationId: "00000000-0000-7000-8000-0000000000aa",
  }
}

async function seedHeldAssetWrite(
  s: Scenario,
  input: Record<string, unknown>,
): Promise<string> {
  const [row] = await sql<Array<{ id: string }>>`
    INSERT INTO tool_call_log (
      organization_id, tool_name, idempotency_key, actor_kind, user_id,
      rationale, input_json, output_json, auto_applied, approved_by_user_id
    )
    VALUES (
      ${s.organizationId}::uuid, 'createAsset',
      ${"key-" + Math.random().toString(36).slice(2)}, 'ai_on_behalf', ${s.userId}::uuid,
      'Agent read the asset card off the invoice.',
      ${sql.json(input as never)},
      ${sql.json({ payloadHash: "h", serverGate: { templateId: null }, status: "held", reviewId: "r" })},
      false, null
    )
    RETURNING id`
  if (!row) throw new Error("held asset write insert failed")
  return row.id
}

/**
 * Faithful replica of `resolveHeldWrite`'s createAsset approve branch: mint the
 * inbox_item, re-validate the stored payload against the CURRENT schema, peel the
 * gate envelope + periodId, then call the REAL createAsset with the stamped ctx.
 */
async function approveAsset(s: Scenario, toolCallLogId: string) {
  const orgCtx = {
    organizationId: s.organizationId,
    workspaceId: s.workspaceId,
  }
  return withOrganization(s.organizationId, s.userId, async (db) => {
    const rows = await executeRows<{
      tool_name: string
      input_json: unknown
      actor_kind: string
      rationale: string | null
    }>(
      db,
      sqlTag`select tool_name, input_json, actor_kind::text as actor_kind, rationale
             from tool_call_log where id = ${toolCallLogId}::uuid`,
    )
    const row = rows[0]!
    // Re-validate exactly as the API replay does — a stale field would fail here.
    const parsed = CreateAssetRequestSchema.safeParse(row.input_json)
    if (!parsed.success) throw new Error("stored payload no longer validates")

    // Mirror the real approve gating: a register-card op is NOT in
    // INBOX_STAMPED_OPERATION_IDS (its table has no inbox_id column), so it mints
    // no inbox_item. The ledger-fact ops mint; createAsset must not.
    const inboxId =
      row.actor_kind !== "human" &&
      (INBOX_STAMPED_OPERATION_IDS as readonly string[]).includes(row.tool_name)
        ? await mintInboxItem(db, orgCtx, {
            toolCallLogId,
            kind: row.tool_name,
            createdBy: row.actor_kind,
            source: "agent",
            reasoning: row.rationale,
          })
        : null
    const writeCtx = { ...orgCtx, inboxId }

    const { periodId, ...cardFields } = stripGateEnvelope(parsed.data) as {
      periodId: string
    } & Record<string, unknown>
    await lockPeriodInTx(db, orgCtx.organizationId, periodId)
    const asset = await createAsset(db, writeCtx, {
      ...cardFields,
      responsibleUserId: s.userId,
    } as unknown as AssetInput)
    return { asset, inboxId }
  })
}

describe("gated createAsset approve — real domain replay (Tier 3 cast + Tier 4 mint)", () => {
  it("lands the asset card with correctly-named fields from the Zod-validated payload", async () => {
    const s = await seedScenario()
    const logId = await seedHeldAssetWrite(s, assetInput(s))

    const { asset, inboxId } = await approveAsset(s, logId)
    expect(asset.id).toBeTruthy()
    expect(asset.designation).toMatch(/^DM2026/)
    // A register-card op mints no inbox_item (no landed row carries inbox_id).
    expect(inboxId).toBeNull()

    // Every schema field name reached the right column (the cast would hide a miss).
    const [row] = await sql<
      Array<{
        name: string
        category: string
        account_number: string
        acquisition_cost: string
        commissioning_date: string
        responsible_user_id: string
      }>
    >`SELECT name, category, account_number, acquisition_cost::text as acquisition_cost,
             commissioning_date::text as commissioning_date, responsible_user_id::text as responsible_user_id
        FROM asset WHERE id = ${asset.id}::uuid`
    expect(row).toMatchObject({
      name: "Notebook Dell Latitude",
      category: "TANGIBLE_DEPRECIABLE",
      account_number: "022",
      commissioning_date: "2026-03-14",
      responsible_user_id: s.userId,
    })
    expect(Number(row!.acquisition_cost)).toBe(45000)

    // Tier 4: a register-card approve mints NO provenance row (its table has no
    // inbox_id column) — no orphan inbox_item is created for the org.
    const minted = await sql<Array<{ n: string }>>`
      SELECT count(*)::text as n FROM inbox_item WHERE tool_call_log_id = ${logId}::uuid`
    expect(Number(minted[0]!.n)).toBe(0)
  })
})
