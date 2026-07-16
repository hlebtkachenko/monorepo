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
  sql,
  unconfirmTemplateOnReject,
  updateToolCallLogOutput,
  withOrganization,
} from "@workspace/db"
import { tool_call_log } from "@workspace/db/schema"
import { executeHeldWrite, mintInboxItem } from "@workspace/accounting"
import {
  INBOX_STAMPED_OPERATION_IDS,
  type ListHeldWritesResponse,
  type ResolveHeldWriteResponse,
} from "@workspace/shared/api"
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
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
              // [Tier 4] provenance for the inbox_item minted at approve.
              actor_kind: tool_call_log.actor_kind,
              rationale: tool_call_log.rationale,
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

          // [Tier 4] Mint the provenance record for this landed proposal and
          // thread its id onto the ctx, so every row executeStored INSERTs carries
          // inbox_id ("Created by Agent"). Same withOrganization tx (sets
          // app.workspace_id) → the workspace-scoped inbox_item insert resolves;
          // atomic with the landing; FOR-UPDATE guard above makes it single-mint.
          // Gated on actor_kind so a HUMAN-authored held write leaves inbox_id NULL
          // — the read-model filter then means exactly "agent-originated". Also
          // gated on the op: only the ledger-fact ops land rows with an inbox_id
          // column, so a register-card creator mints no orphan inbox_item.
          const inboxId =
            row.actor_kind !== "human" &&
            (INBOX_STAMPED_OPERATION_IDS as readonly string[]).includes(
              row.tool_name,
            )
              ? await mintInboxItem(
                  db,
                  {
                    organizationId: principal.organizationId,
                    workspaceId: principal.workspaceId,
                  },
                  {
                    toolCallLogId: id,
                    kind: row.tool_name,
                    createdBy: row.actor_kind,
                    source: "agent",
                    reasoning: row.rationale,
                  },
                )
              : null
          const result = await executeHeldWrite(
            db,
            {
              organizationId: principal.organizationId,
              workspaceId: principal.workspaceId,
              inboxId,
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
}
