import { Body, Controller, Headers, Post, Res, UseGuards } from "@nestjs/common"
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger"
import type { Response } from "express"
import type { ApiKeyPrincipal } from "@workspace/auth/api-key-verifier"
import {
  captureDocument,
  createEvent,
  post as postPosting,
  type CapturedDocument,
  type CapturedEvent,
  type DocumentInput,
  type EventInput,
  type PostInput,
  type PostedPosting,
} from "@workspace/accounting"

import { ApiKeyGuard } from "../../auth/api-key.guard"
import { CurrentPrincipal } from "../../auth/principal.decorator"
import { RequireScopes } from "../../auth/require-scopes.decorator"
import {
  CaptureAccountingDocumentRequestDto,
  CaptureAccountingDocumentResponseDto,
  CreateAccountingEventRequestDto,
  CreateAccountingEventResponseDto,
  CreateAccountingPostingRequestDto,
  CreateAccountingPostingResponseDto,
} from "../dto"
import {
  deriveCaptureVeto,
  derivePostingVeto,
  screenTemplateNovelty,
} from "./accounting-veto"
import type { EvidenceEnvelope } from "./evidence-gate"
import { runGatedWrite, type GatedWriteResult } from "./accounting-writes.gate"

const IDEMPOTENCY_HEADER = {
  name: "Idempotency-Key",
  required: true,
  description:
    "Client-generated key (1–255 chars); one per write intent, reused on retry.",
}

/**
 * `POST /v1/accounting/{events,documents,postings}` — the mutation surface the
 * Afframe Brain drives. Each write runs through `runGatedWrite`: idempotency
 * (via `tool_call_log`) + a confidence/amount hold, in one `withOrganization`
 * transaction. Tenant (`organizationId`/`workspaceId`) and the responsible user
 * come ONLY from the API-key principal — never the body. Below the confidence
 * threshold (or above the always-hold amount) the write is HELD (202) for human
 * review instead of applied (201).
 */
@ApiTags("Accounting")
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller({ path: "accounting", version: "1" })
export class AccountingWritesController {
  private send(res: Response, r: GatedWriteResult): Record<string, unknown> {
    res.status(r.httpStatus)
    if (r.replayed) res.setHeader("Idempotent-Replayed", "true")
    return r.body
  }

  @Post("events")
  @RequireScopes("accounting:write")
  @ApiOperation({
    summary: "Create an accounting event (case)",
    description:
      "Applies (201) or holds for review (202). Tenant + responsible user " +
      "injected from the principal.",
  })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiResponse({ status: 201, type: CreateAccountingEventResponseDto })
  @ApiResponse({ status: 202, type: CreateAccountingEventResponseDto })
  async createEvent(
    @Body() body: CreateAccountingEventRequestDto,
    @CurrentPrincipal() principal: ApiKeyPrincipal,
    @Res({ passthrough: true }) res: Response,
    @Headers("idempotency-key") idempotencyKey?: string,
  ): Promise<Record<string, unknown>> {
    const { confidence, rationale, conversationId, signals, ...fields } =
      body as unknown as CreateAccountingEventRequestDto & {
        confidence: number
        rationale: string
        conversationId?: string
        signals?: EvidenceEnvelope | null
      }
    const result = await runGatedWrite<CapturedEvent>({
      principal,
      idempotencyKey,
      operationId: "createAccountingEvent",
      body,
      periodId: fields.periodId,
      confidence,
      rationale,
      conversationId,
      signals,
      holdAmounts: [],
      run: (db, ctx) =>
        createEvent(db, ctx, {
          ...fields,
          responsibleUserId: principal.userId as string,
        } as unknown as EventInput),
      applied: (ev) => ({
        eventId: ev.eventId,
        designation: ev.designation,
        sequenceNumber: ev.sequenceNumber,
      }),
    })
    return this.send(res, result)
  }

