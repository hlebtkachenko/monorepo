/**
 * [§I8] Confident-wrong circuit-breaker seams, against the PG18 testcontainer.
 *
 * Exercises the three workspace-scoped seams (`packages/db/src/brain/
 * confident-wrong.ts`) under REAL RLS inside a `withOrganization` tx:
 *
 *   - readConfidentWrongCount — 0 when no row / when cleared, the count when > 0.
 *   - recordConfidentWrong    — the INCREMENT guard: refuses a HELD (not
 *     auto-applied) write, increments for an AUTO-APPLIED one, and is a monotone
 *     upsert (1 → 2). Workspace-isolated (a second workspace never sees it).
 *   - resetConfidentWrongCount — zeroes the counter + stamps who/when.
 *
 * These pin the load-bearing safety property: the breaker can ONLY be tripped by
 * an auto-applied write a human marked wrong — never by a held write — and the
 * count it exposes to the gate is honest and workspace-scoped.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import postgres from "postgres"

let withOrganization: (typeof import("@workspace/db"))["withOrganization"]
let executeRows: (typeof import("@workspace/db"))["executeRows"]
let sqlTag: (typeof import("@workspace/db"))["sql"]
let readConfidentWrongCount: (typeof import("@workspace/db"))["readConfidentWrongCount"]
let recordConfidentWrong: (typeof import("@workspace/db"))["recordConfidentWrong"]
let resetConfidentWrongCount: (typeof import("@workspace/db"))["resetConfidentWrongCount"]

let adminClient: (typeof import("@workspace/db/tests/fixtures"))["adminClient"]
let truncateAll: (typeof import("@workspace/db/tests/fixtures"))["truncateAll"]

let sql: postgres.Sql

beforeAll(async () => {
  ;({ adminClient, truncateAll } = await import("@workspace/db/tests/fixtures"))
  ;({
    withOrganization,
    executeRows,
    sql: sqlTag,
    readConfidentWrongCount,
    recordConfidentWrong,
    resetConfidentWrongCount,
  } = await import("@workspace/db"))
  sql = adminClient()
  await sql`DELETE FROM brain_confident_wrong`
  await truncateAll(sql)
}, 60_000)

afterAll(async () => {
  await sql`DELETE FROM brain_confident_wrong`
  await truncateAll(sql)
  await sql.end({ timeout: 5 })
})

beforeEach(async () => {
  // Delete the FK-child (brain_confident_wrong → workspace) BEFORE truncateAll
  // drops workspace rows, so no orphan row survives across cases.
  await sql`DELETE FROM brain_confident_wrong`
  await truncateAll(sql)
})

// ---------------------------------------------------------------------------
// Seed helpers (admin/superuser client — bypasses RLS during seeding).
// ---------------------------------------------------------------------------

async function seedOrg(): Promise<{
  userId: string
  workspaceId: string
  organizationId: string
}> {
  const [owner] = await sql<Array<{ id: string }>>`
    INSERT INTO app_user (email, name, role)
    VALUES (${`owner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@cw-test.invalid`}, 'Owner', 'user')
    RETURNING id
  `
  if (!owner) throw new Error("owner insert failed")

  const [ws] = await sql<Array<{ id: string }>>`
    INSERT INTO workspace (display_name, created_by_user_id)
    VALUES ('CW Test Workspace', ${owner.id}::uuid)
    RETURNING id
  `
  if (!ws) throw new Error("workspace insert failed")

  await sql.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL ROLE app_admin`)
    await tx.unsafe(`SET LOCAL app.app_user_role_name = 'app_user'`)
    await tx.unsafe(
      `INSERT INTO workspace_membership (workspace_id, user_id, role)
       VALUES ('${ws.id}'::uuid, '${owner.id}'::uuid, 'owner')`,
    )
  })

  const [org] = await sql<Array<{ id: string }>>`
    INSERT INTO organization (
      organization_id, workspace_id, slug, legal_name,
      person_kind, legal_subject_kind
    )
    VALUES (uuidv7(), ${ws.id}::uuid, ${`cw-${Math.random().toString(36).slice(2, 8)}`}, 'CW Test Org',
            'legal_entity', 'for_profit')
    RETURNING id
  `
  if (!org) throw new Error("org insert failed")
  await sql`UPDATE organization SET organization_id = id WHERE id = ${org.id}::uuid`

  return { userId: owner.id, workspaceId: ws.id, organizationId: org.id }
}

/** Seed a tool_call_log row with a chosen `auto_applied` flag. */
async function seedToolCallLog(
  organizationId: string,
  userId: string,
  autoApplied: boolean,
): Promise<string> {
  const [row] = await sql<Array<{ id: string }>>`
    INSERT INTO tool_call_log (
      organization_id, tool_name, idempotency_key, actor_kind, user_id,
      conversation_id, input_json, output_json, auto_applied, approved_by_user_id
    )
    VALUES (
      ${organizationId}::uuid,
      'captureAccountingDocument',
      ${"key-" + Math.random().toString(36).slice(2)},
      'ai_on_behalf',
      ${userId}::uuid,
      ${crypto.randomUUID()},
      '{"periodId": "x"}'::jsonb,
      ${sql.json({ status: autoApplied ? "applied" : "held" })},
      ${autoApplied},
      null
    )
    RETURNING id
  `
  if (!row) throw new Error("tool_call_log insert failed")
  return row.id
}

