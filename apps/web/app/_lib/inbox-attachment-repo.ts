import "server-only"

import { and, eq, isNull } from "drizzle-orm"
import { withWorkspace } from "@workspace/db"
import { inbox_attachment } from "@workspace/db/schema"

/**
 * Durable-row side of the S3 document store (Inbox seam, migration 0057). Every
 * method runs inside `withWorkspace`, so FORCE RLS on `inbox_attachment` is the
 * tenant fence — a cross-workspace id/hash simply returns zero rows. The S3
 * object tags are owned by the storage layer, not here; the confirm/delete/undo
 * handlers coordinate the two (see document-handlers.ts).
 */

export interface AttachmentRow {
  id: string
  storageKey: string
  sha256: string
  contentType: string
  size: number
  filename: string
  deletedAt: Date | null
}

interface ConfirmedAttachmentInput {
  storageKey: string
  sha256: string
  contentType: string
  size: number
  filename: string
}

export interface InboxAttachmentRepo {
  /** Dedup oracle: a LIVE (not soft-deleted) confirmed row for this content. */
  findLiveByHash(
    workspaceId: string,
    userId: string,
    sha256: string,
  ): Promise<{ id: string; storageKey: string } | null>
  getById(
    workspaceId: string,
    userId: string,
    id: string,
  ): Promise<AttachmentRow | null>
  /** Idempotent confirm: (workspace_id, sha256) conflict revives + refreshes the row. */
  upsertConfirmed(
    workspaceId: string,
    userId: string,
    input: ConfirmedAttachmentInput,
  ): Promise<{ id: string }>
  /** Soft-delete: sets deleted_at only if currently live. True = a row changed. */
  markDeleted(workspaceId: string, userId: string, id: string): Promise<boolean>
  /** Undo: clears deleted_at. True = a row changed. */
  clearDeleted(
    workspaceId: string,
    userId: string,
    id: string,
  ): Promise<boolean>
}

export const inboxAttachmentRepo: InboxAttachmentRepo = {
  findLiveByHash(workspaceId, userId, sha256) {
    return withWorkspace(workspaceId, userId, async (db) => {
      const [row] = await db
        .select({
          id: inbox_attachment.id,
          storageKey: inbox_attachment.storage_key,
        })
        .from(inbox_attachment)
        .where(
          and(
            eq(inbox_attachment.sha256, sha256),
            isNull(inbox_attachment.deleted_at),
          ),
        )
        .limit(1)
      return row ?? null
    })
  },

  getById(workspaceId, userId, id) {
    return withWorkspace(workspaceId, userId, async (db) => {
      const [row] = await db
        .select({
          id: inbox_attachment.id,
          storageKey: inbox_attachment.storage_key,
          sha256: inbox_attachment.sha256,
          contentType: inbox_attachment.content_type,
          size: inbox_attachment.size,
          filename: inbox_attachment.filename,
          deletedAt: inbox_attachment.deleted_at,
        })
        .from(inbox_attachment)
        .where(eq(inbox_attachment.id, id))
        .limit(1)
      return row ?? null
    })
  },

  upsertConfirmed(workspaceId, userId, input) {
    return withWorkspace(workspaceId, userId, async (db) => {
      const now = new Date()
      const [row] = await db
        .insert(inbox_attachment)
        .values({
          workspace_id: workspaceId,
          storage_key: input.storageKey,
          sha256: input.sha256,
          content_type: input.contentType,
          size: input.size,
          filename: input.filename,
        })
        .onConflictDoUpdate({
          target: [inbox_attachment.workspace_id, inbox_attachment.sha256],
          set: {
            storage_key: input.storageKey,
            content_type: input.contentType,
            size: input.size,
            filename: input.filename,
            confirmed_at: now,
            deleted_at: null,
            updated_at: now,
          },
        })
        .returning({ id: inbox_attachment.id })
      if (!row) throw new Error("inbox_attachment upsert returned no row")
      return row
    })
  },

  markDeleted(workspaceId, userId, id) {
    return withWorkspace(workspaceId, userId, async (db) => {
      const now = new Date()
      const changed = await db
        .update(inbox_attachment)
        .set({ deleted_at: now, updated_at: now })
        .where(
          and(eq(inbox_attachment.id, id), isNull(inbox_attachment.deleted_at)),
        )
        .returning({ id: inbox_attachment.id })
      return changed.length > 0
    })
  },

  clearDeleted(workspaceId, userId, id) {
    return withWorkspace(workspaceId, userId, async (db) => {
      const now = new Date()
      const changed = await db
        .update(inbox_attachment)
        .set({ deleted_at: null, updated_at: now })
        .where(eq(inbox_attachment.id, id))
        .returning({ id: inbox_attachment.id })
      return changed.length > 0
    })
  },
}
