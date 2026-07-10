/**
 * [M1.7] Integration test for the edit-before-approve flow (A-Z 2.6) inside
 * `resolveHeldWrite`'s approve branch (app/[orgSlug]/accounting/approvals/
 * actions.ts): a reviewer-supplied `edit` is merged onto the ORIGINAL
 * `input_json` via `applyHeldWriteEdit` BEFORE `stripGateEnvelope` runs, so
 * the domain call below receives the CORRECTED fields — while `input_json`
 * itself stays untouched (the audit record of what the agent proposed) and
 * the edit is instead recorded on `output_json` alongside the applied result.
 *
 * Following the repo convention (see `reject-reset.test.ts` and
 * `app/[orgSlug]/resolve-membership.test.ts`), this test exercises the exact
 * primitives the action runs — the read + already-resolved guard, the REAL
 * `applyHeldWriteEdit` + `stripGateEnvelope`, and the REAL
 * `updateToolCallLogOutput` write — against the PG18 testcontainer, rather
 * than driving the full Next Server Action (which needs a request scope) or
 * the full domain posting call (which needs period/series/account fixtures
 * out of scope for this flow's own contract).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import postgres from "postgres"

import {
  applyHeldWriteEdit,
  type HeldWriteEdit,
} from "../../../_components/held-writes/edit-model"
import { stripGateEnvelope } from "@workspace/shared/api"

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

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

async function seedOrg(): Promise<{
  userId: string
  organizationId: string
}> {
  const [owner] = await sql<Array<{ id: string }>>`
    INSERT INTO app_user (email, name, role)
    VALUES (${`owner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@edit-approve-test.invalid`}, 'Owner', 'user')
    RETURNING id
  `
  if (!owner) throw new Error("owner insert failed")

  const [ws] = await sql<Array<{ id: string }>>`
    INSERT INTO workspace (display_name, created_by_user_id)
    VALUES ('Edit Approve Test Workspace', ${owner.id}::uuid)
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
    VALUES (uuidv7(), ${ws.id}::uuid, ${`edit-${Math.random().toString(36).slice(2, 8)}`}, 'Edit Approve Test Org',
            'legal_entity', 'for_profit')
    RETURNING id
  `
  if (!org) throw new Error("org insert failed")
  await sql`UPDATE organization SET organization_id = id WHERE id = ${org.id}::uuid`

  return { userId: owner.id, organizationId: org.id }
}

/** A held `captureAccountingDocument` write with a single-partial 21 % line. */
function documentInput() {
  return {
    periodId: "00000000-0000-7000-8000-000000000001",
    seriesId: "00000000-0000-7000-8000-000000000002",
    type: "RECEIVED_INVOICE",
    issuedAt: "2026-06-01",
    lines: [
      {
        eventId: "00000000-0000-7000-8000-000000000003",
        partials: [
          {
            baseAmount: "10000.00",
            vatMode: "STANDARD",
            vatRate: "21",
            vatAmount: "2100.00",
            currencyCode: "CZK",
          },
        ],
      },
    ],
    // Gate-only fields — must survive the edit merge untouched, then be
    // stripped by stripGateEnvelope (never reach the domain call).
    confidence: 0.55,
    rationale: "OCR read the base amount as 10000, reviewer corrected it.",
    conversationId: "00000000-0000-7000-8000-000000000099",
  }
}

