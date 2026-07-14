import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from "@nestjs/common"
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger"
import type {
  Document,
  DocumentDownloadUrlResponse,
  ListDocumentsResponse,
} from "@workspace/shared/api"
import { ForbiddenError, NotFoundError } from "@workspace/shared/errors"
import type { ApiKeyPrincipal } from "@workspace/auth/api-key-verifier"
import { desc, eq, isNull, withWorkspace } from "@workspace/db"
import { inbox_attachment } from "@workspace/db/schema"
import {
  DOCUMENT_PREVIEW_TTL_SECONDS,
  S3DocumentStore,
} from "@workspace/storage"

import { ApiKeyGuard } from "../../auth/api-key.guard"
import { CurrentPrincipal } from "../../auth/principal.decorator"
import {
  DocumentDownloadUrlResponseDto,
  ListDocumentsQueryDto,
  ListDocumentsResponseDto,
} from "../dto"

/** Lazy singleton — construction throws if DOCUMENTS_BUCKET is unset, so defer
 *  it to first use (never at module load / test import). */
let documentStore: S3DocumentStore | undefined
function getStore(): S3DocumentStore {
  documentStore ??= new S3DocumentStore()
  return documentStore
}

interface DocumentRow {
  id: string
  filename: string
  contentType: string
  size: number
  sha256: string
  deletedAt: Date | null
  confirmedAt: Date
  createdAt: Date
  updatedAt: Date
}

/**
 * `/v1/documents` — the READ / RETRIEVE twin of the web document routes. A thin
 * seam: read the principal from the API-key guard, query `inbox_attachment`
 * inside `withWorkspace` (FORCE RLS on `workspace_id`), and map the snake_case
 * row to the camelCase public schema. WORKSPACE-scoped, NOT organization-scoped
 * (a received file precedes org filing; ADR-0029).
 *
 * The tenant (`workspaceId` / `userId`) comes ONLY from the authenticated
 * principal; it is never accepted as input. RLS makes a cross-workspace row
 * invisible, so a foreign document surfaces as 404, never 403. Bytes are fetched
 * DIRECT from S3 via a short-lived presigned URL — never proxied through the API.
 *
 * The internal S3 object key is never exposed; callers address a document by id.
 */
@ApiTags("Documents")
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller({ path: "documents", version: "1" })
export class DocumentsController {
  private readonly projection = {
    id: inbox_attachment.id,
    filename: inbox_attachment.filename,
    contentType: inbox_attachment.content_type,
    size: inbox_attachment.size,
    sha256: inbox_attachment.sha256,
    deletedAt: inbox_attachment.deleted_at,
    confirmedAt: inbox_attachment.confirmed_at,
    createdAt: inbox_attachment.created_at,
    updatedAt: inbox_attachment.updated_at,
  } as const

  private toDocument(r: DocumentRow): Document {
    return {
      id: r.id,
      filename: r.filename,
      contentType: r.contentType,
      size: r.size,
      sha256: r.sha256,
      deletedAt: r.deletedAt?.toISOString() ?? null,
      confirmedAt: r.confirmedAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }
  }

  /** Both read endpoints are user-bound (the `app.user_id` GUC is audit-only;
   *  RLS keys solely off `app.workspace_id`). A service key with no bound user
   *  is rejected — mirrors the OCR-template + accounting-writes gate. */
  private requireUser(principal: ApiKeyPrincipal): string {
    if (principal.userId === null) {
      throw new ForbiddenError(
        "Document operations require a user-bound API key",
      )
    }
    return principal.userId
  }

  @Get()
  @ApiOperation({
    summary: "List documents",
    description:
      "Returns the caller's workspace documents. Soft-deleted documents are " +
      "excluded unless includeDeleted=true. Workspace-scoped (FORCE RLS).",
  })
  @ApiQuery({
    name: "includeDeleted",
    required: false,
    enum: ["true", "false"],
  })
  @ApiOkResponse({ type: ListDocumentsResponseDto })
  async list(
    @Query() query: ListDocumentsQueryDto,
    @CurrentPrincipal() principal: ApiKeyPrincipal,
  ): Promise<ListDocumentsResponse> {
    const userId = this.requireUser(principal)
    const includeDeleted = query.includeDeleted === "true"
    const rows = await withWorkspace(principal.workspaceId, userId, (db) =>
      db
        .select(this.projection)
        .from(inbox_attachment)
        .where(includeDeleted ? undefined : isNull(inbox_attachment.deleted_at))
        .orderBy(desc(inbox_attachment.created_at)),
    )
    return { documents: rows.map((r) => this.toDocument(r)) }
  }

  @Get(":id/download-url")
  @ApiOperation({
    summary: "Get a document download URL",
    description:
      "Mints a short-lived presigned S3 URL (attachment disposition) for a " +
      "document's bytes. The caller fetches the bytes DIRECT from S3. Returns " +
      "404 when the document is not visible or has been soft-deleted.",
  })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiOkResponse({ type: DocumentDownloadUrlResponseDto })
  async downloadUrl(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentPrincipal() principal: ApiKeyPrincipal,
  ): Promise<DocumentDownloadUrlResponse> {
    const userId = this.requireUser(principal)
    const row = await withWorkspace(
      principal.workspaceId,
      userId,
      async (db) => {
        const [r] = await db
          .select({
            storageKey: inbox_attachment.storage_key,
            filename: inbox_attachment.filename,
            deletedAt: inbox_attachment.deleted_at,
          })
          .from(inbox_attachment)
          .where(eq(inbox_attachment.id, id))
          .limit(1)
        return r ?? null
      },
    )
    if (!row || row.deletedAt) throw new NotFoundError("Document not found")

    const url = await getStore().presignGet(row.storageKey, {
      ttlSeconds: DOCUMENT_PREVIEW_TTL_SECONDS,
      disposition: "attachment",
      filename: row.filename,
      callerWorkspaceId: principal.workspaceId,
    })
    return { url, expiresInSeconds: DOCUMENT_PREVIEW_TTL_SECONDS }
  }
}
