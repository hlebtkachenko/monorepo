import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common"
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger"
import type { ApiKeyPrincipal } from "@workspace/auth/api-key-verifier"
import {
  and,
  eq,
  executeRows,
  isNull,
  lockPeriodInTx,
  sql,
  unconfirmTemplateOnReject,
  updateToolCallLogOutput,
  withOrganization,
  type OrganizationBoundDb,
} from "@workspace/db"
import { tool_call_log } from "@workspace/db/schema"
import {
  captureAndBookIfInvoice,
  createAsset,
  createDepreciationPlan,
  createEvent,
  createInventoryCount,
  postWithObligation as postPosting,
  type DocumentInput,
  type EventInput,
  type PostWithObligationInput,
} from "@workspace/accounting"
import {
  CaptureAccountingDocumentRequestSchema,
  CreateAccountingEventRequestSchema,
  CreateAccountingPostingRequestSchema,
  CreateAssetRequestSchema,
  CreateDepreciationPlanRequestSchema,
  CreateInventoryCountRequestSchema,
  stripGateEnvelope,
  type ListHeldWritesResponse,
  type ResolveHeldWriteResponse,
} from "@workspace/shared/api"
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@workspace/shared/errors"

import { ApiKeyGuard } from "../../auth/api-key.guard"
import { CurrentPrincipal } from "../../auth/principal.decorator"
import { RequireHumanActor } from "../../auth/require-human-actor.decorator"
import {
  ListHeldWritesResponseDto,
  ResolveHeldWriteRequestDto,
  ResolveHeldWriteResponseDto,
} from "../dto"
import { translateAccountingError } from "./accounting-error"

/**
 * `/v1/accounting/held-writes` — the human-review side of the write gate.
 * `runGatedWrite` HOLDS a low-confidence / large-amount write as a
 * `tool_call_log` row (auto_applied=false, approved_by_user_id NULL) instead
 * of applying it. This controller lists that queue and resolves entries:
 * approve replays the STORED payload through the exact domain path the
 * original endpoint would have used (createEvent / captureDocument / post),
 * inside ONE `withOrganization` transaction with the audit update; reject
 * closes the review with no domain write. The row id is the idempotency
 * anchor — a second resolve conflicts (409), so no Idempotency-Key header.
 * Tenant + approver come ONLY from the API-key principal.
 */
@ApiTags("Accounting")
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
// [#517] The ENTIRE held-writes review surface is human-only: an agent key may
// propose gated writes but can never list or resolve the queue. Declared once at
// the class level so every current + future route inherits the deny (fail-closed
// on a security boundary), enforced by ApiKeyGuard after the key resolves.
@RequireHumanActor()
@Controller({ path: "accounting", version: "1" })
export class HeldWritesController {
  @Get("held-writes")
  @ApiOperation({
    summary: "List held writes",
    description:
      "The organization's review queue of gated writes awaiting a human, " +
      "oldest first. Organization-scoped (FORCE RLS).",
  })
  @ApiOkResponse({ type: ListHeldWritesResponseDto })
  async listHeldWrites(
    @CurrentPrincipal() principal: ApiKeyPrincipal,
  ): Promise<ListHeldWritesResponse> {
    // Agent keys are denied this whole controller by `@RequireHumanActor()`.
    const rows = await withOrganization(
      principal.organizationId,
      principal.userId,
      (db) =>
        db
          .select({
            id: tool_call_log.id,
            tool_name: tool_call_log.tool_name,
            idempotency_key: tool_call_log.idempotency_key,
            actor_kind: tool_call_log.actor_kind,
            confidence: tool_call_log.confidence,
            rationale: tool_call_log.rationale,
            created_at: tool_call_log.created_at,
            input_json: tool_call_log.input_json,
          })
          .from(tool_call_log)
          .where(
            and(
              eq(tool_call_log.organization_id, principal.organizationId),
              eq(tool_call_log.auto_applied, false),
              isNull(tool_call_log.approved_by_user_id),
            ),
          )
          .orderBy(tool_call_log.created_at),
    )
    return {
      heldWrites: rows.map((r) => ({
        id: r.id,
        toolName: r.tool_name,
        idempotencyKey: r.idempotency_key,
        actorKind: r.actor_kind,
        confidence: r.confidence,
        rationale: r.rationale,
        createdAt:
          r.created_at instanceof Date
            ? r.created_at.toISOString()
            : String(r.created_at),
        input: r.input_json as Record<string, unknown>,
      })),
    }
  }

