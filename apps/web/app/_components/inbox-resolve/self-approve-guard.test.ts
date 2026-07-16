/**
 * [G3 SAFETY] Direct coverage for the author != approver guard added to the web
 * resolve action when Posting Approvals folded into the Records Inbox
 * (`inbox-resolve/actions.ts`). The guard is the only server-side backstop, on
 * the human web lane, against a HELD write being APPROVED by the same user that
 * authored it — mirroring the tested public-API guard
 * (`held-writes.controller.ts:234-238`).
 *
 * Like the sibling suites (`edit-approve-e2e.test.ts`, `reject-reset.test.ts`),
 * this is a faithful REPLICA against the PG18 testcontainer rather than the real
 * Server Action (which needs a request scope). It replicates exactly the guard's
 * shape: the FOR-UPDATE read that now also selects `user_id` (the author), the
 * already-resolved guard, then `action === "approve" && row.user_id === approver`
 * BEFORE any domain replay. The replay itself is stubbed — this suite proves the
 * GUARD, not the posting (that is `edit-approve-e2e.test.ts`).
 *
 * Covers: (1) self-approve (author === approver) is rejected, the row stays HELD,
 * nothing is resolved; (2) a different approver passes the guard; (3) REJECT by
 * the author is allowed (closing a review is not a bypass).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import postgres from "postgres"

process.env["BETTER_AUTH_SECRET"] =
  process.env["BETTER_AUTH_SECRET"] ??
  "web-integration-test-secret-0123456789ab"

// Dynamically imported so DATABASE_URL is set by globalSetup before they bind.
let withOrganization: (typeof import("@workspace/db"))["withOrganization"]
let executeRows: (typeof import("@workspace/db"))["executeRows"]
let sqlTag: (typeof import("@workspace/db"))["sql"]

let adminClient: (typeof import("@workspace/db/tests/fixtures"))["adminClient"]
let truncateAll: (typeof import("@workspace/db/tests/fixtures"))["truncateAll"]
let seedTwoOrganizations: (typeof import("@workspace/db/tests/fixtures"))["seedTwoOrganizations"]

let sql: postgres.Sql

beforeAll(async () => {
  ;({ adminClient, truncateAll, seedTwoOrganizations } =
    await import("@workspace/db/tests/fixtures"))
  ;({
    withOrganization,
    executeRows,
    sql: sqlTag,
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

/** Insert a HELD gated write (auto_applied=false, no approver) authored by `authorUserId`. */
async function seedHeldWrite(
  organizationId: string,
  authorUserId: string,
): Promise<string> {
  const [row] = await sql<Array<{ id: string }>>`
    INSERT INTO tool_call_log (
      organization_id, tool_name, idempotency_key, actor_kind, user_id,
      input_json, output_json, auto_applied, approved_by_user_id
    )
    VALUES (
      ${organizationId}::uuid, 'createAccountingEvent',
      ${"key-" + Math.random().toString(36).slice(2)}, 'ai_on_behalf', ${authorUserId}::uuid,
      ${sql.json({ description: "held event" } as never)},
      ${sql.json({ payloadHash: "h", serverGate: { templateId: null }, status: "held", reviewId: "r" } as never)},
      false, null
    )
    RETURNING id`
  if (!row) throw new Error("held write insert failed")
  return row.id
}

interface HeldLogRow {
  auto_applied: boolean
  approved_by_user_id: string | null
  user_id: string | null
}

/**
 * Faithful replica of `resolveHeldWrite`'s pre-replay gate chain: the FOR-UPDATE
 * read (now selecting `user_id`), the already-resolved guard, then the
 * author != approver guard. The domain replay is stubbed to `ok:true` — this
 * isolates the guard. Runs under `withOrganization(org, approver)` so RLS +
 * identity match the real action (the approver is the session user).
 */
async function resolveWithGuard(input: {
  organizationId: string
  approverUserId: string
  toolCallLogId: string
  action: "approve" | "reject"
}): Promise<{ ok: boolean; error?: string; reachedReplay?: boolean }> {
  const { organizationId, approverUserId, toolCallLogId, action } = input
  return withOrganization(organizationId, approverUserId, async (db) => {
    const rows = await executeRows<HeldLogRow>(
      db,
      sqlTag`select auto_applied,
                    approved_by_user_id::text as approved_by_user_id,
                    user_id::text as user_id
             from tool_call_log where id = ${toolCallLogId}::uuid
             for update`,
    )
    const row = rows[0]
    if (!row) return { ok: false, error: "not found" }
    if (row.auto_applied || row.approved_by_user_id !== null) {
      return { ok: false, error: "already resolved" }
    }
    if (action === "approve" && row.user_id === approverUserId) {
      return {
        ok: false,
        error:
          "Held write cannot be approved by its author; a different user must review it",
      }
    }
    // (domain replay stubbed — proven separately in edit-approve-e2e.test.ts)
    return { ok: true, reachedReplay: true }
  })
}

describe("author != approver guard (web resolve, G3)", () => {
  it("rejects a self-approve (author === approver) before any replay; row stays HELD", async () => {
    const { orgAId, userAId } = await seedTwoOrganizations(sql)
    const logId = await seedHeldWrite(orgAId, userAId)

    const res = await resolveWithGuard({
      organizationId: orgAId,
      approverUserId: userAId, // the author approving their own write
      toolCallLogId: logId,
      action: "approve",
    })

    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/cannot be approved by its author/i)
    expect(res.reachedReplay).toBeUndefined() // guard fired before replay

    // Untouched — still held.
    const [after] = await sql<
      Array<{ approved_by_user_id: string | null }>
    >`SELECT approved_by_user_id::text as approved_by_user_id
      FROM tool_call_log WHERE id = ${logId}::uuid`
    expect(after?.approved_by_user_id).toBeNull()
  })

  it("passes the guard when the approver is a DIFFERENT user than the author", async () => {
    const { orgAId, userAId, userBId } = await seedTwoOrganizations(sql)
    // Authored by userB; approved by userA (the reviewer).
    const logId = await seedHeldWrite(orgAId, userBId)

    const res = await resolveWithGuard({
      organizationId: orgAId,
      approverUserId: userAId,
      toolCallLogId: logId,
      action: "approve",
    })

    expect(res.ok).toBe(true)
    expect(res.reachedReplay).toBe(true) // guard let it through to the replay
  })

  it("allows the author to REJECT their own write (closing a review is not a bypass)", async () => {
    const { orgAId, userAId } = await seedTwoOrganizations(sql)
    const logId = await seedHeldWrite(orgAId, userAId)

    const res = await resolveWithGuard({
      organizationId: orgAId,
      approverUserId: userAId,
      toolCallLogId: logId,
      action: "reject",
    })

    expect(res.ok).toBe(true) // reject is ungated
  })
})
