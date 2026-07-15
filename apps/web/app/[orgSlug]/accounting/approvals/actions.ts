"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import {
  eq,
  executeRows,
  lockPeriodInTx,
  recordConfidentWrong,
  sql,
  unconfirmTemplateOnReject,
  updateToolCallLogOutput,
  withAdminBypass,
  withOrganization,
} from "@workspace/db"
import { organization } from "@workspace/db/schema"
import {
  captureAndBookIfInvoice,
  createAsset,
  createDepreciationPlan,
  createEvent,
  createInventoryCount,
  post,
  type DocumentInput,
  type EventInput,
  type PostInput,
} from "@workspace/accounting"
import { stripGateEnvelope } from "@workspace/shared/api"

import { getOrgAccountingContext } from "../../_lib/accounting-data"
import {
  applyHeldWriteEdit,
  HeldWriteEditSchema,
} from "../../../_components/held-writes/edit-model"

const ResolveSchema = z.object({
  orgSlug: z.string().min(1).max(100),
  id: z.uuid(),
  action: z.enum(["approve", "reject"]),
  note: z.string().max(2000).optional(),
  /**
   * [M1.7] Edit-before-approve (A-Z 2.6): the reviewer's correction to the
   * held payload, applied to the ORIGINAL `input_json` before it replays
   * through `stripGateEnvelope` + the domain call. Only meaningful on
   * `action: "approve"` — a reject just marks the row rejected, nothing to
   * edit. See `edit-model.ts` for the exact editable field set + why.
   */
  edit: HeldWriteEditSchema.optional(),
})
export type ResolveHeldWriteInput = z.infer<typeof ResolveSchema>

export interface ResolveHeldWriteResult {
  ok: boolean
  error?: string
  /**
   * On a successful approve, the ids of what actually LANDED in the domain — so
   * the UI can link the reviewer to the booked invoice / journal entry instead of
   * the row silently vanishing on revalidate. Absent on reject / failure.
   */
  landed?: {
    summaryRecordId?: string
    postingIds?: string[]
    eventId?: string
  }
}