  @Post("held-writes/:id/resolve")
  @HttpCode(200)
  @ApiOperation({
    summary: "Resolve a held write",
    description:
      "Approve (execute the stored payload as the approver) or reject " +
      "(close with no domain write). The row id is the idempotency anchor.",
  })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiOkResponse({ type: ResolveHeldWriteResponseDto })
  async resolveHeldWrite(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: ResolveHeldWriteRequestDto,
    @CurrentPrincipal() principal: ApiKeyPrincipal,
  ): Promise<ResolveHeldWriteResponse> {
    // Agent keys are denied this whole controller by `@RequireHumanActor()`, so
    // only a human key reaches here; the author≠approver rider below is the
    // second, independent backstop (an approver may not approve their OWN write).
    if (principal.userId === null) {
      throw new ForbiddenError(
        "Resolving held writes requires a user-bound API key (approver)",
      )
    }
    const userId = principal.userId
    const { action, note } = body as unknown as {
      action: "approve" | "reject"
      note?: string
    }

    try {
      return await withOrganization(
        principal.organizationId,
        userId,
        async (db): Promise<ResolveHeldWriteResponse> => {
          const rows = await db
            .select({
              tool_name: tool_call_log.tool_name,
              input_json: tool_call_log.input_json,
              // [WS-2] The audit `serverGate` the gate persisted — carries the
              // OCR `templateId` this write was derived from (NULL for
              // structured-export writes). Read server-side only; never client input.
              output_json: tool_call_log.output_json,
              auto_applied: tool_call_log.auto_applied,
              approved_by_user_id: tool_call_log.approved_by_user_id,
              // [G2-R1 rider] The original author — an approver may not approve
              // their OWN held write (author != approver, closes agent
              // self-approval even if a Brain key leaks).
              user_id: tool_call_log.user_id,
            })
            .from(tool_call_log)
            .where(
              and(
                eq(tool_call_log.id, id),
                eq(tool_call_log.organization_id, principal.organizationId),
              ),
            )
            .limit(1)
            // FOR UPDATE serializes concurrent resolves of the SAME held row
            // (double-click / two reviewers): the second approve blocks here until
            // the first commits, then reads approved_by_user_id set and bails at the
            // guard below. Load-bearing now that an approved invoice BOOKS — without
            // the lock both approves pass the stale-read guard, each captureDocument
            // mints a DISTINCT summary_record, and both book → a duplicate ledger
            // posting (bookDocument is idempotent only PER summary_record). Mirrors
            // the web approvals path's FOR UPDATE for the same reason.
            .for("update")
          const row = rows[0]
          if (!row) {
            throw new NotFoundError("Held write not found")
          }
          if (row.auto_applied || row.approved_by_user_id !== null) {
            throw new ConflictError("This write has already been resolved")
          }

          // [G2-R1 rider] author != approver: a held write can never be APPROVED
          // by the same user that authored it. This is the only server-side
          // backstop against agent self-approval this window — if the Brain's
          // user-bound key leaks and calls resolve, it still cannot approve its
          // OWN queued writes. (Reject is safe: closing a review is not a bypass.)
          if (action === "approve" && row.user_id === userId) {
            throw new ForbiddenError(
              "A held write cannot be approved by its author; a different user must review it",
            )
          }

          // [F1 / M3.2] The gate's audit `serverGate` (incl. `.shadow` — the M3
          // calibration x-axis, see shadow-score.ts) read ONCE here so it can be
          // (a) used for the reject-branch templateId lookup below and (b)
          // FORWARDED into the resolved `output_json`. `updateToolCallLogOutput`
          // fully REPLACES `output_json`, so without (b) the shadow score
          // persisted at HOLD time is silently wiped the instant a human
          // resolves the write — exactly when `ingestReviewedRunLog` (M3.3)
          // needs BOTH `resolution` and `serverGate.shadow` on the SAME row.
          // Forwarding ONLY this field (never the whole prior body) keeps the
          // change additive-only: `status`/`reviewId`/`payloadHash` are
          // untouched, so nothing about the resolve decision, replay behavior,
          // or any other persisted field changes.
          const priorServerGate = (
            row.output_json as { serverGate?: unknown } | null
          )?.serverGate

          if (action === "reject") {
            // [WS-2] Reject-reset: a booking derived from an OCR template that a
            // human rejects is evidence the template's locators produced a bad
            // extraction. Un-confirm the template (human_confirmed_at → NULL,
            // last_reject_at → now()) so the server novelty veto HOLDS every
            // future capture from it until a human re-confirms. Workspace-scoped
            // (resolves under this tx's app.workspace_id GUC). REJECT-ONLY —
            // approve must never touch a template. Absent templateId → no-op.
            // The same shared helper backs the web approvals reject path.
            const templateId = ((
              priorServerGate as { templateId?: unknown } | undefined
            )?.templateId ?? null) as string | null
            await unconfirmTemplateOnReject(db, templateId)
            const [nowRow] = await executeRows<{ now: Date | string }>(
              db,
              sql`select now() as now`,
            )
            const resolvedAt =
              nowRow?.now instanceof Date
                ? nowRow.now.toISOString()
                : String(nowRow?.now)
            await updateToolCallLogOutput(db, {
              toolCallLogId: id,
              output: {
                resolution: "rejected",
                note: note ?? null,
                resolvedAt,
                ...(priorServerGate !== undefined
                  ? { serverGate: priorServerGate }
                  : {}),
              },
              approvedByUserId: userId,
            })
            return { id, resolution: "rejected" }
          }

          const result = await this.executeStored(
            db,
            {
              organizationId: principal.organizationId,
              workspaceId: principal.workspaceId,
            },
            row.tool_name,
            row.input_json,
            userId,
          )
          await updateToolCallLogOutput(db, {
            toolCallLogId: id,
            output: {
              resolution: "approved",
              note: note ?? null,
              ...result,
              ...(priorServerGate !== undefined
                ? { serverGate: priorServerGate }
                : {}),
            },
            approvedByUserId: userId,
          })
          return { id, resolution: "approved", result }
        },
      )
    } catch (e) {
      translateAccountingError(e)
    }
  }

