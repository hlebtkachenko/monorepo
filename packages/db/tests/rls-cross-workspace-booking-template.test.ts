/**
 * RLS cross-workspace leak harness (booking_template, M2.1).
 *
 * The Brain booking-template library is WORKSPACE-scoped (ADR-0029), mirroring
 * ocr_extraction_template (see rls-cross-workspace.test.ts): a recurring
 * counterparty relationship is shared across every org in the accountant's
 * office, so isolation is on `app.workspace_id`, not `app.organization_id`.
 * This verifies the four command-specific policies (0054):
 *   - A template inserted under workspace A is not visible to a session scoped
 *     to workspace B (SELECT leak)
 *   - Workspace B cannot UPDATE / DELETE workspace A's template (row invisible,
 *     0 rows affected)
 *   - INSERT WITH CHECK prevents planting a row under a foreign workspace_id
 *   - Empty-string GUC (NULLIF guard) returns zero rows instead of a cast error
 *   - The partial unique index only fires for CONFIRMED templates (two
 *     unconfirmed drafts with the same signature may coexist)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { adminClient } from "./fixtures.js"
import postgres from "postgres"

let adminSql: postgres.Sql
let userSql: postgres.Sql

const WORKSPACE_A = "00000000-0000-0000-0000-00000000fee1"
const WORKSPACE_B = "00000000-0000-0000-0000-00000000fee2"
const CREATOR = "00000000-0000-0000-0000-00000000fee3"

const DECISION = JSON.stringify({
  vatMode: "STANDARD",
  vatJurisdiction: "DOMESTIC",
  vatRate: "21",
  scenario: "P-SERVICES-21",
  saldoAccount: "321",
  commodityCode: null,
})

let templateAId: string

beforeAll(async () => {
  adminSql = adminClient()
  const userUrl = process.env["DATABASE_URL"]
  if (!userUrl) throw new Error("DATABASE_URL not set — did globalSetup run?")
  userSql = postgres(userUrl, { prepare: false, max: 1, onnotice: () => {} })

  await adminSql.unsafe(`
    INSERT INTO app_user (id, email)
    VALUES ('${CREATOR}', 'booking-template-fixture@test.invalid')
    ON CONFLICT (id) DO NOTHING
  `)
  await adminSql.unsafe(`
    INSERT INTO workspace (id, created_by_user_id, display_name)
    VALUES
      ('${WORKSPACE_A}', '${CREATOR}', 'Office A'),
      ('${WORKSPACE_B}', '${CREATOR}', 'Office B')
    ON CONFLICT (id) DO NOTHING
  `)

  const [row] = await adminSql<Array<{ id: string }>>`
    INSERT INTO booking_template
      (workspace_id, counterparty_key, direction, supply_kind, jurisdiction, confirmed_decision, human_confirmed_at)
    VALUES (
      ${WORKSPACE_A}::uuid, '27082440', 'RECEIVED', 'SERVICES', 'DOMESTIC',
      ${DECISION}::jsonb, now()
    )
    RETURNING id
  `
  if (!row) throw new Error("Failed to seed booking_template")
  templateAId = row.id
})

afterAll(async () => {
  await adminSql.unsafe(
    `DELETE FROM booking_template WHERE workspace_id IN ('${WORKSPACE_A}', '${WORKSPACE_B}')`,
  )
  await adminSql.unsafe(
    `DELETE FROM workspace WHERE id IN ('${WORKSPACE_A}', '${WORKSPACE_B}')`,
  )
  await adminSql.unsafe(`DELETE FROM app_user WHERE id = '${CREATOR}'`)
  await adminSql.end({ timeout: 5 })
  await userSql.end({ timeout: 5 })
})

describe("RLS cross-workspace isolation (booking_template)", () => {
  it("workspace A session sees workspace A's template", async () => {
    const rows = await userSql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.workspace_id', '${WORKSPACE_A}', true)`,
      )
      return tx.unsafe<Array<{ id: string }>>(
        `SELECT id FROM booking_template WHERE id = '${templateAId}'::uuid`,
      )
    })
    expect(rows.map((r) => r.id)).toContain(templateAId)
  })

  it("workspace B session sees zero rows for workspace A's template (SELECT leak)", async () => {
    const rows = await userSql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.workspace_id', '${WORKSPACE_B}', true)`,
      )
      return tx.unsafe<Array<{ id: string }>>(`SELECT id FROM booking_template`)
    })
    expect(rows.filter((r) => r.id === templateAId)).toHaveLength(0)
  })

  it("workspace B session cannot UPDATE workspace A's template (row invisible, 0 affected)", async () => {
    const updated = await userSql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.workspace_id', '${WORKSPACE_B}', true)`,
      )
      return tx.unsafe<Array<{ id: string }>>(
        `UPDATE booking_template SET match_count = match_count + 1
         WHERE id = '${templateAId}'::uuid
         RETURNING id`,
      )
    })
    expect(updated).toHaveLength(0)

    const [row] = await adminSql<Array<{ match_count: number }>>`
      SELECT match_count FROM booking_template WHERE id = ${templateAId}::uuid
    `
    expect(row?.match_count).toBe(0)
  })

  it("workspace B session cannot DELETE workspace A's template (row invisible, 0 affected)", async () => {
    const deleted = await userSql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.workspace_id', '${WORKSPACE_B}', true)`,
      )
      return tx.unsafe<Array<{ id: string }>>(
        `DELETE FROM booking_template WHERE id = '${templateAId}'::uuid RETURNING id`,
      )
    })
    expect(deleted).toHaveLength(0)

    const [row] = await adminSql<Array<{ id: string }>>`
      SELECT id FROM booking_template WHERE id = ${templateAId}::uuid
    `
    expect(row?.id).toBe(templateAId)
  })

  it("empty GUC returns zero rows (NULLIF guard)", async () => {
    const rows = await userSql.begin(async (tx) => {
      await tx.unsafe(`SELECT set_config('app.workspace_id', '', true)`)
      return tx.unsafe<Array<{ id: string }>>(`SELECT id FROM booking_template`)
    })
    expect(rows).toHaveLength(0)
  })

  it("WITH CHECK blocks INSERT with a foreign workspace_id", async () => {
    await expect(
      userSql.begin(async (tx) => {
        await tx.unsafe(
          `SELECT set_config('app.workspace_id', '${WORKSPACE_B}', true)`,
        )
        await tx.unsafe(
          `INSERT INTO booking_template
             (workspace_id, counterparty_key, direction, supply_kind, jurisdiction, confirmed_decision)
           VALUES ('${WORKSPACE_A}'::uuid, 'leak', 'RECEIVED', 'SERVICES', 'DOMESTIC', '{}'::jsonb)`,
        )
      }),
    ).rejects.toThrow(/row-level security/)
  })

  it("the confirmed-signature unique index only fires once human_confirmed_at is set", async () => {
    // Two UNCONFIRMED drafts for the SAME signature may coexist...
    await adminSql.unsafe(`
      INSERT INTO booking_template
        (workspace_id, counterparty_key, direction, supply_kind, jurisdiction, confirmed_decision)
      VALUES
        ('${WORKSPACE_A}'::uuid, '99999999', 'ISSUED', 'GOODS', 'DOMESTIC', '{}'::jsonb),
        ('${WORKSPACE_A}'::uuid, '99999999', 'ISSUED', 'GOODS', 'DOMESTIC', '{}'::jsonb)
    `)
    // ...but a SECOND confirmed template for the same signature is rejected.
    await adminSql.unsafe(`
      UPDATE booking_template SET human_confirmed_at = now()
      WHERE workspace_id = '${WORKSPACE_A}'::uuid AND counterparty_key = '99999999'
      AND id = (
        SELECT id FROM booking_template
        WHERE workspace_id = '${WORKSPACE_A}'::uuid AND counterparty_key = '99999999'
        LIMIT 1
      )
    `)
    await expect(
      adminSql.unsafe(`
        UPDATE booking_template SET human_confirmed_at = now()
        WHERE workspace_id = '${WORKSPACE_A}'::uuid AND counterparty_key = '99999999'
          AND human_confirmed_at IS NULL
      `),
    ).rejects.toThrow(/duplicate key value violates unique constraint/)
  })
})