  @Post("documents")
  @RequireScopes("accounting:write")
  @ApiOperation({
    summary: "Capture a summary document (doklad)",
    description:
      "Applies (201) or holds (202). Tenant injected from principal.",
  })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiResponse({ status: 201, type: CaptureAccountingDocumentResponseDto })
  @ApiResponse({ status: 202, type: CaptureAccountingDocumentResponseDto })
  async captureDocument(
    @Body() body: CaptureAccountingDocumentRequestDto,
    @CurrentPrincipal() principal: ApiKeyPrincipal,
    @Res({ passthrough: true }) res: Response,
    @Headers("idempotency-key") idempotencyKey?: string,
  ): Promise<Record<string, unknown>> {
    const {
      confidence,
      rationale,
      conversationId,
      signals,
      templateId,
      ...fields
    } = body as unknown as CaptureAccountingDocumentRequestDto & {
      confidence: number
      rationale: string
      conversationId?: string
      signals?: EvidenceEnvelope | null
      templateId?: string | null
    }
    // The always-hold gate compares against a CZK ceiling, so each partial's
    // transaction-currency amount must be converted to accounting currency via
    // its own fx rate before it is tested (a large FX partial otherwise slips
    // under the ceiling and evades the hold). Rounding is already accounting
    // currency; posting amounts elsewhere are already accounting currency too.
    // Float `Number()` math is fine here: this feeds the coarse screening
    // ceiling only, never a booked amount (booked amounts use string-math).
    const toAccountingCurrency = (p: {
      baseAmount: string
      fxRate?: string | null
      vatAmount?: string | null
      vatFxRate?: string | null
    }): string[] => {
      const baseCzk =
        p.fxRate != null
          ? String(Number(p.baseAmount) * Number(p.fxRate))
          : p.baseAmount
      if (p.vatAmount == null) return [baseCzk]
      const vatRate = p.vatFxRate ?? p.fxRate
      const vatCzk =
        vatRate != null
          ? String(Number(p.vatAmount) * Number(vatRate))
          : p.vatAmount
      return [baseCzk, vatCzk]
    }
    const holdAmounts = [
      ...(fields.lines ?? []).flatMap((l) =>
        (l.partials ?? []).flatMap(toAccountingCurrency),
      ),
      ...(fields.roundingAmount != null ? [fields.roundingAmount] : []),
    ]
    const result = await runGatedWrite<CapturedDocument>({
      principal,
      idempotencyKey,
      operationId: "captureAccountingDocument",
      body,
      periodId: fields.periodId,
      confidence,
      rationale,
      conversationId,
      signals,
      // [WS-2] The OCR template this capture was derived from (null for
      // structured-export captures). NOT domain data — destructured out of
      // `fields` above so it never reaches `captureDocument`; persisted only
      // with the gated write's audit `serverGate`.
      templateId: templateId ?? null,
      holdAmounts,
      deriveVeto: () =>
        Promise.resolve(
          deriveCaptureVeto(
            (fields.lines ?? []) as ReadonlyArray<Record<string, unknown>>,
          ),
        ),
      // [WS-2] Server-derived template-novelty screen. The gate runs it in-tx only
      // for an AGENT key with a `templateId` present (both re-checked gate-side);
      // an UNCONFIRMED template forces the score sub-green (`novel_template`).
      screenTemplateNovelty:
        templateId != null
          ? (db) => screenTemplateNovelty(db, templateId)
          : undefined,
      run: (db, ctx) =>
        captureDocument(db, ctx, fields as unknown as DocumentInput),
      applied: (doc) => ({
        summaryRecordId: doc.summaryRecordId,
        designation: doc.designation,
        sequenceNumber: doc.sequenceNumber,
        lines: doc.lines,
      }),
    })
    return this.send(res, result)
  }

  @Post("postings")
  @RequireScopes("accounting:write")
  @ApiOperation({
    summary: "Post a posting (zaúčtování)",
    description: "Applies (201) or holds (202). Tenant + user injected.",
  })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiResponse({ status: 201, type: CreateAccountingPostingResponseDto })
  @ApiResponse({ status: 202, type: CreateAccountingPostingResponseDto })
  async createPosting(
    @Body() body: CreateAccountingPostingRequestDto,
    @CurrentPrincipal() principal: ApiKeyPrincipal,
    @Res({ passthrough: true }) res: Response,
    @Headers("idempotency-key") idempotencyKey?: string,
  ): Promise<Record<string, unknown>> {
    const { confidence, rationale, conversationId, signals, kind, entry } =
      body as unknown as CreateAccountingPostingRequestDto & {
        confidence: number
        rationale: string
        conversationId?: string
        signals?: EvidenceEnvelope | null
      }
    const holdAmounts = (
      (entry as { lines?: Array<{ amount: string }> }).lines ?? []
    ).map((l) => l.amount)
    const result = await runGatedWrite<PostedPosting>({
      principal,
      idempotencyKey,
      operationId: "createAccountingPosting",
      body,
      periodId: (entry as { periodId: string }).periodId,
      confidence,
      rationale,
      conversationId,
      signals,
      holdAmounts,
      deriveVeto: (db) =>
        derivePostingVeto(db, principal.organizationId, kind, entry),
      run: (db, ctx) =>
        postPosting(db, ctx, {
          kind,
          entry: {
            ...(entry as Record<string, unknown>),
            responsibleUserId: principal.userId as string,
          },
        } as unknown as PostInput),
      applied: (p) => ({ postingId: p.postingId, lineIds: p.lineIds }),
    })
    return this.send(res, result)
  }
}
