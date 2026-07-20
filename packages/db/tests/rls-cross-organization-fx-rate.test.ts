/**
 * RLS harness — fx_rate (shared, Case B) + fx_rate_override (org-scoped) (0072).
 *
 * The FX rate store is deliberately two tables with two isolation postures:
 *   - fx_rate is a SHARED reference table (no RLS): the ČNB daily fix is the same
 *     for every tenant, so a rate inserted once is visible to ALL orgs.
 *   - fx_rate_override is ORG-SCOPED (FORCE RLS + organization_isolation): a
 *     tenant's manual rate must never leak into another tenant's books.
 *
 * This proves both: fx_rate rows cross the org boundary (by design), fx_rate_override
 * rows do not. Registration parity (fx_rate_override ∈ ORGANIZATION_SCOPED_TABLES,
 * fx_rate ∉ it) is asserted by the drift detector in rls-cross-organization.test.ts.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { getTableColumns } from "drizzle-orm"
import { fx_rate } from "../src/schema/fx_rate.js"
import { fx_rate_override } from "../src/schema/fx_rate_override.js"
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
  // truncateAll doesn't clear these; remove our rows so the shared container is
  // clean for later files.
  await adminSql`DELETE FROM fx_rate_override`
  await adminSql`DELETE FROM fx_rate`
  await truncateAll(adminSql)
  await adminSql.end({ timeout: 5 })
  await userSql.end({ timeout: 5 })
})

describe("fx_rate (shared, Case B) + fx_rate_override (org-scoped)", () => {
  let orgAId: string
  let orgBId: string
  let overrideAId: string

  beforeAll(async () => {
    const seed = await seedTwoOrganizations(adminSql)
    orgAId = seed.orgAId
    orgBId = seed.orgBId

    // A shared ČNB rate (no org).
    await adminSql`
      INSERT INTO fx_rate (from_code, to_code, rate_date, rate_kind, unit_amount, rate, source)
      VALUES ('EUR', 'CZK', '2026-07-20', 'DAILY', 1, 25.150000, 'CNB')
    `
    // An org A override for the same pair/date.
    const [row] = await adminSql<Array<{ id: string }>>`
      INSERT INTO fx_rate_override
        (organization_id, from_code, to_code, rate_date, rate_kind, unit_amount, rate, reason)
      VALUES
        (${orgAId}::uuid, 'EUR', 'CZK', '2026-07-20', 'DAILY', 1, 25.500000, 'forward contract')
      RETURNING id
    `
    if (!row) throw new Error("Failed to seed fx_rate_override")
    overrideAId = row.id
  })

  it("drizzle DSL maps both fx tables", () => {
    expect(Object.keys(getTableColumns(fx_rate))).toEqual(
      expect.arrayContaining([
        "from_code",
        "to_code",
        "rate_date",
        "rate",
        "source",
      ]),
    )
    expect(Object.keys(getTableColumns(fx_rate_override))).toEqual(
      expect.arrayContaining([
        "organization_id",
        "rate",
        "reason",
        "is_locked",
      ]),
    )
  })

  it("fx_rate (Case B) is visible to every org — org A sees the shared rate", async () => {
    const rows = await userSql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.organization_id', '${orgAId}', true)`,
      )
      return tx.unsafe<Array<{ rate: string }>>(
        `SELECT rate FROM fx_rate WHERE from_code = 'EUR' AND to_code = 'CZK'`,
      )
    })
    expect(rows).toHaveLength(1)
  })

  it("fx_rate (Case B) is visible to every org — org B sees the SAME shared rate", async () => {
    const rows = await userSql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.organization_id', '${orgBId}', true)`,
      )
      return tx.unsafe<Array<{ rate: string }>>(
        `SELECT rate FROM fx_rate WHERE from_code = 'EUR' AND to_code = 'CZK'`,
      )
    })
    expect(rows).toHaveLength(1)
  })

  it("fx_rate_override: org A session sees its override", async () => {
    const rows = await userSql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.organization_id', '${orgAId}', true)`,
      )
      return tx.unsafe<Array<{ id: string }>>(
        `SELECT id FROM fx_rate_override WHERE id = '${overrideAId}'::uuid`,
      )
    })
    expect(rows.map((r) => r.id)).toContain(overrideAId)
  })

  it("fx_rate_override: org B session sees zero rows for org A's override (SELECT leak)", async () => {
    const rows = await userSql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.organization_id', '${orgBId}', true)`,
      )
      return tx.unsafe<Array<{ id: string }>>(`SELECT id FROM fx_rate_override`)
    })
    expect(rows.filter((r) => r.id === overrideAId)).toHaveLength(0)
  })

  it("fx_rate_override: empty GUC returns zero rows (NULLIF guard)", async () => {
    const rows = await userSql.begin(async (tx) => {
      await tx.unsafe(`SELECT set_config('app.organization_id', '', true)`)
      return tx.unsafe<Array<{ id: string }>>(`SELECT id FROM fx_rate_override`)
    })
    expect(rows).toHaveLength(0)
  })

  it("fx_rate_override: WITH CHECK blocks INSERT with foreign org_id", async () => {
    await expect(
      userSql.begin(async (tx) => {
        await tx.unsafe(
          `SELECT set_config('app.organization_id', '${orgBId}', true)`,
        )
        await tx.unsafe(
          `INSERT INTO fx_rate_override
             (organization_id, from_code, to_code, rate_date, rate, reason)
           VALUES ('${orgAId}'::uuid, 'USD', 'CZK', '2026-07-20', 23.0, 'leak')`,
        )
      }),
    ).rejects.toThrow(/row-level security/)
  })

  it("fx_rate_override: natural-unique blocks a duplicate (org, pair, date, kind)", async () => {
    await expect(
      adminSql`
        INSERT INTO fx_rate_override
          (organization_id, from_code, to_code, rate_date, rate_kind, rate, reason)
        VALUES
          (${orgAId}::uuid, 'EUR', 'CZK', '2026-07-20', 'DAILY', 25.900000, 'dup')
      `,
    ).rejects.toThrow(/fx_rate_override_natural_unique|duplicate key/)
  })
})