interface HeldLogRow {
  tool_name: string
  input_json: unknown
  auto_applied: boolean
  approved_by_user_id: string | null
  /**
   * [WS-2] OCR template this write was derived from, read from the gate's audit
   * `output_json.serverGate.templateId` (NULL for structured-export writes).
   */
  template_id: string | null
  /**
   * [F1 / M3.2] The full audit `serverGate` blob (veto + score + `.shadow` — the
   * M3 calibration x-axis, see shadow-score.ts), forwarded verbatim into the
   * resolved `output_json` so it survives `updateToolCallLogOutput`'s
   * full-column replace. `null` for a pre-W1.5 row with no shadow score.
   */
  server_gate: unknown
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
  const { orgSlug, id, action, note, edit } = parsed.data

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
          // FOR UPDATE serializes concurrent resolves of the SAME held row: a
          // second approve (double-click / two tabs / two reviewers) blocks here
          // until the first commits, then reads approved_by_user_id set and bails
          // at the guard below. Without the lock both pass the stale-read guard,
          // each captureDocument mints a DISTINCT summary_record, and bookDocument
          // (idempotent only PER summary_record) books BOTH → a duplicate ledger
          // posting. The row lock makes held-row resolution single-shot.
          sql`select tool_name, input_json, auto_applied,
                     approved_by_user_id::text as approved_by_user_id,
                     (output_json->'serverGate'->>'templateId') as template_id,
                     (output_json->'serverGate') as server_gate
              from tool_call_log
              where id = ${id}::uuid
              for update`,
        )
        const row = rows[0]
        if (!row) {
          return { ok: false, error: "Záznam nebyl nalezen." }
        }
        if (row.auto_applied || row.approved_by_user_id !== null) {
          return { ok: false, error: "Záznam už byl vyřízen." }
        }

        if (action === "reject") {
          // [WS-2] Reject-reset: a booking derived from an OCR template that a
          // reviewer rejects is evidence the template's locators produced a bad
          // extraction. Un-confirm the template (human_confirmed_at → NULL) and
          // stamp last_reject_at so the server veto HOLDS every future extraction
          // from it until a human re-confirms via POST /v1/ocr-templates/:id/confirm.
          // Shared helper, identical to the public API held-writes reject branch —
          // both surfaces write the same trust-state so they can never diverge.
          // Workspace-scoped: ocr_extraction_template's RLS keys on app.workspace_id,
          // which withOrganization set on this tx (an RLS no-op for a foreign
          // template). reject-ONLY; no template on the row → no-op.
          await unconfirmTemplateOnReject(db, row.template_id)
          await updateToolCallLogOutput(db, {
            toolCallLogId: id,
            output: {
              resolution: "rejected",
              note: note ?? null,
              // [F1 / M3.2] Forward the audit `serverGate` (incl. `.shadow`)
              // FORWARD across resolve — `updateToolCallLogOutput` fully
              // replaces `output_json`, so without this the shadow score
              // persisted at HOLD time would be silently wiped the instant a
              // reviewer resolves the write. See held-writes.controller.ts's
              // matching API-side fix for the full rationale.
              ...(row.server_gate !== null
                ? { serverGate: row.server_gate }
                : {}),
            },
            approvedByUserId: ctx.userId,
          })
          return { ok: true }
        }

        // Approve: peel the gate envelope off and replay the (possibly
        // reviewer-EDITED, see M1.7) payload through the SAME domain mapping
        // the API controller uses, with the approving user as the responsible
        // person. `stripGateEnvelope` is the single source of truth shared
        // with the two API paths (the capture controller and the API
        // held-write resolve), so all three re-run paths hand `captureDocument`
        // the identical field set — no surface can drift a gate key in or out.
        // None of the peeled fields is domain data.
        //
        // [M1.7] `edit` merges onto the ORIGINAL `input_json` BEFORE the gate
        // envelope is stripped — the edited fields still pass through the
        // exact same domain call below, which re-validates them in full
        // (balance, period lock, regime); editing changes what is proposed,
        // never how it is validated. `input_json` itself is left untouched
        // (the audit record of what the agent originally proposed); the
        // edit is instead recorded on `output_json` alongside the applied
        // result, so an approved-with-edits write is visibly distinguishable
        // from a plain approve.
        const rawInput = (row.input_json ?? {}) as Record<string, unknown>
        const mergedInput = edit
          ? applyHeldWriteEdit(row.tool_name, rawInput, edit)
          : rawInput
        const fields = stripGateEnvelope(mergedInput)

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
            const docInput = fields as unknown as DocumentInput
            await lockPeriodInTx(db, orgCtx.organizationId, docInput.periodId)
            // Derive mode: a captured INVOICE is booked deterministically in the
            // SAME tx, so "approve a captured invoice" lands ONE fully-wired
            // accounting fact (event + doc + posting per event, every line linked
            // to its source partial_record) instead of an orphaned capture. The
            // předkontace is derived from each partial's facts — no caller-supplied
            // account lines — so what the reviewer previewed IS what posts.
            // Non-invoice vouchers (cash/bank) do not book through předkontace.
            // captureAndBookIfInvoice is the SAME unit the API held-write resolve
            // path uses, so the two approve surfaces can never drift on whether
            // they book (that drift is what this task closes). It fails closed
            // (throws → the whole approve rolls back, the row stays held).
            const { doc, postingIds } = await captureAndBookIfInvoice(
              db,
              orgCtx,
              docInput,
              ctx.userId,
            )
            applied = {
              summaryRecordId: doc.summaryRecordId,
              designation: doc.designation,
              sequenceNumber: doc.sequenceNumber,
              lines: doc.lines,
              ...(postingIds ? { postingIds } : {}),
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
          case "createAsset": {
            // periodId binds the proposal to a period (audit + close-blocking);
            // it is not domain data for the org-scoped asset card, so peel it off
            // before the domain insert (same as the API controller).
            const { periodId, ...cardFields } = fields as {
              periodId: string
            } & Record<string, unknown>
            await lockPeriodInTx(db, orgCtx.organizationId, periodId)
            const asset = await createAsset(db, orgCtx, {
              ...cardFields,
              responsibleUserId: ctx.userId,
            } as unknown as Parameters<typeof createAsset>[2])
            applied = {
              assetId: asset.id,
              designation: asset.designation,
              sequenceNumber: asset.sequenceNumber,
            }
            break
          }
          case "createDepreciationPlan": {
            const { periodId, ...planFields } = fields as {
              periodId: string
            } & Record<string, unknown>
            await lockPeriodInTx(db, orgCtx.organizationId, periodId)
            const planId = await createDepreciationPlan(
              db,
              orgCtx,
              planFields as unknown as Parameters<
                typeof createDepreciationPlan
              >[2],
            )
            applied = { depreciationPlanId: planId }
            break
          }
          case "createInventoryCount": {
            const { periodId, ...countFields } = fields as {
              periodId: string
            } & Record<string, unknown>
            await lockPeriodInTx(db, orgCtx.organizationId, periodId)
            const count = await createInventoryCount(
              db,
              orgCtx,
              countFields as unknown as Parameters<
                typeof createInventoryCount
              >[2],
            )
            applied = {
              inventoryCountId: count.id,
              designation: count.designation,
              sequenceNumber: count.sequenceNumber,
            }
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
          // [M1.7] `edit` is recorded alongside the applied result (never on
          // `input_json`, the untouched original proposal) so an
          // approved-with-edits write carries its own audit trail.
          output: {
            resolution: "approved",
            ...applied,
            // [F1 / M3.2] See the reject branch above — forward `serverGate`
            // so the shadow score survives resolve.
            ...(row.server_gate !== null
              ? { serverGate: row.server_gate }
              : {}),
            ...(edit ? { edit } : {}),
          },
          approvedByUserId: ctx.userId,
        })
        // Surface what landed so the UI can link to the booked invoice / journal
        // (a posting held-write returns a single `postingId`; a captured invoice
        // booked via bookDocument returns `postingIds`, one per event).
        const postingIds =
          (applied["postingIds"] as string[] | undefined) ??
          (applied["postingId"] ? [applied["postingId"] as string] : undefined)
        return {
          ok: true,
          landed: {
            summaryRecordId: applied["summaryRecordId"] as string | undefined,
            postingIds,
            eventId: applied["eventId"] as string | undefined,
          },
        }
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

