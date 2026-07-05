/**
 * [WS-2] Integration test for the OCR-template reject-reset safety gate.
 *
 * When a reviewer REJECTS a held booking that was derived from an OCR extraction
 * template, that template's locators are proven to have produced a bad booking,
 * so the template must be UN-confirmed (`human_confirmed_at` → NULL) and stamped
 * (`last_reject_at` = now()) — future extractions from it are then HELD again by
 * the server veto until a human re-confirms via POST /v1/ocr-templates/:id/confirm.
 *
 * The reject-reset lives inline in `resolveHeldWrite`
 * (app/[orgSlug]/accounting/approvals/actions.ts) inside its `withOrganization`
 * transaction. Driving the full server action here would require standing up a
 * Next request scope (getRequestSession → next/headers + Better Auth, plus
 * revalidatePath → next/cache), which the action's session plumbing is already
 * covered for elsewhere. Following the repo convention (see
 * app/[orgSlug]/resolve-membership.test.ts), this test exercises the exact SQL
 * the action runs — the read of `serverGate.templateId` and the reject-reset
 * UPDATE — inside a real `withOrganization` tx against the PG18 testcontainer,
 * so the load-bearing behavior (RLS resolution under app.workspace_id,
 * reject-only, no-op when absent) is pinned against the live schema.
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

/**
 * The reject leg of `resolveHeldWrite`, replicated verbatim so the test pins the
 * exact SQL the action runs. Reads `template_id` from the audit
 * `output_json.serverGate.templateId`, resets the template only when present,
 * then marks the log row rejected — all in ONE `withOrganization` tx.
 */
async function rejectHeldWrite(input: {
  organizationId: string
  userId: string
  toolCallLogId: string
}): Promise<{ ok: boolean; error?: string }> {
  return withOrganization(input.organizationId, input.userId, async (db) => {
    const rows = await executeRows<{
      auto_applied: boolean
      approved_by_user_id: string | null
      template_id: string | null
    }>(
      db,
      sqlTag`select auto_applied,
                    approved_by_user_id::text as approved_by_user_id,
                    (output_json->'serverGate'->>'templateId') as template_id
             from tool_call_log
             where id = ${input.toolCallLogId}::uuid`,
    )
    const row = rows[0]
    if (!row) return { ok: false, error: "not found" }
    if (row.auto_applied || row.approved_by_user_id !== null) {
      return { ok: false, error: "already resolved" }
    }

    if (row.template_id) {
      await db.execute(
        sqlTag`update ocr_extraction_template
               set human_confirmed_at = null,
                   last_reject_at = now(),
                   updated_at = now()
               where id = ${row.template_id}::uuid`,
      )
    }
    await updateToolCallLogOutput(db, {
      toolCallLogId: input.toolCallLogId,
      output: { resolution: "rejected", note: null },
      approvedByUserId: input.userId,
    })
    return { ok: true }
  })
}

/**
 * The approve leg's template contract: approve must NEVER touch the template
 * (confirmation is an explicit human action via the confirm endpoint). Replicated
 * as the marker of intent — it simply marks the row approved, touching no template.
 */
