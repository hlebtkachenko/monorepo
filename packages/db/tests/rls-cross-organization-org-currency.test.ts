/**
 * RLS cross-organization leak harness — org_currency (0076).
 *
 * org_currency records which ISO currencies an organization has enabled. A
 * cross-org leak would expose (or let one tenant toggle) another tenant's
 * currency set. This proves the standard `organization_isolation` policy (FORCE
 * RLS, USING + WITH CHECK, NULLIF guard) behaves on org_currency, and exercises
 * the per-org UNIQUE(organization_id, currency_code) enablement invariant.
 *
 * Registration parity (org_currency ∈ ORGANIZATION_SCOPED_TABLES ⇔ the policy
 * exists in the migrated DB) is asserted by the drift detector in
 * rls-cross-organization.test.ts.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { getTableColumns } from "drizzle-orm"
import { org_currency } from "../src/schema/org_currency.js"
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
  // truncateAll doesn't clear org_currency; remove our rows before it runs so
  // the shared container is clean for later files.
  await adminSql`DELETE FROM org_currency`
  await truncateAll(adminSql)
  await adminSql.end({ timeout: 5 })
  await userSql.end({ timeout: 5 })
})

describe("RLS cross-organization isolation — org_currency", () => {
  let orgAId: string
  let orgBId: string
  let rowAId: string

  beforeAll(async () => {
    const seed = await seedTwoOrganizations(adminSql)
    orgAId = seed.orgAId
    orgBId = seed.orgBId

    const [row] = await adminSql<Array<{ id: string }>>`
      INSERT INTO org_currency (organization_id, currency_code)
      VALUES (${orgAId}::uuid, 'EUR')
      RETURNING id
    `
    if (!row) throw new Error("Failed to seed org_currency")
    rowAId = row.id
  })

  it("drizzle DSL maps the org_currency column set", () => {
    const cols = Object.keys(getTableColumns(org_currency))
    expect(cols).toEqual(
      expect.arrayContaining([
        "id",
        "organization_id",
        "currency_code",
        "enabled_at",
        "enabled_by_user_id",
      ]),
    )
  })

  it("org A session sees org A's enablement", async () => {
    const rows = await userSql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.organization_id', '${orgAId}', true)`,
      )
      return tx.unsafe<Array<{ id: string }>>(
        `SELECT id FROM org_currency WHERE id = '${rowAId}'::uuid`,
      )
    })
    expect(rows.map((r) => r.id)).toContain(rowAId)
  })

  it("org B session sees zero rows for org A's enablement (SELECT leak)", async () => {
    const rows = await userSql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.organization_id', '${orgBId}', true)`,
      )
      return tx.unsafe<Array<{ id: string }>>(`SELECT id FROM org_currency`)
    })
    expect(rows.filter((r) => r.id === rowAId)).toHaveLength(0)
  })

  it("org B session cannot DELETE org A's enablement (row invisible, 0 affected)", async () => {
    const deleted = await userSql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.organization_id', '${orgBId}', true)`,
      )
      return tx.unsafe<Array<{ id: string }>>(
        `DELETE FROM org_currency WHERE id = '${rowAId}'::uuid RETURNING id`,
      )
    })
    expect(deleted).toHaveLength(0)

    const [row] = await adminSql<Array<{ id: string }>>`
      SELECT id FROM org_currency WHERE id = ${rowAId}::uuid
    `
    expect(row?.id).toBe(rowAId)
  })

  it("empty GUC returns zero rows (NULLIF guard)", async () => {
    const rows = await userSql.begin(async (tx) => {
      await tx.unsafe(`SELECT set_config('app.organization_id', '', true)`)
      return tx.unsafe<Array<{ id: string }>>(`SELECT id FROM org_currency`)
    })
    expect(rows).toHaveLength(0)
  })

  it("WITH CHECK blocks INSERT with foreign org_id", async () => {
    // Scope to org B, try to plant an enablement under org A.
    await expect(
      userSql.begin(async (tx) => {
        await tx.unsafe(
          `SELECT set_config('app.organization_id', '${orgBId}', true)`,
        )
        await tx.unsafe(
          `INSERT INTO org_currency (organization_id, currency_code)
           VALUES ('${orgAId}'::uuid, 'USD')`,
        )
      }),
    ).rejects.toThrow(/row-level security/)
  })

  it("enforces one enablement row per currency per org (unique)", async () => {
    // org A already enabled EUR above.
    await expect(
      adminSql`
        INSERT INTO org_currency (organization_id, currency_code)
        VALUES (${orgAId}::uuid, 'EUR')
      `,
    ).rejects.toThrow(/org_currency_org_currency_unique|duplicate key/)
  })
})