async function seedHeldDocumentWrite(
  organizationId: string,
  userId: string,
  input: Record<string, unknown>,
): Promise<string> {
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
      ${sql.json(input as never)},
      ${sql.json({ payloadHash: "h", serverGate: { templateId: null }, status: "held", reviewId: "r" })},
      false,
      null
    )
    RETURNING id
  `
  if (!row) throw new Error("held write insert failed")
  return row.id
}

interface HeldLogRow {
  tool_name: string
  input_json: unknown
  auto_applied: boolean
  approved_by_user_id: string | null
}

/**
 * The read + already-resolved guard + edit-merge + gate-strip sequence
 * `resolveHeldWrite`'s approve branch runs, replicated here so the test pins
 * the EXACT primitives (real `applyHeldWriteEdit` + real
 * `stripGateEnvelope`), stopping short of the full domain posting call (out
 * of scope for the edit-merge contract itself — see file doc comment).
 */
async function readAndMergeForApprove(input: {
  organizationId: string
  userId: string
  toolCallLogId: string
  edit?: HeldWriteEdit
}): Promise<{
  fields: Record<string, unknown>
  mergedInput: Record<string, unknown>
}> {
  return withOrganization(input.organizationId, input.userId, async (db) => {
    const rows = await executeRows<HeldLogRow>(
      db,
      sqlTag`select tool_name, input_json, auto_applied,
                    approved_by_user_id::text as approved_by_user_id
             from tool_call_log
             where id = ${input.toolCallLogId}::uuid`,
    )
    const row = rows[0]
    if (!row) throw new Error("not found")
    if (row.auto_applied || row.approved_by_user_id !== null) {
      throw new Error("already resolved")
    }
    const rawInput = (row.input_json ?? {}) as Record<string, unknown>
    const mergedInput = input.edit
      ? applyHeldWriteEdit(row.tool_name, rawInput, input.edit)
      : rawInput
    const fields = stripGateEnvelope(mergedInput)
    return { fields, mergedInput }
  })
}

async function markApproved(input: {
  organizationId: string
  userId: string
  toolCallLogId: string
  applied: Record<string, unknown>
  edit?: HeldWriteEdit
}): Promise<void> {
  await withOrganization(input.organizationId, input.userId, (db) =>
    updateToolCallLogOutput(db, {
      toolCallLogId: input.toolCallLogId,
      output: {
        resolution: "approved",
        ...input.applied,
        ...(input.edit ? { edit: input.edit } : {}),
      },
      approvedByUserId: input.userId,
    }),
  )
}

async function readRow(id: string): Promise<{
  input_json: Record<string, unknown>
  output_json: Record<string, unknown>
}> {
  const [row] = await sql<
    Array<{
      input_json: Record<string, unknown>
      output_json: Record<string, unknown>
    }>
  >`SELECT input_json, output_json FROM tool_call_log WHERE id = ${id}::uuid`
  if (!row) throw new Error("row not found")
  return row
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("resolveHeldWrite approve-with-edit (M1.7)", () => {
  it("merges the edited VAT amounts + date into the fields handed to the domain call", async () => {
    const org = await seedOrg()
    const logId = await seedHeldDocumentWrite(
      org.organizationId,
      org.userId,
      documentInput(),
    )

    const edit: HeldWriteEdit = {
      header: { date: "2026-07-15" },
      vatAmounts: [{ rateLabel: "21 %", base: "9500.00", vat: "1995.00" }],
    }
    const { fields } = await readAndMergeForApprove({
      organizationId: org.organizationId,
      userId: org.userId,
      toolCallLogId: logId,
      edit,
    })

    expect(fields["issuedAt"]).toBe("2026-07-15")
    const lines = fields["lines"] as Array<{
      partials: Array<Record<string, unknown>>
    }>
    expect(lines[0]?.partials[0]).toMatchObject({
      baseAmount: "9500.00",
      vatAmount: "1995.00",
      vatRate: "21", // unedited fields on the partial are preserved
      currencyCode: "CZK",
    })

    // The gate envelope is stripped regardless of the edit — never reaches
    // the domain call.
    expect(fields["confidence"]).toBeUndefined()
    expect(fields["rationale"]).toBeUndefined()
    expect(fields["conversationId"]).toBeUndefined()
  })

  it("leaves input_json UNTOUCHED (audit trail of the original proposal) and records the edit on output_json", async () => {
    const org = await seedOrg()
    const original = documentInput()
    const logId = await seedHeldDocumentWrite(
      org.organizationId,
      org.userId,
      original,
    )

    const edit: HeldWriteEdit = {
      vatAmounts: [{ rateLabel: "21 %", base: "9500.00", vat: "1995.00" }],
    }
    await readAndMergeForApprove({
      organizationId: org.organizationId,
      userId: org.userId,
      toolCallLogId: logId,
      edit,
    })
    await markApproved({
      organizationId: org.organizationId,
      userId: org.userId,
      toolCallLogId: logId,
      applied: { summaryRecordId: "doc-1" },
      edit,
    })

    const after = await readRow(logId)
    // input_json is the untouched original proposal — the edit never lands there.
    expect(after.input_json).toEqual(original)
    // output_json carries the applied result AND the edit that produced it.
    expect(after.output_json["resolution"]).toBe("approved")
    expect(after.output_json["summaryRecordId"]).toBe("doc-1")
    expect(after.output_json["edit"]).toEqual(edit)
  })

  it("approving WITHOUT an edit records no `edit` key on output_json", async () => {
    const org = await seedOrg()
    const logId = await seedHeldDocumentWrite(
      org.organizationId,
      org.userId,
      documentInput(),
    )

    await markApproved({
      organizationId: org.organizationId,
      userId: org.userId,
      toolCallLogId: logId,
      applied: { summaryRecordId: "doc-1" },
    })

    const after = await readRow(logId)
    expect(after.output_json["edit"]).toBeUndefined()
  })

  it("never rewrites an AMBIGUOUS multi-partial VAT group even if the edit targets its label", async () => {
    const org = await seedOrg()
    const input = {
      ...documentInput(),
      lines: [
        {
          eventId: "00000000-0000-7000-8000-000000000003",
          partials: [
            {
              baseAmount: "10000.00",
              vatMode: "STANDARD",
              vatRate: "21",
              vatAmount: "2100.00",
              currencyCode: "CZK",
            },
            {
              baseAmount: "500.00",
              vatMode: "STANDARD",
              vatRate: "21",
              vatAmount: "105.00",
              currencyCode: "CZK",
            },
          ],
        },
      ],
    }
    const logId = await seedHeldDocumentWrite(
      org.organizationId,
      org.userId,
      input,
    )

    const { fields } = await readAndMergeForApprove({
      organizationId: org.organizationId,
      userId: org.userId,
      toolCallLogId: logId,
      edit: { vatAmounts: [{ rateLabel: "21 %", base: "1.00", vat: "1.00" }] },
    })

    const lines = fields["lines"] as Array<{
      partials: Array<Record<string, unknown>>
    }>
    // Both original 21 % partials survive untouched — no safe 1:1 target.
    expect(lines[0]?.partials).toEqual(input.lines[0]?.partials)
  })

  it("refuses to merge/replay an already-resolved held write (the guard runs before the merge)", async () => {
    const org = await seedOrg()
    const logId = await seedHeldDocumentWrite(
      org.organizationId,
      org.userId,
      documentInput(),
    )
    await markApproved({
      organizationId: org.organizationId,
      userId: org.userId,
      toolCallLogId: logId,
      applied: { summaryRecordId: "doc-1" },
    })

    await expect(
      readAndMergeForApprove({
        organizationId: org.organizationId,
        userId: org.userId,
        toolCallLogId: logId,
        edit: { header: { date: "2026-08-01" } },
      }),
    ).rejects.toThrow("already resolved")
  })
})
