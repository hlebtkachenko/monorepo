/**
 * executeHeldWrite — the single shared dispatcher that replays an approved held
 * write through the domain, for BOTH the public API (`held-writes.controller.ts`
 * `executeStored`) and the web approvals server action (`resolveHeldWrite`).
 *
 * Before this module the two surfaces each carried a hand-synced copy of the same
 * per-op switch (`safeParse` → `stripGateEnvelope` → `lockPeriodInTx` → domain
 * call). Two copies drift; a drift on the human-review gate is a credibility hole
 * (audit finding S9). This is the one implementation both call, so approving the
 * SAME payload via the UI and via the API produces IDENTICAL domain effects
 * (EPIC #770 Invariant 2).
 *
 * Two-payload contract (the load-bearing subtlety):
 *  - `storedInput` is the ORIGINAL agent-proposed `input_json`. It is the ONLY
 *    thing `safeParse`d — that is the S5 closure (a stale / schema-drifted stored
 *    row must 422, not reach the `as unknown` domain cast). It is always schema-
 *    valid at store time (the sole held-row writer is `runGatedWrite`, behind the
 *    Zod pipe), so this never false-422s a live payload — only genuine drift does.
 *  - `editedInput` is the web-only reviewer edit (`applyHeldWriteEdit` merge; that
 *    helper lives in `apps/web`, which a domain package cannot import — so the
 *    merge stays in the web wrapper and the merged result arrives here). It is
 *    EXECUTED but never `safeParse`d, because a reviewer may legitimately set a
 *    NEGATIVE double-entry amount (červené storno, §42 / ČÚS 001) that the domain
 *    books but the unsigned request schema would reject. The API passes no
 *    `editedInput`, so `source` is the validated `parsed.data` — byte-identical to
 *    the old `executeStored`.
 *
 * `stripGateEnvelope` is the single source of truth for the gate-envelope key set
 * (confidence / rationale / conversationId / signals / templateId / extractionMethod),
 * used here for every case (including `createAccountingEvent`, which previously
 * hand-destructured 4 of the 6 keys — a verified no-op since the event schema
 * declares none of the two extra keys).
 */
import { lockPeriodInTx, type OrganizationBoundDb } from "@workspace/db"
import {
  CaptureAccountingDocumentRequestSchema,
  CreateAccountingEventRequestSchema,
  CreateAccountingPostingRequestSchema,
  CreateAssetRequestSchema,
  CreateDepreciationPlanRequestSchema,
  CreateInventoryCountRequestSchema,
  stripGateEnvelope,
} from "@workspace/shared/api"
import { ValidationError } from "@workspace/shared/errors"

import { createEvent } from "../capture"
import { captureAndBookIfInvoice } from "../capture-and-book"
import {
  postWithObligation,
  type ObligationDirective,
  type PostWithObligationInput,
} from "../posting/post-with-obligation"
import {
  createAsset,
  createDepreciationPlan,
  createInventoryCount,
  type AssetInput,
  type DepreciationPlanInput,
  type InventoryCountInput,
} from "../setup"
import type { DocumentInput, EventInput, OrgCtx } from "../types"

/**
 * Thrown (as {@link ValidationError} → 422) when the STORED payload no longer
 * validates against the current request schema. Exported so the web wrapper can
 * map it to a localized message (the API surfaces it via `translateAccountingError`).
 */
export const HELD_WRITE_STALE_MESSAGE =
  "The stored payload no longer validates against the current request schema"

/**
 * Replay an approved held write through its domain call.
 *
 * @param db            organization-bound tx (RLS GUCs already set by the caller)
 * @param ctx           org + workspace scope + optional `inboxId` provenance stamp
 * @param toolName      the gated operation id (`tool_call_log.tool_name`)
 * @param storedInput   ORIGINAL `input_json` — validated for staleness (S5)
 * @param approverUserId the APPROVER (never the author) → `responsibleUserId`
 * @param editedInput   web-only reviewer edit result — EXECUTED, not validated
 * @returns the domain result shape persisted onto the resolved `output_json`
 */
