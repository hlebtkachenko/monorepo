/**
 * RLS cross-organization leak harness — accounting_sub_period (0081).
 *
 * accounting_sub_period holds the fiscal month/quarter slots of an org's účetní
 * období, each carrying its open/closed status and the doc-flow padlocks. A
 * cross-org leak would expose (or let one tenant toggle) another tenant's
 * sub-period state. This proves the standard `organization_isolation` policy
 * (FORCE RLS, USING + WITH CHECK, NULLIF guard) behaves on accounting_sub_period,
 * covers the UPDATE grant (status + doc-flow flags are mutable), exercises the
 * per-org UNIQUE(organization_id, period_id, slot_index) slot-ordinal invariant,
 * and proves the composite (period_id, organization_id) FK rejects a cross-org
 * parent period (the FK check bypasses RLS, so the composite target is what keeps
 * it tenant-isolated — postgres-fk-bypasses-rls).
 *
 * Registration parity (accounting_sub_period ∈ ORGANIZATION_SCOPED_TABLES ⇔ the
 * policy exists in the migrated DB) is asserted by the drift detector in
 * rls-cross-organization.test.ts.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { getTableColumns } from "drizzle-orm"
import { accounting_sub_period } from "../src/schema/accounting_sub_period.js"
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
  await adminSql.end({ timeout: 5 })
  await userSql.end({ timeout: 5 })
})

describe("RLS cross-organization isolation — accounting_sub_period", () => {
  let orgAId: string
  let orgBId: string
  let periodAId: string
  let periodBId: string
  let rowAId: string

  beforeAll(async () => {
    const seed = await seedTwoOrganizations(adminSql)
    orgAId = seed.orgAId
    orgBId = seed.orgBId

    // A parent účetní období per org (regime + currency are migration-seeded).
    const [pA] = await adminSql<Array<{ id: string }>>`
      INSERT INTO accounting_period
        (organization_id, period_start, period_end, status, regime_code, accounting_currency)
      VALUES
        (${orgAId}::uuid, '2026-01-01', '2026-12-31', 'OPEN', 'DOUBLE_ENTRY', 'CZK')
      RETURNING id
    `
    const [pB] = await adminSql<Array<{ id: string }>>`
      INSERT INTO accounting_period
        (organization_id, period_start, period_end, status, regime_code, accounting_currency)
      VALUES
        (${orgBId}::uuid, '2026-01-01', '2026-12-31', 'OPEN', 'DOUBLE_ENTRY', 'CZK')
      RETURNING id
    `
    if (!pA || !pB) throw new Error("Failed to seed accounting_period")
    periodAId = pA.id
    periodBId = pB.id

    const [row] = await adminSql<Array<{ id: string }>>`
      INSERT INTO accounting_sub_period
        (organization_id, period_id, slot_index, slot_kind, period_start, period_end, status)
      VALUES
        (${orgAId}::uuid, ${periodAId}::uuid, 0, 'MONTH', '2026-01-01', '2026-01-31', 'OPEN')
      RETURNING id
    `
    if (!row) throw new Error("Failed to seed accounting_sub_period")
    rowAId = row.id
  })

  afterAll(async () => {
    // Clean only our rows so the shared container stays usable for later files
    // (children before parents). accounting_sub_period is a brand-new table with
    // no other-suite rows, so the whole-table delete only touches ours; the
    // parent periods are scoped by id to avoid other suites' FK-protected rows.
    await adminSql`DELETE FROM accounting_sub_period`
    await adminSql`DELETE FROM accounting_period WHERE id IN ${adminSql([periodAId, periodBId])}`
    await truncateAll(adminSql)
  })

  it("drizzle DSL maps the accounting_sub_period column set", () => {
    const cols = Object.keys(getTableColumns(accounting_sub_period))
    expect(cols).toEqual(
      expect.arrayContaining([
        "id",
        "organization_id",
        "period_id",
        "slot_index",
        "slot_kind",
        "period_start",
        "period_end",
        "status",
        "allow_inbound_documents",
        "allow_outbound_documents",
        "created_at",
        "updated_at",
      ]),
    )
  })

  it("org A session sees org A's sub-period", async () => {
    const rows = await userSql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.organization_id', '${orgAId}', true)`,
      )
      return tx.unsafe<Array<{ id: string }>>(
        `SELECT id FROM accounting_sub_period WHERE id = '${rowAId}'::uuid`,
      )
    })
    expect(rows.map((r) => r.id)).toContain(rowAId)
  })

  it("org B session sees zero rows for org A's sub-period (SELECT leak)", async () => {
    const rows = await userSql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.organization_id', '${orgBId}', true)`,
      )
      return tx.unsafe<Array<{ id: string }>>(
        `SELECT id FROM accounting_sub_period`,
      )
    })
    expect(rows.filter((r) => r.id === rowAId)).toHaveLength(0)
  })

  it("org B session cannot UPDATE org A's sub-period (row invisible, 0 affected)", async () => {
    const updated = await userSql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.organization_id', '${orgBId}', true)`,
      )
      return tx.unsafe<Array<{ id: string }>>(
        `UPDATE accounting_sub_period SET status = 'CLOSED'
         WHERE id = '${rowAId}'::uuid
         RETURNING id`,
      )
    })
    expect(updated).toHaveLength(0)

    // The row is untouched — verify via the admin client (bypasses RLS).
    const [row] = await adminSql<Array<{ status: string }>>`
      SELECT status FROM accounting_sub_period WHERE id = ${rowAId}::uuid
    `
    expect(row?.status).toBe("OPEN")
  })

  it("org A session can toggle its own doc-flow padlock (UPDATE grant)", async () => {
    const updated = await userSql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.organization_id', '${orgAId}', true)`,
      )
      return tx.unsafe<Array<{ id: string }>>(
        `UPDATE accounting_sub_period SET allow_inbound_documents = false
         WHERE id = '${rowAId}'::uuid
         RETURNING id`,
      )
    })
    expect(updated.map((r) => r.id)).toContain(rowAId)

    const [row] = await adminSql<Array<{ allow_inbound_documents: boolean }>>`
      SELECT allow_inbound_documents FROM accounting_sub_period WHERE id = ${rowAId}::uuid
    `
    expect(row?.allow_inbound_documents).toBe(false)
  })

  it("empty GUC returns zero rows (NULLIF guard)", async () => {
    const rows = await userSql.begin(async (tx) => {
      await tx.unsafe(`SELECT set_config('app.organization_id', '', true)`)
      return tx.unsafe<Array<{ id: string }>>(
        `SELECT id FROM accounting_sub_period`,
      )
    })
    expect(rows).toHaveLength(0)
  })

  it("WITH CHECK blocks INSERT with foreign org_id", async () => {
    // Scope to org B, try to plant a sub-period under org A (its own period).
    await expect(
      userSql.begin(async (tx) => {
        await tx.unsafe(
          `SELECT set_config('app.organization_id', '${orgBId}', true)`,
        )
        await tx.unsafe(
          `INSERT INTO accounting_sub_period
             (organization_id, period_id, slot_index, slot_kind, period_start, period_end, status)
           VALUES
             ('${orgAId}'::uuid, '${periodAId}'::uuid, 1, 'MONTH', '2026-02-01', '2026-02-28', 'OPEN')`,
        )
      }),
    ).rejects.toThrow(/row-level security/)
  })

  it("composite FK rejects a cross-org parent period", async () => {
    // org B, honestly scoped, cannot parent a slot on org A's period: the
    // composite (period_id, organization_id) FK has no matching (orgA period, orgB) key.
    await expect(
      adminSql`
        INSERT INTO accounting_sub_period
          (organization_id, period_id, slot_index, slot_kind, period_start, period_end, status)
        VALUES
          (${orgBId}::uuid, ${periodAId}::uuid, 0, 'MONTH', '2026-01-01', '2026-01-31', 'OPEN')
      `,
    ).rejects.toThrow(/accounting_sub_period_period_fk|foreign key/)
  })

  it("enforces one slot per (org, period, slot_index) (unique)", async () => {
    // org A already recorded slot_index 0 for periodA above.
    await expect(
      adminSql`
        INSERT INTO accounting_sub_period
          (organization_id, period_id, slot_index, slot_kind, period_start, period_end, status)
        VALUES
          (${orgAId}::uuid, ${periodAId}::uuid, 0, 'MONTH', '2026-01-01', '2026-01-31', 'OPEN')
      `,
    ).rejects.toThrow(/accounting_sub_period_slot_unique|duplicate key/)
  })
})
