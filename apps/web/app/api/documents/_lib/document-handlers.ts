import "server-only"

import type { Readable } from "node:stream"
import {
  DOCUMENT_HEADER_BYTES,
  DOCUMENT_MAX_BYTES,
  DOCUMENT_PREVIEW_TTL_SECONDS,
  DOCUMENT_UPLOAD_TTL_SECONDS,
  documentUploadType,
  parseDocumentKey,
  validateDocumentConfirmation,
  validateDocumentHeader,
  type DocumentStore,
} from "@workspace/storage"

import type { InboxAttachmentRepo } from "../../../_lib/inbox-attachment-repo"

/**
 * Authenticated document routes (S3 document store, Stage 3). Handlers take an
 * injected dependency bag so they are unit-testable without Next internals or
 * live AWS. Every path derives the workspace SERVER-SIDE from the session — the
 * client never supplies a workspace id.
 *
 * The three cross-system invariants the schema cannot enforce live here:
 *   - confirm: tagConfirmed → S3 200 → THEN the DB row (never DB-first, or the
 *     reaper's untagged>24h branch reaps a live doc).
 *   - dedup: consult the DB row (findLiveByHash), NOT S3 headExists — a pending
 *     orphan awaiting reap must not read as an existing document.
 *   - delete/undo asymmetric ordering (safe-failure direction): delete sets DB
 *     deleted_at FIRST then setDeletedTag; undo clears the S3 tag FIRST then the
 *     DB deleted_at.
 */

type DocumentStorage = Pick<
  DocumentStore,
  | "getBytes"
  | "head"
  | "presignPost"
  | "presignGet"
  | "tagConfirmed"
  | "tagOrphan"
  | "setDeletedTag"
  | "clearDeletedTag"
>

export interface DocumentHandlerDependencies {
  getSessionUserId(): Promise<string | null>
  getActiveWorkspaceId(userId: string): Promise<string | null>
  getStore(): DocumentStorage
  repo: InboxAttachmentRepo
}

interface Workspace {
  userId: string
  workspaceId: string
}

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status })
}

async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json()
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function isSafeFilename(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 255 &&
    !value.includes("/") &&
    !value.includes("\\") &&
    !value.includes(String.fromCharCode(0))
  )
}

interface PresignUploadBody {
  sha256: string
  filename: string
  contentType: string
  size: number
}

function parsePresignUploadBody(
  value: Record<string, unknown>,
): PresignUploadBody | null {
  const { sha256, filename, contentType, size } = value
  if (typeof sha256 !== "string" || !/^[0-9a-f]{64}$/.test(sha256)) return null
  if (!isSafeFilename(filename)) return null
  if (typeof contentType !== "string") return null
  if (
    typeof size !== "number" ||
    !Number.isSafeInteger(size) ||
    size < 1 ||
    size > DOCUMENT_MAX_BYTES
  ) {
    return null
  }
  return { sha256, filename, contentType, size }
}

function isNotFoundError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  if (
    "name" in error &&
    ["NotFound", "NoSuchKey"].includes(String(error.name))
  ) {
    return true
  }
  return (
    "$metadata" in error &&
    (error as { $metadata?: { httpStatusCode?: number } }).$metadata
      ?.httpStatusCode === 404
  )
}

async function readHeader(stream: Readable): Promise<Uint8Array> {
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of stream) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Buffer)
    const remaining = DOCUMENT_HEADER_BYTES - length
    if (bytes.byteLength >= remaining) {
      chunks.push(bytes.subarray(0, remaining))
      length += remaining
      break
    }
    chunks.push(bytes)
    length += bytes.byteLength
  }
  return Buffer.concat(chunks, length)
}

async function resolveWorkspace(
  dependencies: DocumentHandlerDependencies,
): Promise<Workspace | Response> {
  const userId = await dependencies.getSessionUserId()
  if (!userId) return jsonError("unauthenticated", 401)
  const workspaceId = await dependencies.getActiveWorkspaceId(userId)
  if (!workspaceId) return jsonError("workspace not found", 404)
  return { userId, workspaceId }
}

