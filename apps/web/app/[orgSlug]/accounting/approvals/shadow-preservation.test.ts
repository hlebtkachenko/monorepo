/**
 * [F1 / M3.2] Integration test for the calibration data prerequisite.
 *
 * `updateToolCallLogOutput` fully REPLACES `output_json` (packages/db's
 * write-log.ts is a single `.set({ output_json: ... })`, no merge). Before this
 * fix, `resolveHeldWrite`'s reject/approve branches persisted only
 * `{resolution, ...}`, silently wiping the `serverGate` (incl. `.shadow` — the
 * M3 calibration x-axis, shadow-score.ts) the gate had persisted at HOLD time.
 * `resolution` and `serverGate.shadow` would then never coexist on one row, so
 * the M3.3 run-log ingestion pipeline (`ingestReviewedRunLog`, #646, unmerged —
 * this test mirrors its read shape rather than importing the unmerged branch)
 * would find zero real samples to feed the M3.2 refit.
 *
 * Following the repo convention (see the sibling `reject-reset.test.ts`), this
 * test exercises the exact primitives `resolveHeldWrite`
 * (apps/web/app/_components/held-writes/actions.ts) runs — the SELECT that now
 * also reads `output_json->'serverGate'` and the `updateToolCallLogOutput` call
 * that now forwards it — inside a real `withOrganization` tx against the PG18
 * testcontainer, rather than driving the full Server Action (which would need a
 * Next request scope / Better Auth session, covered elsewhere).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import postgres from "postgres"

process.env["BETTER_AUTH_SECRET"] =
  process.env["BETTER_AUTH_SECRET"] ??
  "web-integration-test-secret-0123456789ab"

let withOrganization: (typeof import("@workspace/db"))["withOrganization"]
let executeRows: (typeof import("@workspace/db"))["executeRows"]
let sqlTag: (typeof import("@workspace/db"))["sql"]
let updateToolCallLogOutput: (typeof import("@workspace/db"))["updateToolCallLogOutput"]

let adminClient: (typeof import("@workspace/db/tests/fixtures"))["adminClient"]
let truncateAll: (typeof import("@workspace/db/tests/fixtures"))["truncateAll"]

let sql: postgres.Sql

interface HeldRow {
  auto_applied: boolean
  approved_by_user_id: string | null
  server_gate: unknown
}

/**
 * The FIXED reject leg of `resolveHeldWrite`: reads `output_json->'serverGate'`
 * and forwards it into the resolved `output_json` (mirrors the real code in
 * `actions.ts` after the F1 fix).
 */
async function rejectHeldWrite(input: {
  organizationId: string
  userId: string
  toolCallLogId: string
}): Promise<{ ok: boolean; error?: string }> {
  return withOrganization(input.organizationId, input.userId, async (db) => {
    const rows = await executeRows<HeldRow>(
      db,
      sqlTag`select auto_applied,
                    approved_by_user_id::text as approved_by_user_id,
                    (output_json->'serverGate') as server_gate
             from tool_call_log
             where id = ${input.toolCallLogId}::uuid`,
    )
    const row = rows[0]
    if (!row) return { ok: false, error: "not found" }
    if (row.auto_applied || row.approved_by_user_id !== null) {
      return { ok: false, error: "already resolved" }
    }

    await updateToolCallLogOutput(db, {
      toolCallLogId: input.toolCallLogId,
      output: {
        resolution: "rejected",
        note: null,
        ...(row.server_gate !== null ? { serverGate: row.server_gate } : {}),
      },
      approvedByUserId: input.userId,
    })
    return { ok: true }
  })
}

/** The FIXED approve leg (domain replay omitted — this test only pins the audit-forward contract). */
async function approveHeldWrite(input: {
  organizationId: string
  userId: string
  toolCallLogId: string
}): Promise<{ ok: boolean; error?: string }> {
  return withOrganization(input.organizationId, input.userId, async (db) => {
    const rows = await executeRows<HeldRow>(
      db,
      sqlTag`select auto_applied,
                    approved_by_user_id::text as approved_by_user_id,
                    (output_json->'serverGate') as server_gate
             from tool_call_log
             where id = ${input.toolCallLogId}::uuid`,
    )
    const row = rows[0]
    if (!row) return { ok: false, error: "not found" }
    if (row.auto_applied || row.approved_by_user_id !== null) {
      return { ok: false, error: "already resolved" }
    }

    await updateToolCallLogOutput(db, {
      toolCallLogId: input.toolCallLogId,
      output: {
        resolution: "approved",
        eventId: "stub-event-id",
        ...(row.server_gate !== null ? { serverGate: row.server_gate } : {}),
      },
      approvedByUserId: input.userId,
    })
    return { ok: true }
  })
}

beforeAll(async () => {
  ;({ adminClient, truncateAll } = await import("@workspace/db/tests/fixtures"))
  ;({
    withOrganization,
    executeRows,
    sql: sqlTag,
    updateToolCallLogOutput,
  } = await import("@workspace/db"))
  sql = adminClient()
  await truncateAll(sql)
}, 60_000)

afterAll(async () => {
  await truncateAll(sql)
  await sql.end({ timeout: 5 })
})

beforeEach(async () => {
  await truncateAll(sql)
})

