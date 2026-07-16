"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import {
  eq,
  executeRows,
  recordConfidentWrong,
  sql,
  unconfirmTemplateOnReject,
  updateToolCallLogOutput,
  withAdminBypass,
  withOrganization,
} from "@workspace/db"
import { organization } from "@workspace/db/schema"
import {
  executeHeldWrite,
  HELD_WRITE_STALE_MESSAGE,
  mintInboxItem,
} from "@workspace/accounting"
import { INBOX_STAMPED_OPERATION_IDS } from "@workspace/shared/api"

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
   * [S1 / G2-R1 rider] The original author — an approver may not approve their
   * OWN held write (author != approver). Mirrors the API backstop at
   * `held-writes.controller.ts` so the web door is not weaker than the API one.
   */
  user_id: string | null
  /** [Tier 4] Actor that authored the write → inbox_item.created_by provenance. */
  actor_kind: string
  /** [Tier 4] The agent's rationale → inbox_item.reasoning. */
  rationale: string | null
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
  /**
   * [S3] The gate's `output_json.payloadHash`, forwarded across resolve so a
   * post-resolve same-key replay returns the recorded outcome instead of a
   * misleading 409 (the gate replay compares the stored hash). `null` for a row
   * the gate stored without one.
   */
  payload_hash: string | null
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

  // [S2] Role gate (D3): only owner/admin/member may vyřídit held writes. A guest
  // or an agent-role membership must never approve an agent's booking into the
  // ledger — the public API requires a human, user-bound key; this is the web
  // mirror of that guard, closing the "any active membership can approve" hole.
  // ALLOWLIST, not a denylist: any future membership role is denied by default
  // (fail-closed), matching the API's allowlist backstop — do not invert.
  if (ctx.role !== "owner" && ctx.role !== "admin" && ctx.role !== "member") {
    return { ok: false, error: "Nemáte oprávnění vyřizovat návrhy." }
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
                     user_id::text as user_id,
                     actor_kind::text as actor_kind, rationale,
                     (output_json->'serverGate'->>'templateId') as template_id,
                     (output_json->'serverGate') as server_gate,
                     (output_json->>'payloadHash') as payload_hash
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

        // [S1 / G2-R1 rider] author != approver: a held write can never be
        // APPROVED by the same user that authored it — the web mirror of the API
        // backstop (`held-writes.controller.ts`). If the Brain's user-bound key
        // leaks and the same identity opens the approvals UI, it still cannot
        // approve its OWN queued writes. Reject by the author stays allowed
        // (closing a review is not a bypass), matching the API semantics exactly.
        if (action === "approve" && row.user_id === ctx.userId) {
          return {
            ok: false,
            error:
              "Návrh nemůže schválit jeho autor; musí ho posoudit jiný uživatel.",
          }
        }

        // [S4] Stamp resolvedAt on BOTH approve and reject so the web and API
        // surfaces write the identical resolved output_json shape (the API side
        // does the same via `select now()`).
        const [nowRow] = await executeRows<{ now: Date | string }>(
          db,
          sql`select now() as now`,
        )
        const resolvedAt =
          nowRow?.now instanceof Date
            ? nowRow.now.toISOString()
            : String(nowRow?.now)

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
              resolvedAt,
              // [F1 / M3.2] Forward the audit `serverGate` (incl. `.shadow`)
              // FORWARD across resolve — `updateToolCallLogOutput` fully
              // replaces `output_json`, so without this the shadow score
              // persisted at HOLD time would be silently wiped the instant a
              // reviewer resolves the write. See held-writes.controller.ts's
              // matching API-side fix for the full rationale.
              ...(row.server_gate !== null
                ? { serverGate: row.server_gate }
                : {}),
              // [S3] Forward payloadHash so a post-reject same-key replay returns
              // the recorded outcome instead of a 409 idempotency conflict.
              ...(row.payload_hash !== null
                ? { payloadHash: row.payload_hash }
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
        // The reviewer's edit is applied to the ORIGINAL stored payload and handed
        // to the shared dispatcher as the payload to EXECUTE. The dispatcher
        // validates the STORED (pre-edit) payload, never the edit — so a
        // deliberately-signed červené storno amount (§42 / ČÚS 001), which the
        // unsigned request schema would reject, still books. `undefined` when the
        // reviewer made no edit ⇒ the dispatcher executes the validated payload.
        const editedInput = edit
          ? applyHeldWriteEdit(row.tool_name, rawInput, edit)
          : undefined

        // [Tier 4] Mint the provenance record for this landed proposal and thread
        // its id onto the ctx, so every row the replay INSERTs carries inbox_id
        // ("Created by Agent"). Minted inside the FOR-UPDATE-guarded approve tx →
        // atomic with the landing, one item per approved write (append-only).
        // Gated on actor_kind: a HUMAN-authored held write (e.g. a human-bound key
        // parked on the amount ceiling) approved here leaves inbox_id NULL —
        // indistinguishable from a direct human booking — so the read-model
        // `inbox_id IS NOT NULL` filter means exactly "agent-originated". Also
        // gated on the op: only the ledger-fact ops land rows with an inbox_id
        // column, so a register-card creator mints no orphan inbox_item.
        const inboxId =
          row.actor_kind !== "human" &&
          (INBOX_STAMPED_OPERATION_IDS as readonly string[]).includes(
            row.tool_name,
          )
            ? await mintInboxItem(db, orgCtx, {
                toolCallLogId: id,
                kind: row.tool_name,
                createdBy: row.actor_kind,
                source: "agent",
                reasoning: row.rationale,
              })
            : null
        const writeCtx = { ...orgCtx, inboxId }

        // Replay through the SHARED dispatcher — the single source of truth both
        // this action and the public API (`held-writes.controller.ts`) call, so
        // approving the SAME payload on either surface lands IDENTICAL domain
        // effects. It validates `rawInput` (the stored payload) against the request
        // schema (closes the web's missing re-validation), then executes the edited
        // payload (or the validated stored one when there was no edit).
        const applied = await executeHeldWrite(
          db,
          writeCtx,
          row.tool_name,
          rawInput,
          ctx.userId,
          editedInput,
        )

        await updateToolCallLogOutput(db, {
          toolCallLogId: id,
          // [M1.7] `edit` is recorded alongside the applied result (never on
          // `input_json`, the untouched original proposal) so an
          // approved-with-edits write carries its own audit trail.
          output: {
            resolution: "approved",
            // [S4] note + resolvedAt so web and API write the identical shape.
            note: note ?? null,
            resolvedAt,
            ...applied,
            // [F1 / M3.2] See the reject branch above — forward `serverGate`
            // so the shadow score survives resolve.
            ...(row.server_gate !== null
              ? { serverGate: row.server_gate }
              : {}),
            // [S3] Forward payloadHash so a post-approve same-key replay returns
            // the recorded outcome instead of a 409 idempotency conflict.
            ...(row.payload_hash !== null
              ? { payloadHash: row.payload_hash }
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
    // The shared dispatcher 422s a stored payload that no longer validates
    // against the current request schema; its thrown text is English (for
    // `translateAccountingError` on the API side), so localize it here.
    if (err instanceof Error && err.message === HELD_WRITE_STALE_MESSAGE) {
      return {
        ok: false,
        error:
          "Uložený návrh už neodpovídá aktuálnímu schématu a nelze jej schválit.",
      }
    }
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

  // [S2] Role gate (D3): flagging an auto-applied write as confidently wrong is a
  // ledger-trust mutation — same role floor as resolveHeldWrite (deny guest /
  // agent). Author guard is N/A here (this acts on a landed write, not a proposal).
  if (ctx.role !== "owner" && ctx.role !== "admin" && ctx.role !== "member") {
    return { ok: false, error: "Nemáte oprávnění vyřizovat návrhy." }
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
