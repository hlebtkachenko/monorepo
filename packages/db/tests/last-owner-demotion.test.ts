/**
 * Last-owner-demotion trigger tests.
 *
 * The `app_prevent_last_owner_demotion` trigger on workspace_membership:
 *   - Fails closed when app.app_user_role_name GUC is unset (THROW per Q7)
 *   - Allows app_admin connections to INSERT owner rows
 *   - Blocks app_user connections from inserting owner rows directly
 *   - Blocks demoting/deactivating the last owner via UPDATE
 *   - Blocks deleting the last owner via DELETE
 *   - Allows demotion when a second owner exists
 *
 * Test strategy: use the admin client (app_owner superuser) to control
 * SET LOCAL ROLE and SET LOCAL app.app_user_role_name to simulate different
 * connection contexts within a single transaction that is rolled back.
 *
 * Note: the admin client connects as the `postgres` superuser (testcontainer
 * default). SET LOCAL ROLE app_admin or app_user is allowed because app_owner
 * (which the superuser maps to for grant purposes) holds membership.
 * We use the admin URL but switch roles inside transactions.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { adminClient, truncateAll } from "./fixtures.js"
import postgres from "postgres"

let sql: postgres.Sql
let workspaceId: string
let userId: string

beforeAll(async () => {
  sql = adminClient()

  // Create a user + workspace to attach memberships to
  const [user] = await sql<Array<{ id: string }>>`
    INSERT INTO app_user (email, name, role)
    VALUES ('owner-test@test.invalid', 'Owner Test User', 'user')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `
  userId = user!.id

  const [ws] = await sql<Array<{ id: string }>>`
    INSERT INTO workspace (display_name, created_by_user_id)
    VALUES ('Owner Test Workspace', ${userId}::uuid)
    RETURNING id
  `
  workspaceId = ws!.id
})

afterAll(async () => {
  await truncateAll(sql)
  await sql.end({ timeout: 5 })
})

describe("app.app_user_role_name GUC fail-closed", () => {
  it("throws check_violation when GUC is unset on app_user connection", async () => {
    // Simulate app_user connection without GUC set.
    // Use a fresh single-connection client with app_user credentials.
    const appUserUrl = process.env["DATABASE_URL"]
    if (!appUserUrl) throw new Error("DATABASE_URL not set")

    const appUserSql = postgres(appUserUrl, {
      prepare: false,
      max: 1,
      onnotice: () => {},
    })

    try {
      // This test exercises the "GUC empty / NULL" path by setting the GUC to
      // '' with SET LOCAL inside the transaction. NULLIF converts '' to NULL,
      // which causes the trigger to raise check_violation (fail-closed behavior).
      //
      // Limitation: a true "GUC unset" state is impossible to reach on a role
      // that has `ALTER ROLE ... SET app.app_user_role_name = '...'` configured
      // (init.d/00-roles.sql sets this for app_user). The session always inherits
      // the ALTER ROLE default on connect. SET LOCAL = '' within a transaction is
      // the only portable way to exercise the NULLIF path in a test. The behavior
      // is identical: NULLIF('', '')::uuid → NULL → trigger raises check_violation.
      await expect(
        appUserSql.unsafe(`
          BEGIN;
          SET LOCAL app.app_user_role_name = '';
          INSERT INTO workspace_membership (workspace_id, user_id, role)
          VALUES ('${workspaceId}'::uuid, '${userId}'::uuid, 'member');
          ROLLBACK;
        `),
      ).rejects.toThrow(/check_violation|app_user_role_name/i)
    } finally {
      await appUserSql.end({ timeout: 5 })
    }
  })
})

describe("app_user cannot INSERT owner rows", () => {
  it("blocks INSERT with role=owner as app_user", async () => {
    const appUserUrl = process.env["DATABASE_URL"]
    if (!appUserUrl) throw new Error("DATABASE_URL not set")

    const appUserSql = postgres(appUserUrl, {
      prepare: false,
      max: 1,
      onnotice: () => {},
    })

    try {
      // app_user has app.app_user_role_name = 'app_user' set via ALTER ROLE
      // (from init.d/00-roles.sql). INSERT owner = blocked by trigger.
      await expect(
        appUserSql.unsafe(`
          INSERT INTO workspace_membership (workspace_id, user_id, role)
          VALUES ('${workspaceId}'::uuid, '${userId}'::uuid, 'owner')
        `),
      ).rejects.toThrow(/check_violation|app_user cannot INSERT/i)
    } finally {
      await appUserSql.end({ timeout: 5 })
    }
  })
})

describe("app_admin can INSERT owner rows", () => {
  it("allows owner INSERT via SET LOCAL ROLE app_admin", async () => {
    // Run as superuser (admin client), switch to app_admin inside a proper
    // transaction block. postgres-js sql.begin() issues BEGIN/COMMIT around
    // the callback, ensuring SET LOCAL statements apply within the same
    // transaction session and are not silently dropped by the simple-query protocol.
    //
    // The trigger checks: pg_has_role(current_user, app.app_user_role_name, 'MEMBER').
    // After SET ROLE app_admin, current_user = 'app_admin'. The GUC must name
    // 'app_user' (the role that IS the restricted user role). Then
    // pg_has_role('app_admin', 'app_user', 'MEMBER') = false → trigger allows INSERT.
    // Do NOT set the GUC to 'app_admin'; that would make pg_has_role trivially true.
    await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL ROLE app_admin`)
      await tx.unsafe(`SET LOCAL app.app_user_role_name = 'app_user'`)
      await tx.unsafe(
        `INSERT INTO workspace_membership (workspace_id, user_id, role)
         VALUES ('${workspaceId}'::uuid, '${userId}'::uuid, 'owner')`,
      )
    })

    // Verify the row was inserted
    const [row] = await sql<Array<{ id: string; role: string }>>`
      SELECT id, role FROM workspace_membership
      WHERE workspace_id = ${workspaceId}::uuid
        AND user_id = ${userId}::uuid
        AND role = 'owner'
        AND active = true
    `
    expect(row).toBeDefined()
    expect(row!.role).toBe("owner")
    const membershipId = row!.id

    // Cleanup: disable the last-owner-demotion trigger so we can delete the
    // sole owner row. ALTER TABLE is DDL and auto-commits, so run outside begin().
    await sql.unsafe(
      `ALTER TABLE workspace_membership DISABLE TRIGGER workspace_membership_prevent_last_owner_demotion`,
    )
    await sql.unsafe(
      `DELETE FROM workspace_membership WHERE id = '${membershipId}'::uuid`,
    )
    await sql.unsafe(
      `ALTER TABLE workspace_membership ENABLE TRIGGER workspace_membership_prevent_last_owner_demotion`,
    )
  })
})

describe("last-owner demotion guard", () => {
  let ownerMembershipId: string

  beforeAll(async () => {
    // Insert a sole owner via app_admin path (trigger allows it).
    // Use sql.begin() so SET LOCAL statements take effect within the same
    // transaction — multi-statement sql.unsafe() does not guarantee this.
    // GUC is set to 'app_user' (the restricted role name) so the trigger's
    // pg_has_role('app_admin', 'app_user', 'MEMBER') check returns false.
    await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL ROLE app_admin`)
      await tx.unsafe(`SET LOCAL app.app_user_role_name = 'app_user'`)
      await tx.unsafe(
        `INSERT INTO workspace_membership (workspace_id, user_id, role)
         VALUES ('${workspaceId}'::uuid, '${userId}'::uuid, 'owner')`,
      )
    })

    const [row] = await sql<Array<{ id: string }>>`
      SELECT id FROM workspace_membership
      WHERE workspace_id = ${workspaceId}::uuid
        AND user_id = ${userId}::uuid
        AND role = 'owner'
        AND active = true
      LIMIT 1
    `
    ownerMembershipId = row!.id
  })

  it("blocks UPDATE that demotes the last owner", async () => {
    // The trigger requires app.app_user_role_name to be set (fail-closed).
    // The admin client connects as postgres (no per-role GUC default), so all
    // trigger-touching statements must explicitly set the GUC in a transaction.
    await expect(
      sql.begin(async (tx) => {
        await tx.unsafe(`SET LOCAL app.app_user_role_name = 'app_user'`)
        await tx.unsafe(`
          UPDATE workspace_membership
          SET role = 'member'
          WHERE id = '${ownerMembershipId}'::uuid
        `)
      }),
    ).rejects.toThrow(/check_violation|last owner/i)
  })

  it("blocks UPDATE that deactivates the last owner", async () => {
    await expect(
      sql.begin(async (tx) => {
        await tx.unsafe(`SET LOCAL app.app_user_role_name = 'app_user'`)
        await tx.unsafe(`
          UPDATE workspace_membership
          SET active = false
          WHERE id = '${ownerMembershipId}'::uuid
        `)
      }),
    ).rejects.toThrow(/check_violation|last owner/i)
  })

  it("blocks DELETE of the last owner", async () => {
    await expect(
      sql.begin(async (tx) => {
        await tx.unsafe(`SET LOCAL app.app_user_role_name = 'app_user'`)
        await tx.unsafe(`
          DELETE FROM workspace_membership
          WHERE id = '${ownerMembershipId}'::uuid
        `)
      }),
    ).rejects.toThrow(/check_violation|last owner/i)
  })

  it("allows demotion when a second owner exists", async () => {
    // Create a second user + second owner membership
    const [user2] = await sql<Array<{ id: string }>>`
      INSERT INTO app_user (email, name, role)
      VALUES ('owner-2@test.invalid', 'Owner 2', 'user')
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `
    const userId2 = user2!.id

    // Insert second owner via app_admin using a proper transaction block.
    // app.app_user_role_name = 'app_user' so the trigger's pg_has_role check
    // resolves: pg_has_role('app_admin', 'app_user', 'MEMBER') = false → allow.
    await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL ROLE app_admin`)
      await tx.unsafe(`SET LOCAL app.app_user_role_name = 'app_user'`)
      await tx.unsafe(
        `INSERT INTO workspace_membership (workspace_id, user_id, role)
         VALUES ('${workspaceId}'::uuid, '${userId2}'::uuid, 'owner')`,
      )
    })

    // Now demoting the first owner should succeed (second owner remains).
    // GUC must be set for the trigger to proceed past the fail-closed check.
    await expect(
      sql.begin(async (tx) => {
        await tx.unsafe(`SET LOCAL app.app_user_role_name = 'app_user'`)
        await tx.unsafe(`
          UPDATE workspace_membership
          SET role = 'member'
          WHERE id = '${ownerMembershipId}'::uuid
        `)
      }),
    ).resolves.not.toThrow()
  })
})
