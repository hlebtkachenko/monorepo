/**
 * backfillDefaultNumberSeries — idempotent, conservative restore of the
 * default číselné řady. Never resets `next_number` on an existing row.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { executeRows, sql, withOrganization } from "@workspace/db"
import {
  backfillDefaultNumberSeries,
  createNumberSeries,
  DEFAULT_NUMBER_SERIES,
} from "../src/index"
import type { OrgCtx } from "../src/index"
import { adminClient, seedTwoOrganizations } from "./fixtures"

let admin: ReturnType<typeof adminClient>
let workspaceId: string
let orgA: string
let orgB: string
let userId: string

beforeAll(async () => {
  admin = adminClient()
  const seed = await seedTwoOrganizations(admin)
  workspaceId = seed.workspaceId
  orgA = seed.orgAId
  orgB = seed.orgBId
  userId = seed.userAId
})

afterAll(async () => {
  await admin.end({ timeout: 5 })
})

async function seriesRows(orgId: string, ctx: OrgCtx) {
  return withOrganization(orgId, userId, (db) =>
    executeRows<{ entity_type: string; code: string; next_number: number }>(
      db,
      sql`SELECT entity_type, code, next_number::int FROM number_series
          WHERE organization_id = ${ctx.organizationId}::uuid
          ORDER BY entity_type, code`,
    ),
  )
}

describe("backfillDefaultNumberSeries", () => {
  it("fresh org with no series: inserts all 8 defaults", async () => {
    const ctx: OrgCtx = { organizationId: orgA, workspaceId }
    const inserted = await withOrganization(orgA, userId, (db) =>
      backfillDefaultNumberSeries(db, ctx),
    )
    expect(inserted).toBe(DEFAULT_NUMBER_SERIES.length)

    const rows = await seriesRows(orgA, ctx)
    expect(rows).toHaveLength(DEFAULT_NUMBER_SERIES.length)
    for (const r of rows) {
      expect(r.next_number).toBe(1)
    }
  })

  it("is idempotent: running again inserts nothing and leaves 8 rows", async () => {
    const ctx: OrgCtx = { organizationId: orgA, workspaceId }
    const inserted = await withOrganization(orgA, userId, (db) =>
      backfillDefaultNumberSeries(db, ctx),
    )
    expect(inserted).toBe(0)

    const rows = await seriesRows(orgA, ctx)
    expect(rows).toHaveLength(DEFAULT_NUMBER_SERIES.length)
  })

  it("partial: fills in only the missing defaults, preserving existing next_number", async () => {
    const ctx: OrgCtx = { organizationId: orgB, workspaceId }
    const [first, second] = DEFAULT_NUMBER_SERIES

    // Pre-seed 2 of the 8 defaults with a non-default next_number.
    await withOrganization(orgB, userId, async (db) => {
      await createNumberSeries(db, ctx, {
        entityType: first!.entityType,
        code: first!.code,
        pattern: first!.pattern,
        nextNumber: 42,
      })
      await createNumberSeries(db, ctx, {
        entityType: second!.entityType,
        code: second!.code,
        pattern: second!.pattern,
        nextNumber: 42,
      })
    })

    const inserted = await withOrganization(orgB, userId, (db) =>
      backfillDefaultNumberSeries(db, ctx),
    )
    expect(inserted).toBe(DEFAULT_NUMBER_SERIES.length - 2)

    const rows = await seriesRows(orgB, ctx)
    expect(rows).toHaveLength(DEFAULT_NUMBER_SERIES.length)
    const preSeeded = rows.filter(
      (r) =>
        (r.entity_type === first!.entityType && r.code === first!.code) ||
        (r.entity_type === second!.entityType && r.code === second!.code),
    )
    expect(preSeeded).toHaveLength(2)
    for (const r of preSeeded) {
      expect(r.next_number).toBe(42)
    }
  })
})
