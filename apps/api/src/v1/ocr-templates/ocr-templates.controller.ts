import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
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
  ListOcrTemplatesResponse,
  OcrTemplate,
  OcrTemplateResponse,
} from "@workspace/shared/api"
import { ForbiddenError, NotFoundError } from "@workspace/shared/errors"
import type { ApiKeyPrincipal } from "@workspace/auth/api-key-verifier"
import { and, eq, sql, withWorkspace } from "@workspace/db"
import { ocr_extraction_template } from "@workspace/db/schema"

import { ApiKeyGuard } from "../../auth/api-key.guard"
import { CurrentPrincipal } from "../../auth/principal.decorator"
import { RequireHumanActor } from "../../auth/require-human-actor.decorator"
import { RequireScopes } from "../../auth/require-scopes.decorator"
import {
  CreateOcrTemplateRequestDto,
  ListOcrTemplatesQueryDto,
  ListOcrTemplatesResponseDto,
  OcrTemplateResponseDto,
  UpdateOcrTemplateRequestDto,
} from "../dto"

/**
 * `/v1/ocr-templates` — the workspace-shared Brain OCR template library
 * (ADR-0029 "Brain learned state is workspace-scoped"). A thin seam: read the
 * principal from the API-key guard, run a direct Drizzle query inside
 * `withWorkspace` (FORCE RLS on `workspace_id`), and map the snake_case row to
 * the camelCase public schema. WORKSPACE-scoped, NOT organization-scoped: a
 * supplier's invoice layout is a workspace fact shared across every client book.
 *
 * The tenant (`workspaceId` / `userId`) comes ONLY from the authenticated
 * principal; it is never accepted as request input. RLS makes a cross-workspace
 * row invisible, so a foreign template surfaces as 404 (never 403).
 *
 * `human_confirmed_at` is the single trust gate: create/refine leave it null,
 * and only a HUMAN-actor key may set it via the confirm endpoint
 * (`@RequireHumanActor()` on that method — an agent key is 403).
 */
/**
 * The projected `ocr_extraction_template` row this controller reads. The
 * Drizzle `timestamp` columns yield `Date` (never a string), so the mapper below
 * only ever calls `.toISOString()` + a null passthrough — no `Date | string`
 * coercion is needed.
 */
interface TemplateRow {
  id: string
  supplierKey: string
  docKind: string
  locators: unknown
  layoutFingerprint: string | null
  humanConfirmedAt: Date | null
  heldCount: number
  lastRejectAt: Date | null
  version: number
  learnedAt: Date
  provenance: unknown
  createdAt: Date
  updatedAt: Date
}

