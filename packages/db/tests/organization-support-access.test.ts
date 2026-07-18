/**
 * organization.support_access_expires_at behavior harness (0065 / F11).
 *
 * The per-org consent flag gates admin support login. This proves the DB-level
 * behavior the `setSupportAccess` server action and the admin impersonation
 * precondition rely on:
 *   - An owner/admin (app_user bound to its own org GUC) can set a future
 *     7-day consent window, and `support_access_expires_at > now()` then reads
 *     true (the precondition predicate).
 *   - FORCE RLS blocks writing the flag on a FOREIGN org (the write can only
 *     ever touch the caller's own org).
 *   - Revoke clears the window (predicate reads false) and the force-end query
 *     ends every live impersonation row for the org in one statement.
 *
 * The app-level owner/admin role gate lives in the server action (outside the
 * DB); here the RLS boundary is the write's tenant safety net.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import postgres from "postgres"

import {
  adminClient,
  seedTwoOrganizations,
  truncateAll,
  userClient,
} from "./fixtures.js"

let adminSql: postgres.Sql
let userSql: postgres.Sql

let workspaceId: string
let orgAId: string
let orgBId: string
let userAId: string
let userBId: string

beforeAll(async () => {
  adminSql = adminClient()
  userSql = userClient()
  const seed = await seedTwoOrganizations(adminSql)
  workspaceId = seed.workspaceId
  orgAId = seed.orgAId
  orgBId = seed.orgBId
  userAId = seed.userAId
  userBId = seed.userBId
})

afterAll(async () => {
  await adminSql`DELETE FROM impersonation`
  await adminSql`UPDATE organization SET support_access_expires_at = NULL`
  await truncateAll(adminSql)
  await adminSql.end({ timeout: 5 })
  await userSql.end({ timeout: 5 })
})

async function grantedForOrg(orgId: string): Promise<boolean | null> {
  const [row] = await adminSql<Array<{ granted: boolean | null }>>`
    SELECT (support_access_expires_at > now()) AS granted
    FROM organization WHERE id = ${orgId}::uuid
  `
  return row?.granted ?? null
}

describe("organization.support_access_expires_at (F11 consent gate)", () => {
  it("owner/admin opens a 7-day consent window; the precondition reads true", async () => {
    const affected = await userSql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.organization_id', '${orgAId}', true)`,
      )
      return tx.unsafe<Array<{ id: string }>>(
        `UPDATE organization
           SET support_access_expires_at = now() + interval '7 days'
         WHERE id = '${orgAId}'::uuid
         RETURNING id`,
      )
    })
    expect(affected).toHaveLength(1)
    expect(await grantedForOrg(orgAId)).toBe(true)

    // The window is ~7 days out, not an arbitrary near-future value.
    const [row] = await adminSql<Array<{ days: number }>>`
      SELECT (EXTRACT(EPOCH FROM (support_access_expires_at - now())) / 86400)::float8 AS days
      FROM organization WHERE id = ${orgAId}::uuid
    `
    expect(Number(row?.days)).toBeGreaterThan(6.9)
    expect(Number(row?.days)).toBeLessThan(7.1)
  })

  it("FORCE RLS blocks setting the flag on a foreign org", async () => {
    // Scoped to org B, try to grant on org A: the row is invisible → 0 affected.
    const affected = await userSql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.organization_id', '${orgBId}', true)`,
      )
      return tx.unsafe<Array<{ id: string }>>(
        `UPDATE organization
           SET support_access_expires_at = now() + interval '7 days'
         WHERE id = '${orgAId}'::uuid
         RETURNING id`,
      )
    })
    expect(affected).toHaveLength(0)
    // Org B itself never got a grant.
    expect(await grantedForOrg(orgBId)).not.toBe(true)
  })

  it("revoke clears the window and force-ends live impersonation for the org", async () => {
    // A live operator session for org A (admin bypass — app_user has no grant).
    const [imp] = await adminSql<Array<{ id: string }>>`
      INSERT INTO impersonation
        (workspace_id, organization_id, actor_user_id, target_user_id, reason, expected_end_at)
      VALUES
        (${workspaceId}::uuid, ${orgAId}::uuid, ${userBId}::uuid, ${userAId}::uuid,
         'support session', now() + interval '30 minutes')
      RETURNING id
    `
    if (!imp) throw new Error("failed to seed impersonation row")

    // Revoke: owner/admin writes NULL to its own org.
    await userSql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.organization_id', '${orgAId}', true)`,
      )
      await tx.unsafe(
        `UPDATE organization SET support_access_expires_at = NULL WHERE id = '${orgAId}'::uuid`,
      )
    })
    expect(await grantedForOrg(orgAId)).not.toBe(true)

    // Force-end (admin bypass) closes every live row for the org.
    const ended = await adminSql<Array<{ id: string }>>`
      UPDATE impersonation SET ended_at = now()
      WHERE organization_id = ${orgAId}::uuid AND ended_at IS NULL
      RETURNING id
    `
    expect(ended.map((r) => r.id)).toContain(imp.id)

    const [after] = await adminSql<Array<{ ended_at: Date | null }>>`
      SELECT ended_at FROM impersonation WHERE id = ${imp.id}::uuid
    `
    expect(after?.ended_at).not.toBeNull()
  })
})
