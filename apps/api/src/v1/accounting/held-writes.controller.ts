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
  updateToolCallLogOutput,
  withOrganization,
  type OrganizationBoundDb,
} from "@workspace/db"
import { tool_call_log } from "@workspace/db/schema"
import {
  captureDocument,
  createEvent,
  post as postPosting,
  type DocumentInput,
  type EventInput,
  type PostInput,
} from "@workspace/accounting"
import {
  CaptureAccountingDocumentRequestSchema,
  CreateAccountingEventRequestSchema,
  CreateAccountingPostingRequestSchema,
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

          if (action === "reject") {
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
            output: { resolution: "approved", note: note ?? null, ...result },
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
        // Same strip as events: the gate envelope + [WP-D] `signals` are not
        // domain data. The `signals` strip is load-bearing (the cast to
        // DocumentInput is `as unknown`, so TS cannot catch a leak).
        const {
          confidence: _c,
          rationale: _r,
          conversationId: _cv,
          signals: _sig,
          ...fields
        } = parsed.data
        await lockPeriodInTx(db, ctx.organizationId, parsed.data.periodId)
        const doc = await captureDocument(
          db,
          ctx,
          fields as unknown as DocumentInput,
        )
        return {
          summaryRecordId: doc.summaryRecordId,
          designation: doc.designation,
          sequenceNumber: doc.sequenceNumber,
          lines: doc.lines,
        }
      }
      case "createAccountingPosting": {
        const parsed = CreateAccountingPostingRequestSchema.safeParse(input)
        if (!parsed.success) throw new ValidationError(STALE_MESSAGE)
        const { kind, entry } = parsed.data
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
        } as unknown as PostInput)
        return { postingId: posting.postingId, lineIds: posting.lineIds }
      }
      default:
        throw new ValidationError(
          `Held write targets an unknown operation "${toolName}" and cannot be approved`,
        )
    }
  }
}