async function seedOrg(): Promise<{
  userId: string
  workspaceId: string
  organizationId: string
}> {
  const [owner] = await sql<Array<{ id: string }>>`
    INSERT INTO app_user (email, name, role)
    VALUES (${`owner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@shadow-test.invalid`}, 'Owner', 'user')
    RETURNING id
  `
  if (!owner) throw new Error("owner insert failed")

  const [ws] = await sql<Array<{ id: string }>>`
    INSERT INTO workspace (display_name, created_by_user_id)
    VALUES ('Shadow Test Workspace', ${owner.id}::uuid)
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
    VALUES (uuidv7(), ${ws.id}::uuid, ${`shadow-${Math.random().toString(36).slice(2, 8)}`}, 'Shadow Test Org',
            'legal_entity', 'for_profit')
    RETURNING id
  `
  if (!org) throw new Error("org insert failed")
  await sql`UPDATE organization SET organization_id = id WHERE id = ${org.id}::uuid`

  return { userId: owner.id, workspaceId: ws.id, organizationId: org.id }
}

/** Seed a HELD tool_call_log row whose output_json carries a full serverGate + shadow, as runGatedWrite persists it. */
async function seedHeldWriteWithShadow(
  organizationId: string,
  userId: string,
): Promise<string> {
  const serverGate = {
    veto: { held: false, signals: [] },
    score: { cRaw: 0, cFinal: 0, isGreen: false, blocked: true },
    shadow: {
      v: 1,
      serverLane: { cRaw: 0.37 },
      claimLane: { cRaw: 0.88 },
    },
    templateId: null,
  }
  const [row] = await sql<Array<{ id: string }>>`
    INSERT INTO tool_call_log (
      organization_id, tool_name, idempotency_key, actor_kind, user_id,
      input_json, output_json, auto_applied, approved_by_user_id
    )
    VALUES (
      ${organizationId}::uuid,
      'createAccountingEvent',
      ${"key-" + Math.random().toString(36).slice(2)},
      'ai_on_behalf',
      ${userId}::uuid,
      '{"periodId": "x"}'::jsonb,
      ${sql.json({ payloadHash: "h", serverGate, status: "held", reviewId: "r" })},
      false,
      null
    )
    RETURNING id
  `
  if (!row) throw new Error("held write insert failed")
  return row.id
}

async function readOutputJson(id: string): Promise<Record<string, unknown>> {
  const [row] = await sql<Array<{ output_json: Record<string, unknown> }>>`
    SELECT output_json FROM tool_call_log WHERE id = ${id}::uuid
  `
  if (!row) throw new Error("row read failed")
  return row.output_json
}

describe("resolveHeldWrite — [F1 / M3.2] serverGate.shadow survives resolve", () => {
  it("REJECT: the resolved row carries BOTH resolution and serverGate.shadow.serverLane.cRaw", async () => {
    const org = await seedOrg()
    const logId = await seedHeldWriteWithShadow(org.organizationId, org.userId)

    const result = await rejectHeldWrite({
      organizationId: org.organizationId,
      userId: org.userId,
      toolCallLogId: logId,
    })
    expect(result.ok).toBe(true)

    const output = await readOutputJson(logId)
    expect(output["resolution"]).toBe("rejected")
    const serverGate = output["serverGate"] as {
      shadow?: { serverLane?: { cRaw?: number } }
    }
    expect(serverGate?.shadow?.serverLane?.cRaw).toBe(0.37)
  }, 60_000)

  it("APPROVE: the resolved row carries BOTH resolution and serverGate.shadow.serverLane.cRaw", async () => {
    const org = await seedOrg()
    const logId = await seedHeldWriteWithShadow(org.organizationId, org.userId)

    const result = await approveHeldWrite({
      organizationId: org.organizationId,
      userId: org.userId,
      toolCallLogId: logId,
    })
    expect(result.ok).toBe(true)

    const output = await readOutputJson(logId)
    expect(output["resolution"]).toBe("approved")
    const serverGate = output["serverGate"] as {
      shadow?: { serverLane?: { cRaw?: number } }
    }
    expect(serverGate?.shadow?.serverLane?.cRaw).toBe(0.37)
  }, 60_000)

  it("a row with NO prior serverGate (pre-W1.5) resolves without fabricating one", async () => {
    const org = await seedOrg()
    const [row] = await sql<Array<{ id: string }>>`
      INSERT INTO tool_call_log (
        organization_id, tool_name, idempotency_key, actor_kind, user_id,
        input_json, output_json, auto_applied, approved_by_user_id
      )
      VALUES (
        ${org.organizationId}::uuid,
        'createAccountingEvent',
        ${"key-" + Math.random().toString(36).slice(2)},
        'ai_on_behalf',
        ${org.userId}::uuid,
        '{"periodId": "x"}'::jsonb,
        ${sql.json({ payloadHash: "h", status: "held", reviewId: "r" })},
        false,
        null
      )
      RETURNING id
    `
    if (!row) throw new Error("held write insert failed")

    const result = await rejectHeldWrite({
      organizationId: org.organizationId,
      userId: org.userId,
      toolCallLogId: row.id,
    })
    expect(result.ok).toBe(true)

    const output = await readOutputJson(row.id)
    expect(output["resolution"]).toBe("rejected")
    expect(output).not.toHaveProperty("serverGate")
  }, 60_000)
})