@ApiTags("OCR Templates")
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller({ path: "ocr-templates", version: "1" })
export class OcrTemplatesController {
  /** Maps a projected `ocr_extraction_template` row to the public shape. */
  private toTemplate(r: TemplateRow): OcrTemplate {
    return {
      id: r.id,
      supplierKey: r.supplierKey,
      docKind: r.docKind,
      locators: r.locators as Record<string, unknown>,
      layoutFingerprint: r.layoutFingerprint,
      humanConfirmedAt: r.humanConfirmedAt?.toISOString() ?? null,
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
    id: ocr_extraction_template.id,
    supplierKey: ocr_extraction_template.supplier_key,
    docKind: ocr_extraction_template.doc_kind,
    locators: ocr_extraction_template.locators,
    layoutFingerprint: ocr_extraction_template.layout_fingerprint,
    humanConfirmedAt: ocr_extraction_template.human_confirmed_at,
    heldCount: ocr_extraction_template.held_count,
    lastRejectAt: ocr_extraction_template.last_reject_at,
    version: ocr_extraction_template.version,
    learnedAt: ocr_extraction_template.learned_at,
    provenance: ocr_extraction_template.provenance,
    createdAt: ocr_extraction_template.created_at,
    updatedAt: ocr_extraction_template.updated_at,
  } as const

  /**
   * The `app.user_id` GUC that `withWorkspace` sets is used for audit only (the
   * 0047 RLS policies key solely off `app.workspace_id`). Both human and agent
   * keys are user-bound; a service key with no bound user is rejected — mirrors
   * the accounting-writes gate.
   */
  private requireUser(principal: ApiKeyPrincipal): string {
    if (principal.userId === null) {
      throw new ForbiddenError(
        "OCR template operations require a user-bound API key",
      )
    }
    return principal.userId
  }

  @Get()
  @ApiOperation({
    summary: "List OCR extraction templates",
    description:
      "Returns the workspace's OCR extraction templates, optionally filtered " +
      "by supplierKey and docKind. Workspace-scoped (FORCE RLS).",
  })
  @ApiQuery({ name: "supplierKey", required: false })
  @ApiQuery({ name: "docKind", required: false })
  @ApiOkResponse({ type: ListOcrTemplatesResponseDto })
  async list(
    @Query() query: ListOcrTemplatesQueryDto,
    @CurrentPrincipal() principal: ApiKeyPrincipal,
  ): Promise<ListOcrTemplatesResponse> {
    const userId = this.requireUser(principal)
    const { supplierKey, docKind } = query
    const filters = [
      supplierKey
        ? eq(ocr_extraction_template.supplier_key, supplierKey)
        : undefined,
      docKind ? eq(ocr_extraction_template.doc_kind, docKind) : undefined,
    ].filter((f): f is NonNullable<typeof f> => f !== undefined)

    const rows = await withWorkspace(principal.workspaceId, userId, (db) =>
      db
        .select(this.projection)
        .from(ocr_extraction_template)
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(
          ocr_extraction_template.supplier_key,
          ocr_extraction_template.doc_kind,
        ),
    )
    return { templates: rows.map((r) => this.toTemplate(r)) }
  }

  @Post()
  @HttpCode(201)
  @RequireScopes("accounting:write")
  @ApiOperation({
    summary: "Create an OCR extraction template",
    description:
      "Creates a NEW, UNCONFIRMED template. The server pins humanConfirmedAt " +
      "to null, heldCount to 0, and version to 1. Agent keys may create. " +
      "Requires the accounting:write scope.",
  })
  @ApiCreatedResponse({ type: OcrTemplateResponseDto })
  async create(
    @Body() body: CreateOcrTemplateRequestDto,
    @CurrentPrincipal() principal: ApiKeyPrincipal,
  ): Promise<OcrTemplateResponse> {
    const userId = this.requireUser(principal)
    const { supplierKey, docKind, locators, layoutFingerprint, provenance } =
      body
    const row = await withWorkspace(
      principal.workspaceId,
      userId,
      async (db) => {
        const rows = await db
          .insert(ocr_extraction_template)
          .values({
            workspace_id: principal.workspaceId,
            supplier_key: supplierKey,
            doc_kind: docKind,
            locators,
            layout_fingerprint: layoutFingerprint ?? null,
            provenance: provenance ?? null,
            // Trust fields are server-pinned, never client-settable.
            human_confirmed_at: null,
            held_count: 0,
            version: 1,
          })
          .returning(this.projection)
        return rows[0] ?? null
      },
    )
    // `insert ... returning` always yields the inserted row; the guard is a
    // type narrowing, not a reachable branch.
    if (!row) throw new NotFoundError("OCR template not found")
    return { template: this.toTemplate(row) }
  }

  @Put(":id")
  @RequireScopes("accounting:write")
  @ApiOperation({
    summary: "Refine an OCR extraction template",
    description:
      "Replaces the learned fields of a template. A refine RE-OPENS the trust " +
      "gate: humanConfirmedAt is reset to null and version is bumped. Identity " +
      "(supplierKey / docKind) is immutable here. Agent keys may refine. " +
      "Requires the accounting:write scope.",
  })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiOkResponse({ type: OcrTemplateResponseDto })
  async update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: UpdateOcrTemplateRequestDto,
    @CurrentPrincipal() principal: ApiKeyPrincipal,
  ): Promise<OcrTemplateResponse> {
    const userId = this.requireUser(principal)
    const { locators, layoutFingerprint, provenance } = body
    const patch: Record<string, unknown> = {
      // A refine always re-opens the trust gate and bumps the version.
      human_confirmed_at: null,
      version: sql`${ocr_extraction_template.version} + 1`,
      updated_at: sql`now()`,
    }
    if (locators !== undefined) patch.locators = locators
    if (layoutFingerprint !== undefined)
      patch.layout_fingerprint = layoutFingerprint
    if (provenance !== undefined) patch.provenance = provenance

    const row = await withWorkspace(
      principal.workspaceId,
      userId,
      async (db) => {
        const rows = await db
          .update(ocr_extraction_template)
          .set(patch)
          .where(eq(ocr_extraction_template.id, id))
          .returning(this.projection)
        return rows[0] ?? null
      },
    )
    if (!row) throw new NotFoundError("OCR template not found")
    return { template: this.toTemplate(row) }
  }

  @Post(":id/confirm")
  @HttpCode(200)
  @RequireScopes("accounting:write")
  // [WS-5] Confirmation is the trust boundary a HUMAN must cross, not the Brain:
  // an agent-actor key is rejected with 403 (enforced by ApiKeyGuard). The
  // accounting:write scope (like the other write endpoints) additionally blocks a
  // read-only human key from confirming a template.
  @RequireHumanActor()
  @ApiOperation({
    summary: "Confirm an OCR extraction template",
    description:
      "Marks a template as human-confirmed (sets humanConfirmedAt to now). " +
      "HUMAN-ACTOR ONLY: an agent-actor key is rejected with 403.",
  })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiOkResponse({ type: OcrTemplateResponseDto })
  async confirm(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentPrincipal() principal: ApiKeyPrincipal,
  ): Promise<OcrTemplateResponse> {
    const userId = this.requireUser(principal)
    const row = await withWorkspace(
      principal.workspaceId,
      userId,
      async (db) => {
        const rows = await db
          .update(ocr_extraction_template)
          .set({ human_confirmed_at: sql`now()`, updated_at: sql`now()` })
          .where(eq(ocr_extraction_template.id, id))
          .returning(this.projection)
        return rows[0] ?? null
      },
    )
    if (!row) throw new NotFoundError("OCR template not found")
    return { template: this.toTemplate(row) }
  }
}
