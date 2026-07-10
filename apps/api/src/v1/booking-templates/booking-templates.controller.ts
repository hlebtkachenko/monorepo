import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common"
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger"
import type {
  BookingTemplate,
  BookingTemplateResponse,
  ListBookingTemplatesResponse,
  MatchBookingTemplateResponse,
} from "@workspace/shared/api"
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@workspace/shared/errors"
import type { ApiKeyPrincipal } from "@workspace/auth/api-key-verifier"
import { and, eq, isNotNull, sql, withWorkspace } from "@workspace/db"
import { booking_template } from "@workspace/db/schema"
import {
  matchBookingTemplate,
  type BookingSignature,
  type ConfirmedBookingTemplate,
} from "@workspace/accounting"

import { ApiKeyGuard } from "../../auth/api-key.guard"
import { CurrentPrincipal } from "../../auth/principal.decorator"
import { RequireHumanActor } from "../../auth/require-human-actor.decorator"
import { RequireScopes } from "../../auth/require-scopes.decorator"
import {
  BookingTemplateResponseDto,
  CreateBookingTemplateRequestDto,
  ListBookingTemplatesQueryDto,
  ListBookingTemplatesResponseDto,
  MatchBookingTemplateRequestDto,
  MatchBookingTemplateResponseDto,
} from "../dto"

/**
 * `/v1/booking-templates` — the workspace-shared Brain booking-template
 * library (M2.1, ADR-0029, constitution §I9 amendment). A thin seam: read the
 * principal from the API-key guard, run a direct Drizzle query inside
 * `withWorkspace` (FORCE RLS on `workspace_id`), and map the snake_case row to
 * the camelCase public schema. WORKSPACE-scoped, NOT organization-scoped: a
 * recurring counterparty relationship is a workspace fact shared across every
 * client book.
 *
 * `humanConfirmedAt` is the single trust gate, mirroring `OcrTemplatesController`
 * exactly: create/refine leave it null, and only a HUMAN-actor key may set it
 * via the confirm endpoint (`@RequireHumanActor()`). `match` is a PURE READ —
 * it never mutates a row and never calls a write tool. A match only returns
 * the confirmed treatment for the CALLER to feed into the normal
 * `create_accounting_event` / `create_accounting_posting` write path, which is
 * unchanged: every proposed write, templated or not, still runs through
 * `runGatedWrite` and is still HELD at cold start.
 */
interface TemplateRow {
  id: string
  counterpartyKey: string
  direction: string
  supplyKind: string
  jurisdiction: string
  confirmedDecision: unknown
  humanConfirmedAt: Date | null
  matchCount: number
  heldCount: number
  lastRejectAt: Date | null
  version: number
  learnedAt: Date
  provenance: unknown
  createdAt: Date
  updatedAt: Date
}

@ApiTags("Booking Templates")
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller({ path: "booking-templates", version: "1" })
export class BookingTemplatesController {
  /** Maps a projected `booking_template` row to the public shape. */
  private toTemplate(r: TemplateRow): BookingTemplate {
    return {
      id: r.id,
      counterpartyKey: r.counterpartyKey,
      direction: r.direction as BookingTemplate["direction"],
      supplyKind: r.supplyKind as BookingTemplate["supplyKind"],
      jurisdiction: r.jurisdiction as BookingTemplate["jurisdiction"],
      confirmedDecision:
        r.confirmedDecision as BookingTemplate["confirmedDecision"],
      humanConfirmedAt: r.humanConfirmedAt?.toISOString() ?? null,
      matchCount: r.matchCount,
      heldCount: r.heldCount,
      lastRejectAt: r.lastRejectAt?.toISOString() ?? null,
      version: r.version,
      learnedAt: r.learnedAt.toISOString(),
      provenance: (r.provenance as Record<string, unknown> | null) ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }
  }

  private readonly projection = {
    id: booking_template.id,
    counterpartyKey: booking_template.counterparty_key,
    direction: booking_template.direction,
    supplyKind: booking_template.supply_kind,
    jurisdiction: booking_template.jurisdiction,
    confirmedDecision: booking_template.confirmed_decision,
    humanConfirmedAt: booking_template.human_confirmed_at,
    matchCount: booking_template.match_count,
    heldCount: booking_template.held_count,
    lastRejectAt: booking_template.last_reject_at,
    version: booking_template.version,
    learnedAt: booking_template.learned_at,
    provenance: booking_template.provenance,
    createdAt: booking_template.created_at,
    updatedAt: booking_template.updated_at,
  } as const