/** Read the raw counter row via the superuser client (bypasses RLS). */
async function readRow(workspaceId: string): Promise<{
  confident_wrong_count: number
  cleared_by_user_id: string | null
  cleared_at: string | null
  last_incident_tool_call_log_id: string | null
} | null> {
  const [row] = await sql<
    Array<{
      confident_wrong_count: number
      cleared_by_user_id: string | null
      cleared_at: string | null
      last_incident_tool_call_log_id: string | null
    }>
  >`
    SELECT confident_wrong_count,
           cleared_by_user_id::text AS cleared_by_user_id,
           cleared_at::text AS cleared_at,
           last_incident_tool_call_log_id::text AS last_incident_tool_call_log_id
    FROM brain_confident_wrong
    WHERE workspace_id = ${workspaceId}::uuid
  `
  return row ?? null
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("readConfidentWrongCount", () => {
  it("returns 0 when the workspace has no counter row (cold-start norm)", async () => {
    const org = await seedOrg()
    const count = await withOrganization(org.organizationId, org.userId, (db) =>
      readConfidentWrongCount(db),
    )
    expect(count).toBe(0)
  })
})

describe("recordConfidentWrong — the increment guard", () => {
  it("REFUSES a held (not auto-applied) write — it can never be confident-wrong", async () => {
    const org = await seedOrg()
    const heldId = await seedToolCallLog(org.organizationId, org.userId, false)

    await expect(
      withOrganization(org.organizationId, org.userId, (db) =>
        recordConfidentWrong(db, {
          toolCallLogId: heldId,
          actorUserId: org.userId,
        }),
      ),
    ).rejects.toThrow(/only an AUTO-APPLIED write/i)

    // No counter row was created — the breaker stays closed.
    expect(await readRow(org.workspaceId)).toBeNull()
  })

  it("increments for an AUTO-APPLIED write and trips the breaker (dormant path)", async () => {
    const org = await seedOrg()
    const appliedId = await seedToolCallLog(
      org.organizationId,
      org.userId,
      true,
    )

    await withOrganization(org.organizationId, org.userId, (db) =>
      recordConfidentWrong(db, {
        toolCallLogId: appliedId,
        actorUserId: org.userId,
        note: "wrong account",
      }),
    )

    const row = await readRow(org.workspaceId)
    expect(row?.confident_wrong_count).toBe(1)
    expect(row?.last_incident_tool_call_log_id).toBe(appliedId)

    // The gate read now sees the breaker OPEN.
    const seen = await withOrganization(org.organizationId, org.userId, (db) =>
      readConfidentWrongCount(db),
    )
    expect(seen).toBe(1)
  })

  it("is a monotone upsert — a second confident-wrong bumps the count to 2", async () => {
    const org = await seedOrg()
    const a = await seedToolCallLog(org.organizationId, org.userId, true)
    const b = await seedToolCallLog(org.organizationId, org.userId, true)

    for (const id of [a, b]) {
      await withOrganization(org.organizationId, org.userId, (db) =>
        recordConfidentWrong(db, {
          toolCallLogId: id,
          actorUserId: org.userId,
        }),
      )
    }

    const row = await readRow(org.workspaceId)
    expect(row?.confident_wrong_count).toBe(2)
    expect(row?.last_incident_tool_call_log_id).toBe(b)
  })

  it("refuses a missing tool_call_log row", async () => {
    const org = await seedOrg()
    await expect(
      withOrganization(org.organizationId, org.userId, (db) =>
        recordConfidentWrong(db, {
          toolCallLogId: crypto.randomUUID(),
          actorUserId: org.userId,
        }),
      ),
    ).rejects.toThrow(/not found/i)
  })

  it("is workspace-isolated — one workspace's incident is invisible to another", async () => {
    const a = await seedOrg()
    const b = await seedOrg()
    const appliedId = await seedToolCallLog(a.organizationId, a.userId, true)

    await withOrganization(a.organizationId, a.userId, (db) =>
      recordConfidentWrong(db, {
        toolCallLogId: appliedId,
        actorUserId: a.userId,
      }),
    )

    const aCount = await withOrganization(a.organizationId, a.userId, (db) =>
      readConfidentWrongCount(db),
    )
    const bCount = await withOrganization(b.organizationId, b.userId, (db) =>
      readConfidentWrongCount(db),
    )
    expect(aCount).toBe(1)
    expect(bCount).toBe(0)
  })
})

describe("resetConfidentWrongCount — human-only breaker clear", () => {
  it("zeroes the counter and stamps who cleared it", async () => {
    const org = await seedOrg()
    const appliedId = await seedToolCallLog(
      org.organizationId,
      org.userId,
      true,
    )
    await withOrganization(org.organizationId, org.userId, (db) =>
      recordConfidentWrong(db, {
        toolCallLogId: appliedId,
        actorUserId: org.userId,
      }),
    )
    expect((await readRow(org.workspaceId))?.confident_wrong_count).toBe(1)

    await withOrganization(org.organizationId, org.userId, (db) =>
      resetConfidentWrongCount(db, {
        actorUserId: org.userId,
        note: "investigated, added eval case",
      }),
    )

    const row = await readRow(org.workspaceId)
    expect(row?.confident_wrong_count).toBe(0)
    expect(row?.cleared_by_user_id).toBe(org.userId)
    expect(row?.cleared_at).not.toBeNull()

    // The gate read now sees the breaker CLOSED again.
    const seen = await withOrganization(org.organizationId, org.userId, (db) =>
      readConfidentWrongCount(db),
    )
    expect(seen).toBe(0)
  })
})