export async function executeHeldWrite(
  db: OrganizationBoundDb,
  ctx: OrgCtx,
  toolName: string,
  storedInput: unknown,
  approverUserId: string,
  editedInput?: unknown,
): Promise<Record<string, unknown>> {
  switch (toolName) {
    case "createAccountingEvent": {
      const parsed = CreateAccountingEventRequestSchema.safeParse(storedInput)
      if (!parsed.success) throw new ValidationError(HELD_WRITE_STALE_MESSAGE)
      const source = (editedInput ?? parsed.data) as Record<string, unknown>
      const fields = stripGateEnvelope(source)
      await lockPeriodInTx(
        db,
        ctx.organizationId,
        (fields as { periodId: string }).periodId,
      )
      const ev = await createEvent(db, ctx, {
        ...fields,
        responsibleUserId: approverUserId,
      } as unknown as EventInput)
      return {
        eventId: ev.eventId,
        designation: ev.designation,
        sequenceNumber: ev.sequenceNumber,
      }
    }
    case "captureAccountingDocument": {
      const parsed =
        CaptureAccountingDocumentRequestSchema.safeParse(storedInput)
      if (!parsed.success) throw new ValidationError(HELD_WRITE_STALE_MESSAGE)
      const source = (editedInput ?? parsed.data) as Record<string, unknown>
      const fields = stripGateEnvelope(source)
      await lockPeriodInTx(
        db,
        ctx.organizationId,
        (fields as { periodId: string }).periodId,
      )
      // Capture, then book iff invoice type — the SAME capture-approve unit both
      // surfaces use: approving a captured invoice lands the posting per event +
      // its saldokonto obligation instead of an orphaned capture. Non-invoice
      // vouchers capture only. Fails closed (throws → whole approve rolls back).
      const { doc, postingIds } = await captureAndBookIfInvoice(
        db,
        ctx,
        fields as unknown as DocumentInput,
        approverUserId,
      )
      return {
        summaryRecordId: doc.summaryRecordId,
        designation: doc.designation,
        sequenceNumber: doc.sequenceNumber,
        lines: doc.lines,
        ...(postingIds ? { postingIds } : {}),
      }
    }
    case "createAccountingPosting": {
      const parsed = CreateAccountingPostingRequestSchema.safeParse(storedInput)
      if (!parsed.success) throw new ValidationError(HELD_WRITE_STALE_MESSAGE)
      const source = (editedInput ?? parsed.data) as Record<string, unknown>
      const { kind, entry, openObligation } = source as {
        kind: unknown
        entry: unknown
        openObligation?: unknown
      }
      await lockPeriodInTx(
        db,
        ctx.organizationId,
        (entry as { periodId: string }).periodId,
      )
      // postWithObligation, NOT bare post — the optional openObligation directive
      // (top-level domain data) must replay identically on both surfaces, or the
      // web path would silently drop the saldokonto obligation.
      const posting = await postWithObligation(db, ctx, {
        kind,
        entry: {
          ...(entry as Record<string, unknown>),
          responsibleUserId: approverUserId,
        },
        obligation:
          (openObligation as ObligationDirective | null | undefined) ?? null,
      } as unknown as PostWithObligationInput)
      return { postingId: posting.postingId, lineIds: posting.lineIds }
    }
    case "createAsset": {
      const parsed = CreateAssetRequestSchema.safeParse(storedInput)
      if (!parsed.success) throw new ValidationError(HELD_WRITE_STALE_MESSAGE)
      const source = (editedInput ?? parsed.data) as Record<string, unknown>
      // periodId binds the proposal to a period (audit + close-blocking); not
      // domain data for the org-scoped card, peeled off before the insert.
      const { periodId, ...cardFields } = stripGateEnvelope(source) as {
        periodId: string
      } & Record<string, unknown>
      await lockPeriodInTx(db, ctx.organizationId, periodId)
      const asset = await createAsset(db, ctx, {
        ...cardFields,
        responsibleUserId: approverUserId,
      } as unknown as AssetInput)
      return {
        assetId: asset.id,
        designation: asset.designation,
        sequenceNumber: asset.sequenceNumber,
      }
    }
    case "createDepreciationPlan": {
      const parsed = CreateDepreciationPlanRequestSchema.safeParse(storedInput)
      if (!parsed.success) throw new ValidationError(HELD_WRITE_STALE_MESSAGE)
      const source = (editedInput ?? parsed.data) as Record<string, unknown>
      const { periodId, ...planFields } = stripGateEnvelope(source) as {
        periodId: string
      } & Record<string, unknown>
      await lockPeriodInTx(db, ctx.organizationId, periodId)
      const planId = await createDepreciationPlan(
        db,
        ctx,
        planFields as unknown as DepreciationPlanInput,
      )
      return { depreciationPlanId: planId }
    }
    case "createInventoryCount": {
      const parsed = CreateInventoryCountRequestSchema.safeParse(storedInput)
      if (!parsed.success) throw new ValidationError(HELD_WRITE_STALE_MESSAGE)
      const source = (editedInput ?? parsed.data) as Record<string, unknown>
      const { periodId, ...countFields } = stripGateEnvelope(source) as {
        periodId: string
      } & Record<string, unknown>
      await lockPeriodInTx(db, ctx.organizationId, periodId)
      const count = await createInventoryCount(
        db,
        ctx,
        countFields as unknown as InventoryCountInput,
      )
      return {
        inventoryCountId: count.id,
        designation: count.designation,
        sequenceNumber: count.sequenceNumber,
      }
    }
    default:
      throw new ValidationError(
        `Held write targets an unknown operation "${toolName}" and cannot be approved`,
      )
  }
}