const MarkConfidentWrongSchema = z.object({
  orgSlug: z.string().min(1).max(100),
  id: z.uuid(),
  note: z.string().max(2000).optional(),
})
/** @public — confident-wrong increment seam input; the review UI is wired at M3 (post-auto-apply). */
export type MarkConfidentWrongInput = z.infer<typeof MarkConfidentWrongSchema>

/**
 * @public
 * [§I8] Mark a previously AUTO-APPLIED booking as confidently wrong — the human
 * side of the confident-wrong circuit breaker. A reviewer flags a write the gate
 * auto-applied (read green, applied without a human) that turned out wrong; this
 * TRIPS the workspace breaker so `runGatedWrite` refuses every autonomous write
 * until an operator investigates and clears it.
 *
 * This is a HUMAN-ONLY path: it is a session-authenticated Server Action, never
 * reachable by an agent (agents hold API keys against apps/api, not a web
 * session). The `recordConfidentWrong` seam GUARDS on `auto_applied = true`, so a
 * held / rejected write can never be marked confident-wrong. DORMANT at cold
 * start: no write is ever auto-applied, so the guard always refuses today.
 *
 * Identity comes only from the session; the client supplies the row id + note.
 */
export async function markConfidentWrong(
  input: MarkConfidentWrongInput,
): Promise<ResolveHeldWriteResult> {
  const parsed = MarkConfidentWrongSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: "Neplatný požadavek." }
  }
  const { orgSlug, id, note } = parsed.data

  const ctx = await getOrgAccountingContext(orgSlug)
  if (!ctx) {
    return { ok: false, error: "Organizace nebyla nalezena." }
  }

  try {
    await withOrganization(ctx.organizationId, ctx.userId, (db) =>
      recordConfidentWrong(db, {
        toolCallLogId: id,
        actorUserId: ctx.userId,
        note: note ?? null,
      }),
    )
  } catch (err) {
    // The seam refuses a non-auto-applied write (the guard) or a missing row.
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Operace se nezdařila.",
    }
  }

  revalidatePath(`/${orgSlug}/accounting/approvals`)
  return { ok: true }
}