export function createDocumentHandlers(
  dependencies: DocumentHandlerDependencies,
): {
  presignUpload(request: Request): Promise<Response>
  confirm(request: Request): Promise<Response>
  getUrl(request: Request, id: string): Promise<Response>
  remove(id: string): Promise<Response>
  restore(id: string): Promise<Response>
} {
  const { repo } = dependencies

  return {
    async presignUpload(request) {
      const ws = await resolveWorkspace(dependencies)
      if (ws instanceof Response) return ws

      const rawBody = await readJsonObject(request)
      if (!rawBody) return jsonError("invalid request", 400)
      const body = parsePresignUploadBody(rawBody)
      if (!body) return jsonError("invalid upload metadata", 400)

      const uploadType = documentUploadType(body.contentType, body.filename)
      if (!uploadType) return jsonError("unsupported document type", 400)

      // Dedup against the DB row, NOT S3 headExists: only a live confirmed
      // attachment is a real hit. A pending/orphan blob (no row, or awaiting
      // reap) must not short-circuit a fresh upload (advisor S5).
      const existing = await repo.findLiveByHash(
        ws.workspaceId,
        ws.userId,
        body.sha256,
      )
      if (existing) {
        return Response.json({
          id: existing.id,
          key: existing.storageKey,
          alreadyExists: true,
        })
      }

      try {
        const presigned = await dependencies.getStore().presignPost({
          workspaceId: ws.workspaceId,
          sha256: body.sha256,
          ext: uploadType.extension,
          contentType: uploadType.contentType,
          maxBytes: body.size,
          ttlSeconds: DOCUMENT_UPLOAD_TTL_SECONDS,
        })
        return Response.json(presigned)
      } catch {
        return jsonError("storage unavailable", 502)
      }
    },

    async confirm(request) {
      const ws = await resolveWorkspace(dependencies)
      if (ws instanceof Response) return ws

      const rawBody = await readJsonObject(request)
      const objectKey = rawBody?.["key"]
      const filename = rawBody?.["filename"]
      if (typeof objectKey !== "string" || !isSafeFilename(filename)) {
        return jsonError("invalid request", 400)
      }

      const parsedKey = parseDocumentKey(objectKey)
      if (!parsedKey) return jsonError("invalid document key", 400)
      if (parsedKey.workspaceId !== ws.workspaceId) {
        return jsonError("document not found", 404)
      }

      const store = dependencies.getStore()

      let head: Awaited<ReturnType<DocumentStorage["head"]>>
      try {
        head = await store.head(objectKey)
      } catch (error) {
        return isNotFoundError(error)
          ? jsonError("document not found", 404)
          : jsonError("storage unavailable", 502)
      }

      // Authoritative S3-side size / content-type / checksum — never trust the
      // client-declared values.
      const confirmation = validateDocumentConfirmation(
        objectKey,
        ws.workspaceId,
        head,
      )
      if (!confirmation.valid) {
        try {
          await store.tagOrphan(objectKey)
        } catch {
          /* orphan tagging is best-effort; reaper's untagged>24h still purges */
        }
        return jsonError("document validation failed", 422)
      }

      let header: Uint8Array
      try {
        header = await readHeader(
          await store.getBytes(objectKey, {
            start: 0,
            end: DOCUMENT_HEADER_BYTES - 1,
          }),
        )
      } catch {
        return jsonError("storage unavailable", 502)
      }
      const headerValidation = validateDocumentHeader(head.contentType, header)
      if (!headerValidation.valid) {
        try {
          await store.tagOrphan(objectKey)
        } catch {
          /* best-effort */
        }
        return jsonError("document validation failed", 422)
      }

      // SAFETY ORDER: tag the blob confirmed (S3 200) BEFORE the DB row exists.
      // If this throws, no row is written — never DB-first.
      try {
        await store.tagConfirmed(objectKey)
      } catch {
        return jsonError("storage unavailable", 502)
      }

      const { id } = await repo.upsertConfirmed(ws.workspaceId, ws.userId, {
        storageKey: objectKey,
        sha256: parsedKey.sha256,
        contentType: head.contentType,
        size: head.size,
        filename,
      })
      return Response.json({ id, key: objectKey })
    },

    async getUrl(request, id) {
      const ws = await resolveWorkspace(dependencies)
      if (ws instanceof Response) return ws

      const row = await repo.getById(ws.workspaceId, ws.userId, id)
      if (!row || row.deletedAt) return jsonError("document not found", 404)

      const disposition =
        new URL(request.url).searchParams.get("disposition") === "attachment"
          ? "attachment"
          : "inline"
      try {
        const url = await dependencies.getStore().presignGet(row.storageKey, {
          ttlSeconds: DOCUMENT_PREVIEW_TTL_SECONDS,
          disposition,
          callerWorkspaceId: ws.workspaceId,
          ...(disposition === "attachment"
            ? { filename: row.filename }
            : { responseContentType: row.contentType }),
        })
        return Response.json({ url })
      } catch {
        return jsonError("storage unavailable", 502)
      }
    },

    async remove(id) {
      const ws = await resolveWorkspace(dependencies)
      if (ws instanceof Response) return ws

      const row = await repo.getById(ws.workspaceId, ws.userId, id)
      if (!row || row.deletedAt) return jsonError("document not found", 404)

      // Asymmetric ordering: DB deleted_at FIRST, then the S3 tag. A tag-write
      // failure then leaves the doc alive + undoable (a recoverable leak) — the
      // safe direction.
      const changed = await repo.markDeleted(ws.workspaceId, ws.userId, id)
      if (!changed) return jsonError("document not found", 404)
      try {
        await dependencies.getStore().setDeletedTag(row.storageKey)
      } catch {
        return jsonError("storage unavailable", 502)
      }
      return Response.json({ ok: true })
    },

    async restore(id) {
      const ws = await resolveWorkspace(dependencies)
      if (ws instanceof Response) return ws

      const row = await repo.getById(ws.workspaceId, ws.userId, id)
      if (!row) return jsonError("document not found", 404)
      if (!row.deletedAt) return Response.json({ ok: true })

      // Asymmetric ordering: clear the S3 tag FIRST, then the DB. So "DB live"
      // always implies "S3 not reaping" — the reverse risks reaping an undone
      // doc at 60d (data loss).
      try {
        await dependencies.getStore().clearDeletedTag(row.storageKey)
      } catch {
        return jsonError("storage unavailable", 502)
      }
      await repo.clearDeleted(ws.workspaceId, ws.userId, id)
      return Response.json({ ok: true })
    },
  }
}