  /**
   * Execute the stored held payload through the SAME domain path the original
   * endpoint would have used. The payload is re-validated against the original
   * request schema first — a stale row (schema moved on, or a redacted field)
   * must fail as 422, not crash the domain. `responsibleUserId` is the
   * APPROVER, not the original author.
   */
  private async executeStored(
    db: OrganizationBoundDb,
    ctx: { organizationId: string; workspaceId: string },
    toolName: string,
    input: unknown,
    approverUserId: string,
  ): Promise<Record<string, unknown>> {
    const STALE_MESSAGE =
      "The stored payload no longer validates against the current request schema"
    switch (toolName) {
      case "createAccountingEvent": {
        const parsed = CreateAccountingEventRequestSchema.safeParse(input)
        if (!parsed.success) throw new ValidationError(STALE_MESSAGE)
        // Strip the gate envelope (confidence/rationale/conversationId) AND the
        // [WP-D] evidence `signals` — neither is domain data. `signals` must NOT
        // reach `EventInput` (the cast is `as unknown`, so TS would not catch a
        // leak — this strip is load-bearing).
        const {
          confidence: _c,
          rationale: _r,
          conversationId: _cv,
          signals: _sig,
          ...fields
        } = parsed.data
        await lockPeriodInTx(db, ctx.organizationId, parsed.data.periodId)
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
        const parsed = CaptureAccountingDocumentRequestSchema.safeParse(input)
        if (!parsed.success) throw new ValidationError(STALE_MESSAGE)
        // Peel the gate envelope (confidence / rationale / conversationId /
        // [WP-D] signals / [WS-2] templateId / [#554] extractionMethod) — none is
        // domain data. `stripGateEnvelope` is the single source of truth shared
        // with the API capture controller and the web replay path, so all three
        // re-run paths hand `captureDocument` the exact same field set. The strip
        // is load-bearing: the cast to DocumentInput is `as unknown`, so TS cannot
        // catch a leaked gate field.
        const fields = stripGateEnvelope(parsed.data)
        await lockPeriodInTx(db, ctx.organizationId, parsed.data.periodId)
        // Capture, then book iff invoice type — the SAME capture-approve unit the
        // web approvals path uses (PR #712 / #715). Approving a captured invoice
        // via the API now lands the posting per event + its saldokonto obligation
        // instead of an orphaned capture, closing the drift where the web approve
        // booked and the API approve did not. Non-invoice vouchers capture only.
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
        const parsed = CreateAccountingPostingRequestSchema.safeParse(input)
        if (!parsed.success) throw new ValidationError(STALE_MESSAGE)
        const { kind, entry, openObligation } = parsed.data
        await lockPeriodInTx(
          db,
          ctx.organizationId,
          (entry as { periodId: string }).periodId,
        )
        const posting = await postPosting(db, ctx, {
          kind,
          entry: {
            ...(entry as Record<string, unknown>),
            responsibleUserId: approverUserId,
          },
          obligation: openObligation ?? null,
        } as unknown as PostWithObligationInput)
        return { postingId: posting.postingId, lineIds: posting.lineIds }
      }
      case "createAsset": {
        const parsed = CreateAssetRequestSchema.safeParse(input)
        if (!parsed.success) throw new ValidationError(STALE_MESSAGE)
        // periodId binds the proposal to a period (audit + close-blocking); not
        // domain data for the org-scoped card, peeled off before the insert.
        const { periodId, ...cardFields } = stripGateEnvelope(parsed.data) as {
          periodId: string
        } & Record<string, unknown>
        await lockPeriodInTx(db, ctx.organizationId, periodId)
        const asset = await createAsset(db, ctx, {
          ...cardFields,
          responsibleUserId: approverUserId,
        } as unknown as Parameters<typeof createAsset>[2])
        return {
          assetId: asset.id,
          designation: asset.designation,
          sequenceNumber: asset.sequenceNumber,
        }
      }
      case "createDepreciationPlan": {
        const parsed = CreateDepreciationPlanRequestSchema.safeParse(input)
        if (!parsed.success) throw new ValidationError(STALE_MESSAGE)
        const { periodId, ...planFields } = stripGateEnvelope(parsed.data) as {
          periodId: string
        } & Record<string, unknown>
        await lockPeriodInTx(db, ctx.organizationId, periodId)
        const planId = await createDepreciationPlan(
          db,
          ctx,
          planFields as unknown as Parameters<typeof createDepreciationPlan>[2],
        )
        return { depreciationPlanId: planId }
      }
      case "createInventoryCount": {
        const parsed = CreateInventoryCountRequestSchema.safeParse(input)
        if (!parsed.success) throw new ValidationError(STALE_MESSAGE)
        const { periodId, ...countFields } = stripGateEnvelope(parsed.data) as {
          periodId: string
        } & Record<string, unknown>
        await lockPeriodInTx(db, ctx.organizationId, periodId)
        const count = await createInventoryCount(
          db,
          ctx,
          countFields as unknown as Parameters<typeof createInventoryCount>[2],
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
}
