/**
 * RLS cross-workspace leak harness (inbox_attachment, S3 document store #518).
 *
 * inbox_attachment is WORKSPACE-scoped (ADR-0029, PLAN §2): a received file
 * precedes org filing and the same blob can be re-filed between companies
 * without re-uploading, so isolation is on `app.workspace_id`. This verifies
 * the four command-specific policies (0057) plus the durable-identity
 * constraints:
 *   - a row inserted under workspace A is invisible to a workspace-B session
 *     (SELECT leak) and cannot be UPDATE/DELETEd by it (0 rows affected)
 *   - INSERT WITH CHECK blocks planting a row under a foreign workspace_id
 *   - empty-string GUC (NULLIF guard) returns zero rows, not a cast error
 *   - UNIQUE(workspace_id, sha256) makes confirm idempotent (dedup)
 *   - the sha256 hex CHECK rejects a malformed content address
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { adminClient } from "./fixtures.js"
import postgres from "postgres"

let adminSql: postgres.Sql
let userSql: postgres.Sql

const WORKSPACE_A = "00000000-0000-0000-0000-0000000a11a1"
const WORKSPACE_B = "00000000-0000-0000-0000-0000000a11a2"
const CREATOR = "00000000-0000-0000-0000-0000000a11a3"

const SHA_A = "a".repeat(64)
const KEY_A = `documents/${WORKSPACE_A}/${SHA_A}.pdf`

let attachmentAId: string

beforeAll(async () => {
  adminSql = adminClient()
  const userUrl = process.env["DATABASE_URL"]
  if (!userUrl) throw new Error("DATABASE_URL not set — did globalSetup run?")
  userSql = postgres(userUrl, { prepare: false, max: 1, onnotice: () => {} })

  await adminSql.unsafe(`
    INSERT INTO app_user (id, email)
    VALUES ('${CREATOR}', 'inbox-attachment-fixture@test.invalid')
    ON CONFLICT (id) DO NOTHING
  `)
  await adminSql.unsafe(`
    INSERT INTO workspace (id, created_by_user_id, display_name)
    VALUES
      ('${WORKSPACE_A}', '${CREATOR}', 'Office A (inbox)'),
      ('${WORKSPACE_B}', '${CREATOR}', 'Office B (inbox)')
    ON CONFLICT (id) DO NOTHING
  `)

  const [row] = await adminSql<Array<{ id: string }>>`
    INSERT INTO inbox_attachment
      (workspace_id, storage_key, sha256, content_type, size, filename)
    VALUES (
      ${WORKSPACE_A}::uuid, ${KEY_A}, ${SHA_A}, 'application/pdf', 12345, 'invoice.pdf'
    )
    RETURNING id
  `
  if (!row) throw new Error("Failed to seed inbox_attachment")
  attachmentAId = row.id
})

afterAll(async () => {
  await adminSql.unsafe(
    `DELETE FROM inbox_attachment WHERE workspace_id IN ('${WORKSPACE_A}', '${WORKSPACE_B}')`,
  )
  await adminSql.unsafe(
    `DELETE FROM workspace WHERE id IN ('${WORKSPACE_A}', '${WORKSPACE_B}')`,
  )
  await adminSql.unsafe(`DELETE FROM app_user WHERE id = '${CREATOR}'`)
  await adminSql.end({ timeout: 5 })
  await userSql.end({ timeout: 5 })
})

describe("RLS cross-workspace isolation (inbox_attachment)", () => {
  it("workspace A session sees workspace A's attachment", async () => {
    const rows = await userSql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.workspace_id', '${WORKSPACE_A}', true)`,
      )
      return tx.unsafe<Array<{ id: string }>>(
        `SELECT id FROM inbox_attachment WHERE id = '${attachmentAId}'::uuid`,
      )
    })
    expect(rows.map((r) => r.id)).toContain(attachmentAId)
  })

  it("workspace B session sees zero rows for workspace A's attachment (SELECT leak)", async () => {
    const rows = await userSql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.workspace_id', '${WORKSPACE_B}', true)`,
      )
      return tx.unsafe<Array<{ id: string }>>(`SELECT id FROM inbox_attachment`)
    })
    expect(rows.filter((r) => r.id === attachmentAId)).toHaveLength(0)
  })

  it("workspace B session cannot UPDATE workspace A's attachment (row invisible, 0 affected)", async () => {
    const updated = await userSql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.workspace_id', '${WORKSPACE_B}', true)`,
      )
      return tx.unsafe<Array<{ id: string }>>(
        `UPDATE inbox_attachment SET filename = 'hacked.pdf'
         WHERE id = '${attachmentAId}'::uuid
         RETURNING id`,
      )
    })
    expect(updated).toHaveLength(0)

    const [row] = await adminSql<Array<{ filename: string }>>`
      SELECT filename FROM inbox_attachment WHERE id = ${attachmentAId}::uuid
    `
    expect(row?.filename).toBe("invoice.pdf")
  })

  it("workspace B session cannot DELETE workspace A's attachment (row invisible, 0 affected)", async () => {
    const deleted = await userSql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.workspace_id', '${WORKSPACE_B}', true)`,
      )
      return tx.unsafe<Array<{ id: string }>>(
        `DELETE FROM inbox_attachment WHERE id = '${attachmentAId}'::uuid RETURNING id`,
      )
    })
    expect(deleted).toHaveLength(0)

    const [row] = await adminSql<Array<{ id: string }>>`
      SELECT id FROM inbox_attachment WHERE id = ${attachmentAId}::uuid
    `
    expect(row?.id).toBe(attachmentAId)
  })

  it("empty GUC returns zero rows (NULLIF guard)", async () => {
    const rows = await userSql.begin(async (tx) => {
      await tx.unsafe(`SELECT set_config('app.workspace_id', '', true)`)
      return tx.unsafe<Array<{ id: string }>>(`SELECT id FROM inbox_attachment`)
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
          `INSERT INTO inbox_attachment
             (workspace_id, storage_key, sha256, content_type, size, filename)
           VALUES ('${WORKSPACE_A}'::uuid, 'documents/${WORKSPACE_A}/${"c".repeat(64)}.pdf',
                   '${"c".repeat(64)}', 'application/pdf', 10, 'leak.pdf')`,
        )
      }),
    ).rejects.toThrow(/row-level security/)
  })

  it("UNIQUE(workspace_id, sha256) makes confirm idempotent (dedup)", async () => {
    await expect(
      adminSql.unsafe(`
        INSERT INTO inbox_attachment
          (workspace_id, storage_key, sha256, content_type, size, filename)
        VALUES ('${WORKSPACE_A}'::uuid, '${KEY_A}', '${SHA_A}', 'application/pdf', 999, 'dupe.pdf')
      `),
    ).rejects.toThrow(/duplicate key value violates unique constraint/)
  })

  it("the sha256 hex CHECK rejects a malformed content address", async () => {
    await expect(
      adminSql.unsafe(`
        INSERT INTO inbox_attachment
          (workspace_id, storage_key, sha256, content_type, size, filename)
        VALUES ('${WORKSPACE_A}'::uuid, 'documents/x/bad.pdf', 'NOT-HEX', 'application/pdf', 10, 'bad.pdf')
      `),
    ).rejects.toThrow(/inbox_attachment_sha256_hex/)
  })
})
