/**
 * Integration tests for writeAuditEvent + writeAuditEventGlobal.
 *
 * Verifies:
 *   - Happy path: row is written with the expected fields.
 *   - RLS enforcement: writeAuditEvent requires WorkspaceBoundDb
 *     (fails with a raw unscoped tx where app.workspace_id GUC is unset).
 *   - writeAuditEventGlobal: succeeds via withAdminBypass using the sentinel
 *     workspace_id (no real workspace row needed since the FK references
 *     workspace.id — we seed a real workspace for this test).
 *   - Payload redaction: a payload containing a baseline-key field (e.g.
 *     "email") is stored as "[REDACTED]".
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { bootPostgres18 } from "@workspace/testcontainers"
import type { BootResult } from "@workspace/testcontainers"
import postgres from "postgres"

let boot: BootResult
let adminSql: postgres.Sql

beforeAll(async () => {
  boot = await bootPostgres18()
  process.env["DATABASE_URL"] = boot.userUrl
  process.env["DATABASE_DIRECT_URL"] = boot.adminUrl
  const { adminClient } = await import("./fixtures.js")
  adminSql = adminClient()
}, 120_000)

afterAll(async () => {
  await adminSql.end({ timeout: 5 })
  if (boot?.container) await boot.container.stop()
})

beforeEach(async () => {
  const { truncateAll } = await import("./fixtures.js")
  await truncateAll(adminSql)
})

// ---------------------------------------------------------------------------
// Shared seed helpers
// ---------------------------------------------------------------------------

async function seedWorkspace(): Promise<{
  workspaceId: string
  userId: string
}> {
  const [creator] = await adminSql<Array<{ id: string }>>`
    INSERT INTO app_user (email, name, role)
    VALUES ('audit-event-test@test.invalid', 'Audit Test User', 'user')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `
  if (!creator) throw new Error("Failed to create user")

  const [ws] = await adminSql<Array<{ id: string }>>`
    INSERT INTO workspace (display_name, created_by_user_id)
    VALUES ('Audit Test Workspace', ${creator.id})
    RETURNING id
  `
  if (!ws) throw new Error("Failed to create workspace")

  // The last-owner-demotion trigger rejects INSERTs from app_user; elevate
  // to app_admin + set the GUC for the duration of the transaction.
  await adminSql.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL ROLE app_admin`)
    await tx.unsafe(`SET LOCAL app.app_user_role_name = 'app_user'`)
    await tx.unsafe(`
      INSERT INTO workspace_membership (workspace_id, user_id, role)
      VALUES ('${ws.id}'::uuid, '${creator.id}'::uuid, 'owner')
      ON CONFLICT DO NOTHING
    `)
  })

  return { workspaceId: ws.id, userId: creator.id }
}

// ---------------------------------------------------------------------------
// writeAuditEvent — happy path
// ---------------------------------------------------------------------------

describe("writeAuditEvent — happy path", () => {
  it("inserts an audit_event row with correct fields", async () => {
    const { workspaceId, userId } = await seedWorkspace()
    const { withWorkspace } = await import("../src/tenancy.js")
    const { writeAuditEvent } = await import("../src/audit/write-log.js")

    await withWorkspace(workspaceId, userId, async (tx) => {
      await writeAuditEvent(tx, {
        workspaceId,
        actorUserId: userId,
        action: "auth.login.success",
        payload: { path: "/sign-in/email", ip: "192.168.1.0/24" },
      })
    })

    const [row] = await adminSql<
      Array<{
        workspace_id: string
        actor_user_id: string
        action: string
        payload: Record<string, unknown>
      }>
    >`
      SELECT workspace_id, actor_user_id, action, payload
      FROM audit_event
      WHERE action = 'auth.login.success'
      LIMIT 1
    `
    expect(row).toBeDefined()
    expect(row?.workspace_id).toBe(workspaceId)
    expect(row?.actor_user_id).toBe(userId)
    expect(row?.action).toBe("auth.login.success")
    expect(row?.payload).toMatchObject({ path: "/sign-in/email" })
  })
})

// ---------------------------------------------------------------------------
// writeAuditEvent — RLS enforcement
// ---------------------------------------------------------------------------

describe("writeAuditEvent — RLS enforcement", () => {
  it("fails when app.workspace_id GUC is not set (no withWorkspace context)", async () => {
    const { workspaceId, userId } = await seedWorkspace()

    // Attempt a write using the raw user connection without setting the GUC.
    const userSql = postgres(boot.userUrl, {
      prepare: false,
      max: 1,
      onnotice: () => {},
    })
    try {
      await expect(
        userSql`
          INSERT INTO audit_event (workspace_id, actor_user_id, action, payload)
          VALUES (
            ${workspaceId}::uuid,
            ${userId}::uuid,
            'auth.login.test',
            '{}'::jsonb
          )
        `,
      ).rejects.toThrow()
    } finally {
      await userSql.end({ timeout: 5 })
    }
  })
})

// ---------------------------------------------------------------------------
// writeAuditEventGlobal — happy path (sentinel workspace)
// ---------------------------------------------------------------------------

describe("writeAuditEventGlobal — sentinel workspace_id", () => {
  it("inserts a row using withAdminBypass with a real workspace_id", async () => {
    const { workspaceId } = await seedWorkspace()
    const { writeAuditEventGlobal } = await import("../src/audit/write-log.js")

    // writeAuditEventGlobal does not require a workspace tx — it uses
    // withAdminBypass. We supply a real workspace_id to satisfy the FK.
    await writeAuditEventGlobal({
      workspaceId,
      action: "auth.admin.allowlist_denied",
      payload: { user_id: "some-user-id" },
    })

    const [row] = await adminSql<
      Array<{ action: string; payload: Record<string, unknown> }>
    >`
      SELECT action, payload FROM audit_event
      WHERE action = 'auth.admin.allowlist_denied'
      LIMIT 1
    `
    expect(row?.action).toBe("auth.admin.allowlist_denied")
    expect(row?.payload).toMatchObject({ user_id: "some-user-id" })
  })
})

// ---------------------------------------------------------------------------
// Payload redaction — baseline keys stripped
// ---------------------------------------------------------------------------

describe("writeAuditEvent — baseline key redaction", () => {
  it("redacts 'email' key in payload before persistence", async () => {
    const { workspaceId, userId } = await seedWorkspace()
    const { withWorkspace } = await import("../src/tenancy.js")
    const { writeAuditEvent } = await import("../src/audit/write-log.js")

    await withWorkspace(workspaceId, userId, async (tx) => {
      await writeAuditEvent(tx, {
        workspaceId,
        actorUserId: userId,
        action: "auth.login.failed_password",
        payload: {
          email: "secret@example.com",
          path: "/sign-in/email",
        },
      })
    })

    const [row] = await adminSql<Array<{ payload: Record<string, unknown> }>>`
      SELECT payload FROM audit_event
      WHERE action = 'auth.login.failed_password'
      LIMIT 1
    `
    expect(row?.payload["email"]).toBe("[REDACTED]")
    expect(row?.payload["path"]).toBe("/sign-in/email")
  })
})
