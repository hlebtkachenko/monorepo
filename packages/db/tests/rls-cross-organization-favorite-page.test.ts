/**
 * RLS cross-organization leak harness — favorite_page (0064).
 *
 * favorite_page holds a user's starred pages, scoped to one org. A cross-org
 * leak would surface one org's navigation/favorites inside another. This proves
 * the standard `organization_isolation` policy (FORCE RLS, USING + WITH CHECK,
 * NULLIF guard) behaves on favorite_page:
 *   - Rows for org A are invisible to a session scoped to org B (SELECT)
 *   - A foreign org_id is invisible to DELETE (0 rows affected)
 *   - Empty-string GUC (NULLIF guard) returns zero rows, not a cast error
 *   - INSERT WITH CHECK blocks writing a row with a foreign organization_id
 *
 * Registration parity (favorite_page ∈ ORGANIZATION_SCOPED_TABLES ⇔ the policy
 * exists in the migrated DB) is asserted by the drift detector in
 * rls-cross-organization.test.ts.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
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
  // truncateAll doesn't clear favorite_page; remove our rows before it runs so
  // the shared container is clean for later files.
  await adminSql`DELETE FROM favorite_page`
  await truncateAll(adminSql)
  await adminSql.end({ timeout: 5 })
  await userSql.end({ timeout: 5 })
})

describe("RLS cross-organization isolation — favorite_page", () => {
  let orgAId: string
  let orgBId: string
  let userAId: string
  let favAId: string

  beforeAll(async () => {
    const seed = await seedTwoOrganizations(adminSql)
    orgAId = seed.orgAId
    orgBId = seed.orgBId
    userAId = seed.userAId

    const [row] = await adminSql<Array<{ id: string }>>`
      INSERT INTO favorite_page (organization_id, user_id, page_route, module_key, label)
      VALUES (${orgAId}::uuid, ${userAId}::uuid, 'records/invoices-received', 'records', 'Invoices received')
      RETURNING id
    `
    if (!row) throw new Error("Failed to seed favorite_page")
    favAId = row.id
  })

  it("org A session sees org A's favorite", async () => {
    const rows = await userSql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.organization_id', '${orgAId}', true)`,
      )
      return tx.unsafe<Array<{ id: string }>>(
        `SELECT id FROM favorite_page WHERE id = '${favAId}'::uuid`,
      )
    })
    expect(rows.map((r) => r.id)).toContain(favAId)
  })

  it("org B session sees zero rows for org A's favorite (SELECT leak)", async () => {
    const rows = await userSql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.organization_id', '${orgBId}', true)`,
      )
      return tx.unsafe<Array<{ id: string }>>(`SELECT id FROM favorite_page`)
    })
    expect(rows.filter((r) => r.id === favAId)).toHaveLength(0)
  })

  it("org B session cannot DELETE org A's favorite (row invisible, 0 affected)", async () => {
    const deleted = await userSql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.organization_id', '${orgBId}', true)`,
      )
      return tx.unsafe<Array<{ id: string }>>(
        `DELETE FROM favorite_page WHERE id = '${favAId}'::uuid RETURNING id`,
      )
    })
    expect(deleted).toHaveLength(0)

    const [row] = await adminSql<Array<{ id: string }>>`
      SELECT id FROM favorite_page WHERE id = ${favAId}::uuid
    `
    expect(row?.id).toBe(favAId)
  })

  it("empty GUC returns zero rows (NULLIF guard)", async () => {
    const rows = await userSql.begin(async (tx) => {
      await tx.unsafe(`SELECT set_config('app.organization_id', '', true)`)
      return tx.unsafe<Array<{ id: string }>>(`SELECT id FROM favorite_page`)
    })
    expect(rows).toHaveLength(0)
  })

  it("WITH CHECK blocks INSERT with foreign org_id", async () => {
    // Scope to org B, try to plant a favorite under org A.
    await expect(
      userSql.begin(async (tx) => {
        await tx.unsafe(
          `SELECT set_config('app.organization_id', '${orgBId}', true)`,
        )
        await tx.unsafe(
          `INSERT INTO favorite_page (organization_id, user_id, page_route, module_key, label)
           VALUES ('${orgAId}'::uuid, '${userAId}'::uuid, 'records/leak', 'records', 'Leak')`,
        )
      }),
    ).rejects.toThrow(/row-level security/)
  })
})
