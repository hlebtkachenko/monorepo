import "server-only"

/**
 * The HEIC preview derivative, attached to a document after its row exists.
 *
 * WHERE THIS SITS IN THE UPLOAD, AND WHY IT SITS THERE. `uploadDocument`
 * (`documents.ts`) streams the bytes into S3 and commits a row in a transaction
 * that also enforces the quota and the duplicate rule. This runs AFTER that
 * transaction has committed, on the one outcome that produced a new object.
 * Three properties fall out of that placement, and each is the reason for it:
 *
 *   - THE STREAMING PATH IS UNTOUCHED. `lib/storage/upload-stream.ts` exists so
 *     that a 25 MiB upload never sits in the task's heap; nothing here reaches
 *     into that pipeline, tees it, or buffers it. The derivative is made from
 *     the object that is ALREADY IN THE BUCKET, read back deliberately and under
 *     its own ceiling — so a bug in this module can produce a bad thumbnail and
 *     cannot produce a bad document.
 *   - A DUPLICATE NEVER REACHES IT. The duplicate branch discards the object it
 *     just wrote; there is nothing to derive from, and the twin already carries
 *     whatever preview it was born with.
 *   - FAILURE CANNOT UNDO AN UPLOAD. The row is committed before this runs, so
 *     the worst outcome is a HEIC with no preview — which is exactly the state
 *     every HEIC was in before this feature existed, and which the row sheet
 *     already renders honestly.
 *
 * WHY IT IS AWAITED RATHER THAN FIRED AND FORGOTTEN. A floating promise on a
 * Fargate task is work that disappears when the request's execution context
 * does, and a preview that exists only sometimes is worse than one that never
 * exists: the client refreshes and watches the outcome change under them. The
 * cost is ~200 ms of decode plus ~120 ms of encode for a 12 MP frame, measured,
 * on the one upload type that pays it.
 */
import { Readable } from "node:stream"

import { and, eq, isNull } from "drizzle-orm"

import { betaDb } from "@/db/client"
import { document } from "@/db/schema"
import { heicJpegPreview } from "@/lib/storage/heic-preview"
import { documentStore } from "@/lib/storage/store"
import { MAX_UPLOAD_BYTES } from "@/lib/storage/upload-stream"

import type { OrgScope } from "./scope"

/**
 * Read an object back into memory, refusing anything past the upload ceiling.
 *
 * The ceiling is the SAME 25 MiB the upload enforces, so this can only ever be
 * asked to hold something the upload already allowed. It is re-checked rather
 * than assumed: this reads from the bucket, and a bucket is a place where an
 * object could arrive by some other path one day.
 */
async function readObject(
  key: string,
  organizationId: string,
): Promise<Buffer | null> {
  const stream = await documentStore().get(key, organizationId)
  const chunks: Buffer[] = []
  let total = 0

  for await (const chunk of stream) {
    const bytes = Buffer.from(chunk as Uint8Array)
    total += bytes.byteLength
    if (total > MAX_UPLOAD_BYTES) {
      stream.destroy()
      return null
    }
    chunks.push(bytes)
  }

  return Buffer.concat(chunks, total)
}

/**
 * Generate and store the JPEG derivative of a freshly-uploaded HEIC.
 *
 * A no-op for every other content type. Answers whether a derivative was
 * attached, which is what the upload path reflects into the projection it
 * returns — the caller must not re-read the row to find out.
 *
 * NEVER THROWS. Every failure mode (a decoder that says no, an S3 hiccup, a
 * write that loses a race with a soft delete) ends the same way: the document
 * has no preview, and the client is told about their upload, not about ours.
 */
export async function attachHeicPreview(
  scope: OrgScope,
  row: { id: string; contentType: string; storageKey: string },
): Promise<boolean> {
  if (row.contentType !== "image/heic") return false

  const store = documentStore()
  let previewKey: string | undefined

  try {
    const original = await readObject(row.storageKey, scope.organizationId)
    if (!original) return false

    const preview = await heicJpegPreview(original)
    if (!preview) return false

    const put = await store.put({
      organizationId: scope.organizationId,
      contentType: "image/jpeg",
      extension: "jpg",
      body: Readable.from([preview.bytes]),
    })
    previewKey = put.key

    // Guarded on the row's own organization, on `deleted_at IS NULL` and on the
    // pointer still being empty. The office can soft-delete a document between
    // the insert and this update, and a second writer must never be the one that
    // wins — migration 0010's trigger refuses key → different key outright, so
    // losing the race here has to mean "drop the object", not "raise".
    const updated = await betaDb()
      .update(document)
      .set({
        preview_storage_key: put.key,
        preview_byte_size: preview.bytes.byteLength,
      })
      .where(
        and(
          eq(document.id, row.id),
          eq(document.organization_id, scope.organizationId),
          isNull(document.deleted_at),
          isNull(document.preview_storage_key),
        ),
      )
      .returning({ id: document.id })

    if (updated.length === 0) {
      // Nothing points at the object we just wrote. Drop it rather than leave an
      // orphan no row can lead a purge to.
      await store.delete(put.key, scope.organizationId).catch(() => {})
      return false
    }

    return true
  } catch {
    if (previewKey) {
      await store.delete(previewKey, scope.organizationId).catch(() => {})
    }
    return false
  }
}
