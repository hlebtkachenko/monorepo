"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import {
  eq,
  executeRows,
  lockPeriodInTx,
  sql,
  updateToolCallLogOutput,
  withAdminBypass,
  withOrganization,
} from "@workspace/db"
import { organization } from "@workspace/db/schema"
import {
  captureDocument,
  createEvent,
  post,
  type DocumentInput,
  type EventInput,
  type PostInput,
} from "@workspace/accounting"

import { getOrgAccountingContext } from "../../_lib/accounting-data"

const ResolveSchema = z.object({
  orgSlug: z.string().min(1).max(100),
  id: z.uuid(),
  action: z.enum(["approve", "reject"]),
  note: z.string().max(2000).optional(),
})
export type ResolveHeldWriteInput = z.infer<typeof ResolveSchema>

export interface ResolveHeldWriteResult {
  ok: boolean
  error?: string
}

interface HeldLogRow {
  tool_name: string
  input_json: unknown
  auto_applied: boolean
  approved_by_user_id: string | null
}

/**
 * Resolve a held gated write (tool_call_log row the confidence gate parked
 * with 202) — the web half of #459, mirroring the API's approve-execution
 * semantics from `accounting-writes.gate.ts`:
 *
 * - reject: mark the row resolved (`approved_by_user_id` = reviewer,
 *   `output_json` = {resolution: "rejected", note}) without running anything.
 * - approve: replay the ORIGINAL gated payload through the same domain call
 *   the controller would have run (`createEvent` / `captureDocument` / `post`),
 *   with `responsibleUserId` = the APPROVING user, and persist the domain
 *   result on the log row — all in ONE `withOrganization` transaction so the
 *   write and its resolution commit or roll back together.
 *
 * Identity comes only from the session (same membership resolution the page
 * uses); the client supplies nothing but the row id and the decision.
 */
export async function resolveHeldWrite(
  input: ResolveHeldWriteInput,
): Promise<ResolveHeldWriteResult> {
  const parsed = ResolveSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: "Neplatný požadavek." }
  }
  const { orgSlug, id, action, note } = parsed.data

  const ctx = await getOrgAccountingContext(orgSlug)
  if (!ctx) {
    return { ok: false, error: "Organizace nebyla nalezena." }
  }

  // The domain writes need the workspace id (OrgCtx); the page context only
  // carries org + user, so recover it from the organization row.
  const org = await withAdminBypass(async (db) => {
    const rows = await db
      .select({ workspace_id: organization.workspace_id })
      .from(organization)
      .where(eq(organization.id, ctx.organizationId))
      .limit(1)
    return rows[0] ?? null
  })
  if (!org) {
    return { ok: false, error: "Organizace nebyla nalezena." }
  }
  const orgCtx = {
    organizationId: ctx.organizationId,
    workspaceId: org.workspace_id,
  }

  let result: ResolveHeldWriteResult
  try {
    result = await withOrganization(
      ctx.organizationId,
      ctx.userId,
      async (db): Promise<ResolveHeldWriteResult> => {
        const rows = await executeRows<HeldLogRow>(
          db,
          sql`select tool_name, input_json, auto_applied,
                     approved_by_user_id::text as approved_by_user_id
              from tool_call_log
              where id = ${id}::uuid`,
        )
        const row = rows[0]
        if (!row) {
          return { ok: false, error: "Záznam nebyl nalezen." }
        }
        if (row.auto_applied || row.approved_by_user_id !== null) {
          return { ok: false, error: "Záznam už byl vyřízen." }
        }

        if (action === "reject") {
          await updateToolCallLogOutput(db, {
            toolCallLogId: id,
            output: { resolution: "rejected", note: note ?? null },
            approvedByUserId: ctx.userId,
          })
          return { ok: true }
        }

        // Approve: strip the gate-only fields and replay the original payload
        // through the SAME domain mapping the API controller uses, with the
        // approving user as the responsible person.
        const {
          confidence: _confidence,
          rationale: _rationale,
          conversationId: _conversationId,
          ...fields
        } = (row.input_json ?? {}) as Record<string, unknown>

        let applied: Record<string, unknown>
        switch (row.tool_name) {
          case "createAccountingEvent": {
            await lockPeriodInTx(
              db,
              orgCtx.organizationId,
              (fields as { periodId: string }).periodId,
            )
            const ev = await createEvent(db, orgCtx, {
              ...fields,
              responsibleUserId: ctx.userId,
            } as unknown as EventInput)
            applied = {
              eventId: ev.eventId,
              designation: ev.designation,
              sequenceNumber: ev.sequenceNumber,
            }
            break
          }
          case "captureAccountingDocument": {
            await lockPeriodInTx(
              db,
              orgCtx.organizationId,
              (fields as { periodId: string }).periodId,
            )
            const doc = await captureDocument(
              db,
              orgCtx,
              fields as unknown as DocumentInput,
            )
            applied = {
              summaryRecordId: doc.summaryRecordId,
              designation: doc.designation,
              sequenceNumber: doc.sequenceNumber,
              lines: doc.lines,
            }
            break
          }
          case "createAccountingPosting": {
            const { kind, entry } = fields as {
              kind?: unknown
              entry?: unknown
            }
            await lockPeriodInTx(
              db,
              orgCtx.organizationId,
              (entry as { periodId: string }).periodId,
            )
            const posting = await post(db, orgCtx, {
              kind,
              entry: {
                ...(entry as Record<string, unknown>),
                responsibleUserId: ctx.userId,
              },
            } as unknown as PostInput)
            applied = { postingId: posting.postingId, lineIds: posting.lineIds }
            break
          }
          default:
            return {
              ok: false,
              error: `Neznámá operace: ${row.tool_name}`,
            }
        }

        await updateToolCallLogOutput(db, {
          toolCallLogId: id,
          output: { resolution: "approved", ...applied },
          approvedByUserId: ctx.userId,
        })
        return { ok: true }
      },
    )
  } catch (err) {
    // A domain guard rejected the replayed write (period closed, regime
    // mismatch, missing fx rate, …) — surface the message, keep the row held.
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Operace se nezdařila.",
    }
  }

  if (result.ok) {
    revalidatePath(`/${orgSlug}/accounting/approvals`)
  }
  return result
}