  /** Mirrors the OCR-templates controller: both actor kinds are user-bound; a service key is rejected. */
  private requireUser(principal: ApiKeyPrincipal): string {
    if (principal.userId === null) {
      throw new ForbiddenError(
        "Booking template operations require a user-bound API key",
      )
    }
    return principal.userId
  }

  @Get()
  @ApiOperation({
    summary: "List booking templates",
    description:
      "Returns the workspace's booking templates, optionally filtered by " +
      "counterpartyKey. Workspace-scoped (FORCE RLS).",
  })
  @ApiQuery({ name: "counterpartyKey", required: false })
  @ApiOkResponse({ type: ListBookingTemplatesResponseDto })
  async list(
    @Query() query: ListBookingTemplatesQueryDto,
    @CurrentPrincipal() principal: ApiKeyPrincipal,
  ): Promise<ListBookingTemplatesResponse> {
    const userId = this.requireUser(principal)
    const { counterpartyKey } = query
    const rows = await withWorkspace(principal.workspaceId, userId, (db) =>
      db
        .select(this.projection)
        .from(booking_template)
        .where(
          counterpartyKey
            ? eq(booking_template.counterparty_key, counterpartyKey)
            : undefined,
        )
        .orderBy(
          booking_template.counterparty_key,
          booking_template.direction,
          booking_template.supply_kind,
          booking_template.jurisdiction,
        ),
    )
    return { templates: rows.map((r) => this.toTemplate(r)) }
  }

  @Post()
  @HttpCode(201)
  @RequireScopes("accounting:write")
  @ApiOperation({
    summary: "Create a booking template",
    description:
      "Creates a NEW, UNCONFIRMED booking template. The server pins " +
      "humanConfirmedAt to null and matchCount/heldCount to 0 — a draft is " +
      "NEVER matchable until a human confirms it. Agent keys may create " +
      "(the draft itself carries no write authority). Requires the " +
      "accounting:write scope.",
  })
  @ApiCreatedResponse({ type: BookingTemplateResponseDto })
  async create(
    @Body() body: CreateBookingTemplateRequestDto,
    @CurrentPrincipal() principal: ApiKeyPrincipal,
  ): Promise<BookingTemplateResponse> {
    const userId = this.requireUser(principal)
    const {
      counterpartyKey,
      direction,
      supplyKind,
      jurisdiction,
      confirmedDecision,
      provenance,
    } = body
    const row = await withWorkspace(
      principal.workspaceId,
      userId,
      async (db) => {
        const rows = await db
          .insert(booking_template)
          .values({
            workspace_id: principal.workspaceId,
            counterparty_key: counterpartyKey,
            direction,
            supply_kind: supplyKind,
            jurisdiction,
            confirmed_decision: confirmedDecision,
            provenance: provenance ?? null,
            // Trust fields are server-pinned, never client-settable.
            human_confirmed_at: null,
            match_count: 0,
            held_count: 0,
            version: 1,
          })
          .returning(this.projection)
        return rows[0] ?? null
      },
    )
    if (!row) throw new NotFoundError("Booking template not found")
    return { template: this.toTemplate(row) }
  }

  @Post(":id/confirm")
  @HttpCode(200)
  @RequireScopes("accounting:write")
  // [§I9 amendment] Confirmation is the HUMAN trust boundary a booking template
  // must cross before it is ever matchable: an agent-actor key is rejected with
  // 403 (enforced by ApiKeyGuard), mirroring `confirm_ocr_template` exactly.
  @RequireHumanActor()
  @ApiOperation({
    summary: "Confirm a booking template",
    description:
      "Marks a booking template as human-confirmed (sets humanConfirmedAt to " +
      "now) — the ONLY way it becomes matchable. HUMAN-ACTOR ONLY: an " +
      "agent-actor key is rejected with 403. 409 when the workspace already " +
      "has a confirmed template for the same signature.",
  })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiOkResponse({ type: BookingTemplateResponseDto })
  async confirm(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentPrincipal() principal: ApiKeyPrincipal,
  ): Promise<BookingTemplateResponse> {
    const userId = this.requireUser(principal)
    const row = await withWorkspace(
      principal.workspaceId,
      userId,
      async (db) => {
        try {
          const rows = await db
            .update(booking_template)
            .set({ human_confirmed_at: sql`now()`, updated_at: sql`now()` })
            .where(eq(booking_template.id, id))
            .returning(this.projection)
          return rows[0] ?? null
        } catch (e) {
          const err = e as { code?: string; cause?: { code?: string } }
          if ((err.code ?? err.cause?.code) === "23505") {
            throw new ConflictError(
              "The workspace already has a confirmed booking template for this signature",
            )
          }
          throw e
        }
      },
    )
    if (!row) throw new NotFoundError("Booking template not found")
    return { template: this.toTemplate(row) }
  }

