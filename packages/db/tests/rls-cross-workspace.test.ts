/**
 * RLS cross-workspace leak harness (ocr_extraction_template).
 *
 * The Brain OCR template library is WORKSPACE-scoped (ADR-0029): a supplier's
 * learned invoice layout is shared across every org in the accountant's office,
 * so isolation is on `app.workspace_id`, not `app.organization_id`. This verifies
 * the four command-specific policies (0047):
 *   - A template inserted under workspace A is not visible to a session scoped
 *     to workspace B (SELECT leak)
 *   - Workspace B cannot UPDATE / DELETE workspace A's template (row invisible,
 *     0 rows affected)
 *   - INSERT WITH CHECK prevents planting a row under a foreign workspace_id
 *   - Empty-string GUC (NULLIF guard) returns zero rows instead of a cast error
 *
 * Seeding mirrors rls-cross-organization.test.ts: the admin (superuser) client
 * seeds across workspace boundaries; assertions run on an app_user connection
 * (RLS applies) with the workspace GUC set per transaction.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { adminClient } from "./fixtures.js"
import postgres from "postgres"

let adminSql: postgres.Sql
let userSql: postgres.Sql

// Two distinct workspaces (fixed hex UUIDs so a reused container is deterministic).
const WORKSPACE_A = "00000000-0000-0000-0000-00000000cafe"
const WORKSPACE_B = "00000000-0000-0000-0000-00000000beef"
const CREATOR = "00000000-0000-0000-0000-00000000c0de"

let templateAId: string

beforeAll(async () => {
  adminSql = adminClient()
  const userUrl = process.env["DATABASE_URL"]
  if (!userUrl) throw new Error("DATABASE_URL not set — did globalSetup run?")
  userSql = postgres(userUrl, { prepare: false, max: 1, onnotice: () => {} })

  // A creator user, then two workspaces under it. Superuser seeding bypasses RLS.
  await adminSql.unsafe(`
    INSERT INTO app_user (id, email)
    VALUES ('${CREATOR}', 'ocr-fixture@test.invalid')
    ON CONFLICT (id) DO NOTHING
  `)
  await adminSql.unsafe(`
    INSERT INTO workspace (id, created_by_user_id, display_name)
    VALUES
      ('${WORKSPACE_A}', '${CREATOR}', 'Office A'),
      ('${WORKSPACE_B}', '${CREATOR}', 'Office B')
    ON CONFLICT (id) DO NOTHING
  `)

  // One template under workspace A only.
  const [row] = await adminSql<Array<{ id: string }>>`
    INSERT INTO ocr_extraction_template (workspace_id, supplier_key, doc_kind, locators)
    VALUES (${WORKSPACE_A}::uuid, '12345678', 'invoice_received', ${'{"total":{"page":1}}'}::jsonb)
    RETURNING id
  `
  if (!row) throw new Error("Failed to seed ocr_extraction_template")
  templateAId = row.id
})

afterAll(async () => {
  await adminSql.unsafe(
    `DELETE FROM ocr_extraction_template WHERE workspace_id IN ('${WORKSPACE_A}', '${WORKSPACE_B}')`,
  )
  await adminSql.unsafe(
    `DELETE FROM workspace WHERE id IN ('${WORKSPACE_A}', '${WORKSPACE_B}')`,
  )
  await adminSql.unsafe(`DELETE FROM app_user WHERE id = '${CREATOR}'`)
  await adminSql.end({ timeout: 5 })
  await userSql.end({ timeout: 5 })
})

describe("RLS cross-workspace isolation (ocr_extraction_template)", () => {
  it("workspace A session sees workspace A's template", async () => {
    const rows = await userSql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.workspace_id', '${WORKSPACE_A}', true)`,
      )
      return tx.unsafe<Array<{ id: string }>>(
        `SELECT id FROM ocr_extraction_template WHERE id = '${templateAId}'::uuid`,
      )
    })
    expect(rows.map((r) => r.id)).toContain(templateAId)
  })

  it("workspace B session sees zero rows for workspace A's template (SELECT leak)", async () => {
    const rows = await userSql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.workspace_id', '${WORKSPACE_B}', true)`,
      )
      return tx.unsafe<Array<{ id: string }>>(
        `SELECT id FROM ocr_extraction_template`,
      )
    })
    expect(rows.filter((r) => r.id === templateAId)).toHaveLength(0)
  })

  it("workspace B session cannot UPDATE workspace A's template (row invisible, 0 affected)", async () => {
    const updated = await userSql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.workspace_id', '${WORKSPACE_B}', true)`,
      )
      return tx.unsafe<Array<{ id: string }>>(
        `UPDATE ocr_extraction_template SET held_count = held_count + 1
         WHERE id = '${templateAId}'::uuid
         RETURNING id`,
      )
    })
    expect(updated).toHaveLength(0)

    // The row is untouched — verify via the admin client (bypasses RLS).
    const [row] = await adminSql<Array<{ held_count: number }>>`
      SELECT held_count FROM ocr_extraction_template WHERE id = ${templateAId}::uuid
    `
    expect(row?.held_count).toBe(0)
  })

  it("workspace B session cannot DELETE workspace A's template (row invisible, 0 affected)", async () => {
    const deleted = await userSql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.workspace_id', '${WORKSPACE_B}', true)`,
      )
      return tx.unsafe<Array<{ id: string }>>(
        `DELETE FROM ocr_extraction_template WHERE id = '${templateAId}'::uuid RETURNING id`,
      )
    })
    expect(deleted).toHaveLength(0)

    const [row] = await adminSql<Array<{ id: string }>>`
      SELECT id FROM ocr_extraction_template WHERE id = ${templateAId}::uuid
    `
    expect(row?.id).toBe(templateAId)
  })

  it("empty GUC returns zero rows (NULLIF guard)", async () => {
    const rows = await userSql.begin(async (tx) => {
      await tx.unsafe(`SELECT set_config('app.workspace_id', '', true)`)
      return tx.unsafe<Array<{ id: string }>>(
        `SELECT id FROM ocr_extraction_template`,
      )
    })
    expect(rows).toHaveLength(0)
  })

  it("WITH CHECK blocks INSERT with a foreign workspace_id", async () => {
    // Scope to workspace B, try to plant a template under workspace A.
    await expect(
      userSql.begin(async (tx) => {
        await tx.unsafe(
          `SELECT set_config('app.workspace_id', '${WORKSPACE_B}', true)`,
        )
        await tx.unsafe(
          `INSERT INTO ocr_extraction_template (workspace_id, supplier_key, doc_kind, locators)
           VALUES ('${WORKSPACE_A}'::uuid, 'leak', 'invoice_received', '{}'::jsonb)`,
        )
      }),
    ).rejects.toThrow(/row-level security/)
  })
})
