/**
 * RLS cross-organization leak harness — filing_record (0080).
 *
 * filing_record persists an organization's tax-filing status (FilingRecord). A
 * cross-org leak would expose (or let one tenant toggle) another tenant's filing
 * evidence. This proves the standard `organization_isolation` policy (FORCE RLS,
 * USING + WITH CHECK, NULLIF guard) behaves on filing_record, exercises the
 * per-org UNIQUE(organization_id, obligation_kind, period_start, period_end)
 * idempotency invariant, and covers the UPDATE grant (filing status is mutable as
 * a filing progresses FILED -> ACCEPTED / REJECTED).
 *
 * Registration parity (filing_record ∈ ORGANIZATION_SCOPED_TABLES ⇔ the policy
 * exists in the migrated DB) is asserted by the drift detector in
 * rls-cross-organization.test.ts.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { getTableColumns } from "drizzle-orm"
import { filing_record } from "../src/schema/filing_record.js"
import { adminClient, seedTwoOrganizations, truncateAll } from "./fixtures.js"
import postgres from "postgres"

let adminSql: postgres.Sql
let userSql: postgres.Sql

beforeAll(async () => {
  adminSql = adminClient()
  const userUrl = process.env["DATABASE_URL"]
  if (!userUrl) throw new Error("DATABASE_URL not set")
  userSql = postgres(userUrl, { prepare: false, max: 1, onnotice: () => {} })
})

afterAll(async () => {
  // truncateAll doesn't clear filing_record; remove our rows before it runs so
  // the shared container is clean for later files.
  await adminSql`DELETE FROM filing_record`
  await truncateAll(adminSql)
  await adminSql.end({ timeout: 5 })
  await userSql.end({ timeout: 5 })
})

describe("RLS cross-organization isolation — filing_record", () => {
  let orgAId: string
  let orgBId: string
  let rowAId: string

  beforeAll(async () => {
    const seed = await seedTwoOrganizations(adminSql)
    orgAId = seed.orgAId
    orgBId = seed.orgBId

    const [row] = await adminSql<Array<{ id: string }>>`
      INSERT INTO filing_record
        (organization_id, obligation_kind, period_start, period_end, status, recorded_by)
      VALUES
        (${orgAId}::uuid, 'VAT_RETURN', '2026-01-01', '2026-01-31', 'FILED', gen_random_uuid())
      RETURNING id
    `
    if (!row) throw new Error("Failed to seed filing_record")
    rowAId = row.id
  })

  it("drizzle DSL maps the filing_record column set", () => {
    const cols = Object.keys(getTableColumns(filing_record))
    expect(cols).toEqual(
      expect.arrayContaining([
        "id",
        "organization_id",
        "obligation_kind",
        "period_start",
        "period_end",
        "status",
        "recorded_at",
        "recorded_by",
      ]),
    )
  })

  it("org A session sees org A's filing", async () => {
    const rows = await userSql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.organization_id', '${orgAId}', true)`,
      )
      return tx.unsafe<Array<{ id: string }>>(
        `SELECT id FROM filing_record WHERE id = '${rowAId}'::uuid`,
      )
    })
    expect(rows.map((r) => r.id)).toContain(rowAId)
  })

  it("org B session sees zero rows for org A's filing (SELECT leak)", async () => {
    const rows = await userSql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.organization_id', '${orgBId}', true)`,
      )
      return tx.unsafe<Array<{ id: string }>>(`SELECT id FROM filing_record`)
    })
    expect(rows.filter((r) => r.id === rowAId)).toHaveLength(0)
  })

  it("org B session cannot UPDATE org A's filing (row invisible, 0 affected)", async () => {
    const updated = await userSql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.organization_id', '${orgBId}', true)`,
      )
      return tx.unsafe<Array<{ id: string }>>(
        `UPDATE filing_record SET status = 'ACCEPTED'
         WHERE id = '${rowAId}'::uuid
         RETURNING id`,
      )
    })
    expect(updated).toHaveLength(0)

    // The row is untouched — verify via the admin client (bypasses RLS).
    const [row] = await adminSql<Array<{ status: string }>>`
      SELECT status FROM filing_record WHERE id = ${rowAId}::uuid
    `
    expect(row?.status).toBe("FILED")
  })

  it("org B session cannot DELETE org A's filing (row invisible, 0 affected)", async () => {
    const deleted = await userSql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.organization_id', '${orgBId}', true)`,
      )
      return tx.unsafe<Array<{ id: string }>>(
        `DELETE FROM filing_record WHERE id = '${rowAId}'::uuid RETURNING id`,
      )
    })
    expect(deleted).toHaveLength(0)

    const [row] = await adminSql<Array<{ id: string }>>`
      SELECT id FROM filing_record WHERE id = ${rowAId}::uuid
    `
    expect(row?.id).toBe(rowAId)
  })

  it("empty GUC returns zero rows (NULLIF guard)", async () => {
    const rows = await userSql.begin(async (tx) => {
      await tx.unsafe(`SELECT set_config('app.organization_id', '', true)`)
      return tx.unsafe<Array<{ id: string }>>(`SELECT id FROM filing_record`)
    })
    expect(rows).toHaveLength(0)
  })

  it("WITH CHECK blocks INSERT with foreign org_id", async () => {
    // Scope to org B, try to plant a filing under org A.
    await expect(
      userSql.begin(async (tx) => {
        await tx.unsafe(
          `SELECT set_config('app.organization_id', '${orgBId}', true)`,
        )
        await tx.unsafe(
          `INSERT INTO filing_record
             (organization_id, obligation_kind, period_start, period_end, status, recorded_by)
           VALUES
             ('${orgAId}'::uuid, 'CONTROL_STATEMENT', '2026-02-01', '2026-02-28', 'FILED', gen_random_uuid())`,
        )
      }),
    ).rejects.toThrow(/row-level security/)
  })

  it("enforces one filing row per obligation+period per org (unique)", async () => {
    // org A already recorded VAT_RETURN for 2026-01 above.
    await expect(
      adminSql`
        INSERT INTO filing_record
          (organization_id, obligation_kind, period_start, period_end, status, recorded_by)
        VALUES
          (${orgAId}::uuid, 'VAT_RETURN', '2026-01-01', '2026-01-31', 'ACCEPTED', gen_random_uuid())
      `,
    ).rejects.toThrow(/filing_record_org_kind_period_unique|duplicate key/)
  })
})