  // ⚠ The signature is COARSE — counterparty/direction/supplyKind/jurisdiction
  // only. It is NOT the full `classifyEvent` input (which takes no counterparty
  // and also keys on vatRate / isCreditNote / §92 commodityCode / deferral).
  // A match therefore identifies the recurring RELATIONSHIP, not an identical
  // booking: the FUTURE match-integration MUST re-derive the amount/document-
  // driven fields (vatRate, credit-note sign, commodityCode, deferral) from the
  // ACTUAL document and MUST NOT freeze them from the template's confirmedDecision
  // — else a coarse match would propose a wrong rate/sign/commodity (still HELD
  // today, but a degraded proposal). This endpoint only READS + returns the
  // scaffold; nothing here books, and every downstream write stays gated + HELD.
  @Post("match")
  @HttpCode(200)
  @ApiOperation({
    summary: "Match a case signature against confirmed booking templates",
    description:
      "Pure read: given a COARSE case signature (counterparty/direction/" +
      "supplyKind/jurisdiction — NOT the full classify input), returns the " +
      "workspace's matching CONFIRMED booking template, or null. No mutation, " +
      "no write-tool call. The caller must re-derive amount/document-driven " +
      "fields (rate, sign, commodity, deferral) from the actual document.",
  })
  @ApiOkResponse({ type: MatchBookingTemplateResponseDto })
  async match(
    @Body() body: MatchBookingTemplateRequestDto,
    @CurrentPrincipal() principal: ApiKeyPrincipal,
  ): Promise<MatchBookingTemplateResponse> {
    const userId = this.requireUser(principal)
    const signature: BookingSignature = {
      counterpartyKey: body.counterpartyKey,
      direction: body.direction,
      supplyKind: body.supplyKind,
      jurisdiction: body.jurisdiction,
    }
    const rows = await withWorkspace(principal.workspaceId, userId, (db) =>
      db
        .select(this.projection)
        .from(booking_template)
        .where(
          and(
            // The trust gate is enforced at BOTH boundaries: this SQL
            // `human_confirmed_at IS NOT NULL` (so a DRAFT never leaves the
            // DB) AND the domain `matchBookingTemplate` (which re-checks
            // `humanConfirmedAt !== null`). Belt-and-suspenders: a future
            // refactor that drops either filter still cannot surface a draft
            // — and migration 0054's "match query filters on
            // human_confirmed_at IS NOT NULL" comment is now literally true.
            isNotNull(booking_template.human_confirmed_at),
            eq(booking_template.counterparty_key, signature.counterpartyKey),
            eq(booking_template.direction, signature.direction),
            eq(booking_template.supply_kind, signature.supplyKind),
            eq(booking_template.jurisdiction, signature.jurisdiction),
          ),
        ),
    )
    const candidates: ConfirmedBookingTemplate[] = rows.map((r) => ({
      id: r.id,
      counterpartyKey: r.counterpartyKey,
      direction: r.direction as BookingSignature["direction"],
      supplyKind: r.supplyKind as BookingSignature["supplyKind"],
      jurisdiction: r.jurisdiction as BookingSignature["jurisdiction"],
      confirmedDecision:
        r.confirmedDecision as ConfirmedBookingTemplate["confirmedDecision"],
      humanConfirmedAt: r.humanConfirmedAt?.toISOString() ?? null,
    }))
    const match = matchBookingTemplate(signature, candidates)
    if (!match) return { template: null }
    const full = rows.find((r) => r.id === match.id)
    // `full` always exists: `match` is drawn from `candidates`, which is
    // derived 1:1 from `rows` by id.
    return { template: this.toTemplate(full!) }
  }
}
