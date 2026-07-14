import { z } from "zod"

import "./zod-openapi"

/**
 * Public-API view of an `inbox_attachment` — a confirmed source-document blob
 * in the S3 document store (issue #518).
 *
 * WORKSPACE-scoped, NOT organization-scoped: a received file precedes org
 * filing and the same blob is re-filed between client books without
 * re-uploading, so the public surface is driven through the API key's parent
 * WORKSPACE (via `withWorkspace`), never an organization; no tenant identifiers
 * are ever accepted in a request. This is the READ / RETRIEVE twin — bytes are
 * fetched DIRECT from S3 via a short-lived presigned URL, never proxied through
 * the API. The internal S3 object key is never exposed; callers address a
 * document by its id.
 *
 * camelCase JSON mapped from the snake_case row.
 */

const Timestamp = z.string().openapi({
  description: "ISO 8601 timestamp.",
  example: "2026-07-14T10:15:00.000Z",
})

export const DocumentSchema = z
  .object({
    id: z.string().uuid().openapi({
      description: "Document (attachment) id.",
      example: "0196f1de-0000-7000-8000-0000000000d1",
    }),
    filename: z.string().openapi({
      description: "Original filename supplied at upload.",
      example: "faktura-2025-014.pdf",
    }),
    contentType: z.string().openapi({
      description: "S3-authoritative content type recorded at confirm.",
      example: "application/pdf",
    }),
    size: z.number().int().openapi({
      description: "Size in bytes (S3-authoritative).",
      example: 84213,
    }),
    sha256: z.string().openapi({
      description:
        "Lowercase hex sha256 of the bytes — the content address. Stable per " +
        "content; usable for client-side dedup.",
      example:
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    }),
    deletedAt: Timestamp.nullable().openapi({
      description:
        "When the document was soft-deleted, or null. A soft-deleted document " +
        "is still listed but cannot be downloaded; its bytes are purged 60 " +
        "days after deletion unless restored.",
      example: null,
    }),
    confirmedAt: Timestamp.openapi({
      description: "When the upload was confirmed (the row exists only after).",
    }),
    createdAt: Timestamp.openapi({ description: "Row creation timestamp." }),
    updatedAt: Timestamp.openapi({ description: "Row last-update timestamp." }),
  })
  .openapi({
    description:
      "A confirmed source-document in the workspace's document store " +
      "(workspace-scoped, FORCE RLS).",
  })
export type Document = z.infer<typeof DocumentSchema>

/** `GET /v1/documents` query — optional filters. */
export const ListDocumentsQuerySchema = z
  .object({
    includeDeleted: z
      .enum(["true", "false"])
      .optional()
      .openapi({
        description:
          "When 'true', include soft-deleted documents (still within the " +
          "60-day redemption window). Defaults to excluding them.",
        example: "false",
      }),
  })
  .openapi({ description: "Filters for the document list." })
export type ListDocumentsQuery = z.infer<typeof ListDocumentsQuerySchema>

/** `GET /v1/documents` response — the workspace's documents. */
export const ListDocumentsResponseSchema = z
  .object({
    documents: z.array(DocumentSchema).openapi({
      description: "Documents in the caller's workspace.",
    }),
  })
  .openapi({
    description:
      "The workspace's confirmed documents (workspace-scoped, FORCE RLS).",
  })
export type ListDocumentsResponse = z.infer<typeof ListDocumentsResponseSchema>

/**
 * `GET /v1/documents/{id}/download-url` response — a short-lived presigned URL
 * the caller fetches DIRECT from S3 (bytes never pass through the API).
 */
export const DocumentDownloadUrlResponseSchema = z
  .object({
    url: z
      .string()
      .url()
      .openapi({
        description:
          "Short-lived presigned S3 URL (attachment disposition). Fetch the " +
          "bytes directly; the URL expires.",
        example:
          "https://bucket.s3.eu-central-1.amazonaws.com/documents/ws/doc.pdf?X-Amz-Signature=abc123",
      }),
    expiresInSeconds: z.number().int().openapi({
      description: "Seconds until the presigned URL expires.",
      example: 900,
    }),
  })
  .openapi({
    description: "A short-lived presigned download URL for a document's bytes.",
  })
export type DocumentDownloadUrlResponse = z.infer<
  typeof DocumentDownloadUrlResponseSchema
>

/** Path param for single-document operations. */
export const DocumentIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({
      param: { name: "id", in: "path" },
      description: "Document id, resolved within the API key's workspace.",
      example: "0196f1de-0000-7000-8000-0000000000d1",
    }),
})
export type DocumentIdParam = z.infer<typeof DocumentIdParamSchema>
