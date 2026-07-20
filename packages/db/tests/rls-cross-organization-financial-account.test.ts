/**
 * RLS cross-organization leak harness — financial_account (0070).
 *
 * financial_account holds a tenant's operational money places (bank / cash /
 * ceniny) — account numbers, IBANs, overdraft limits. A cross-org leak would
 * surface one tenant's bank details inside another. This proves the standard
 * `organization_isolation` policy (FORCE RLS, USING + WITH CHECK, NULLIF guard)
 * behaves on financial_account, and exercises the two partial-unique invariants
 * (1:1 GL analytic per org, one default payment account per org).
 *
 * Registration parity (financial_account ∈ ORGANIZATION_SCOPED_TABLES ⇔ the
 * policy exists in the migrated DB) is asserted by the drift detector in
 * rls-cross-organization.test.ts.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { getTableColumns } from "drizzle-orm"
import { financial_account } from "../src/schema/financial_account.js"
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
  // truncateAll doesn't clear financial_account; remove our rows before it runs
  // so the shared container is clean for later files.
  await adminSql`DELETE FROM financial_account`
  await truncateAll(adminSql)
  await adminSql.end({ timeout: 5 })
  await userSql.end({ timeout: 5 })
})

describe("RLS cross-organization isolation — financial_account", () => {
  let orgAId: string
  let orgBId: string
  let acctAId: string

  beforeAll(async () => {
    const seed = await seedTwoOrganizations(adminSql)
    orgAId = seed.orgAId
    orgBId = seed.orgBId

    const [row] = await adminSql<Array<{ id: string }>>`
      INSERT INTO financial_account
        (organization_id, kind, name, code, currency_code, gl_account_number)
      VALUES
        (${orgAId}::uuid, 'BANK', 'Provozní účet', 'BANK-CZK', 'CZK', '221001')
      RETURNING id
    `
    if (!row) throw new Error("Failed to seed financial_account")
    acctAId = row.id
  })

  it("drizzle DSL maps the financial_account column set", () => {
    const cols = Object.keys(getTableColumns(financial_account))
    expect(cols).toEqual(
      expect.arrayContaining([
        "id",
        "organization_id",
        "kind",
        "status",
        "currency_code",
        "gl_account_number",
        "is_default_payment_account",
      ]),
    )
  })

  it("org A session sees org A's account", async () => {
    const rows = await userSql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.organization_id', '${orgAId}', true)`,
      )
      return tx.unsafe<Array<{ id: string }>>(
        `SELECT id FROM financial_account WHERE id = '${acctAId}'::uuid`,
      )
    })
    expect(rows.map((r) => r.id)).toContain(acctAId)
  })

  it("org B session sees zero rows for org A's account (SELECT leak)", async () => {
    const rows = await userSql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.organization_id', '${orgBId}', true)`,
      )
      return tx.unsafe<Array<{ id: string }>>(
        `SELECT id FROM financial_account`,
      )
    })
    expect(rows.filter((r) => r.id === acctAId)).toHaveLength(0)
  })

  it("org B session cannot DELETE org A's account (row invisible, 0 affected)", async () => {
    const deleted = await userSql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.organization_id', '${orgBId}', true)`,
      )
      return tx.unsafe<Array<{ id: string }>>(
        `DELETE FROM financial_account WHERE id = '${acctAId}'::uuid RETURNING id`,
      )
    })
    expect(deleted).toHaveLength(0)

    const [row] = await adminSql<Array<{ id: string }>>`
      SELECT id FROM financial_account WHERE id = ${acctAId}::uuid
    `
    expect(row?.id).toBe(acctAId)
  })

  it("empty GUC returns zero rows (NULLIF guard)", async () => {
    const rows = await userSql.begin(async (tx) => {
      await tx.unsafe(`SELECT set_config('app.organization_id', '', true)`)
      return tx.unsafe<Array<{ id: string }>>(
        `SELECT id FROM financial_account`,
      )
    })
    expect(rows).toHaveLength(0)
  })

  it("WITH CHECK blocks INSERT with foreign org_id", async () => {
    // Scope to org B, try to plant an account under org A.
    await expect(
      userSql.begin(async (tx) => {
        await tx.unsafe(
          `SELECT set_config('app.organization_id', '${orgBId}', true)`,
        )
        await tx.unsafe(
          `INSERT INTO financial_account (organization_id, kind, name, code, currency_code)
           VALUES ('${orgAId}'::uuid, 'CASH', 'Leak', 'LEAK', 'CZK')`,
        )
      }),
    ).rejects.toThrow(/row-level security/)
  })

  it("enforces the 1:1 GL analytic invariant (partial-unique per org)", async () => {
    // acctA already occupies gl '221001' for org A.
    await expect(
      adminSql`
        INSERT INTO financial_account
          (organization_id, kind, name, code, currency_code, gl_account_number)
        VALUES
          (${orgAId}::uuid, 'BANK', 'Druhý účet', 'BANK-2', 'CZK', '221001')
      `,
    ).rejects.toThrow(/financial_account_org_gl_unique|duplicate key/)
  })

  it("enforces one default payment account per org (partial-unique)", async () => {
    await adminSql`
      INSERT INTO financial_account
        (organization_id, kind, name, code, currency_code, is_default_payment_account)
      VALUES
        (${orgAId}::uuid, 'BANK', 'Default 1', 'DEF-1', 'CZK', true)
    `
    await expect(
      adminSql`
        INSERT INTO financial_account
          (organization_id, kind, name, code, currency_code, is_default_payment_account)
        VALUES
          (${orgAId}::uuid, 'BANK', 'Default 2', 'DEF-2', 'CZK', true)
      `,
    ).rejects.toThrow(/financial_account_org_default_pay_unique|duplicate key/)
  })
})