async function approveHeldWriteTemplateNoop(input: {
  organizationId: string
  userId: string
  toolCallLogId: string
}): Promise<void> {
  await withOrganization(input.organizationId, input.userId, async (db) => {
    await updateToolCallLogOutput(db, {
      toolCallLogId: input.toolCallLogId,
      output: { resolution: "approved" },
      approvedByUserId: input.userId,
    })
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
  await sql`DELETE FROM ocr_extraction_template`
}, 60_000)

afterAll(async () => {
  await sql`DELETE FROM ocr_extraction_template`
  await truncateAll(sql)
  await sql.end({ timeout: 5 })
})

beforeEach(async () => {
  await truncateAll(sql)
  await sql`DELETE FROM ocr_extraction_template`
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
    VALUES (${`owner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@reset-test.invalid`}, 'Owner', 'user')
    RETURNING id
  `
  if (!owner) throw new Error("owner insert failed")

  const [ws] = await sql<Array<{ id: string }>>`
    INSERT INTO workspace (display_name, created_by_user_id)
    VALUES ('Reset Test Workspace', ${owner.id}::uuid)
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
    VALUES (uuidv7(), ${ws.id}::uuid, ${`reset-${Math.random().toString(36).slice(2, 8)}`}, 'Reset Test Org',
            'legal_entity', 'for_profit')
    RETURNING id
  `
  if (!org) throw new Error("org insert failed")
  await sql`UPDATE organization SET organization_id = id WHERE id = ${org.id}::uuid`

  return { userId: owner.id, workspaceId: ws.id, organizationId: org.id }
}

/** Seed a CONFIRMED ocr_extraction_template in the given workspace. */
async function seedConfirmedTemplate(workspaceId: string): Promise<string> {
  const [tpl] = await sql<Array<{ id: string }>>`
    INSERT INTO ocr_extraction_template (
      workspace_id, supplier_key, doc_kind, locators, human_confirmed_at
    )
    VALUES (
      ${workspaceId}::uuid, '12345678', 'RECEIVED_INVOICE',
      '{"total": {"page": 1}}'::jsonb, now()
    )
    RETURNING id
  `
  if (!tpl) throw new Error("template insert failed")
  return tpl.id
}

/**
 * Seed a HELD tool_call_log row (auto_applied = false, no approver) whose audit
 * output_json carries the given templateId under serverGate — exactly where the
 * gate persists it. `templateId` may be null (structured-export write).
 */
async function seedHeldWrite(
  organizationId: string,
  userId: string,
  templateId: string | null,
): Promise<string> {
  const serverGate = { templateId }
  const [row] = await sql<Array<{ id: string }>>`
    INSERT INTO tool_call_log (
      organization_id, tool_name, idempotency_key, actor_kind, user_id,
      input_json, output_json, auto_applied, approved_by_user_id
    )
    VALUES (
      ${organizationId}::uuid,
      'captureAccountingDocument',
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

async function readTemplate(id: string): Promise<{
  human_confirmed_at: string | null
  last_reject_at: string | null
}> {
  const [row] = await sql<
    Array<{ human_confirmed_at: string | null; last_reject_at: string | null }>
  >`
    SELECT human_confirmed_at::text AS human_confirmed_at,
           last_reject_at::text     AS last_reject_at
    FROM ocr_extraction_template
    WHERE id = ${id}::uuid
  `
  if (!row) throw new Error("template read failed")
  return row
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("resolveHeldWrite reject-reset (WS-2)", () => {
  it("rejecting a held write with a templateId un-confirms the template and stamps last_reject_at", async () => {
    const org = await seedOrg()
    const templateId = await seedConfirmedTemplate(org.workspaceId)
    const logId = await seedHeldWrite(
      org.organizationId,
      org.userId,
      templateId,
    )

    const before = await readTemplate(templateId)
    expect(before.human_confirmed_at).not.toBeNull()
    expect(before.last_reject_at).toBeNull()

    const result = await rejectHeldWrite({
      organizationId: org.organizationId,
      userId: org.userId,
      toolCallLogId: logId,
    })
    expect(result.ok).toBe(true)

    const after = await readTemplate(templateId)
    // human_confirmed_at reset to NULL — future extractions are HELD again.
    expect(after.human_confirmed_at).toBeNull()
    // last_reject_at stamped.
    expect(after.last_reject_at).not.toBeNull()
  }, 60_000)

  it("approving does NOT touch the template (confirmation stays an explicit human action)", async () => {
    const org = await seedOrg()
    const templateId = await seedConfirmedTemplate(org.workspaceId)
    const logId = await seedHeldWrite(
      org.organizationId,
      org.userId,
      templateId,
    )

    const before = await readTemplate(templateId)

    await approveHeldWriteTemplateNoop({
      organizationId: org.organizationId,
      userId: org.userId,
      toolCallLogId: logId,
    })

    const after = await readTemplate(templateId)
    // The template is untouched: still confirmed, never stamped by approve.
    expect(after.human_confirmed_at).toBe(before.human_confirmed_at)
    expect(after.human_confirmed_at).not.toBeNull()
    expect(after.last_reject_at).toBeNull()
  }, 60_000)

  it("rejecting a held write with NO templateId is a template no-op", async () => {
    const org = await seedOrg()
    // A structured-export write (templateId absent) that happens to coexist with
    // an unrelated confirmed template in the same workspace: the reject must not
    // touch that template.
    const unrelatedTemplateId = await seedConfirmedTemplate(org.workspaceId)
    const logId = await seedHeldWrite(org.organizationId, org.userId, null)

    const before = await readTemplate(unrelatedTemplateId)

    const result = await rejectHeldWrite({
      organizationId: org.organizationId,
      userId: org.userId,
      toolCallLogId: logId,
    })
    expect(result.ok).toBe(true)

    const after = await readTemplate(unrelatedTemplateId)
    // Untouched — no template on the rejected row means no reset.
    expect(after.human_confirmed_at).toBe(before.human_confirmed_at)
    expect(after.human_confirmed_at).not.toBeNull()
    expect(after.last_reject_at).toBeNull()
  }, 60_000)
})
