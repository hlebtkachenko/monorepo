import type { Readable } from "node:stream"

/** Byte range for a partial `getBytes` read (inclusive, matches HTTP Range semantics). */
export interface DocumentByteRange {
  start: number
  end: number
}

export interface PresignPostInput {
  workspaceId: string
  /** Hex-encoded sha256 of the file, computed by the client before presigning. Pins the key + checksum condition. */
  sha256: string
  ext: string
  contentType: string
  maxBytes: number
  ttlSeconds: number
}

export interface PresignPostResult {
  key: string
  url: string
  fields: Record<string, string>
}

export interface PutInput {
  workspaceId: string
  contentType: string
  filename: string
}

export interface PutResult {
  key: string
  /** Hex-encoded sha256 of the stored bytes, matching the key's content-address segment. */
  sha256: string
  size: number
}

export interface HeadResult {
  size: number
  contentType: string
  /** Raw S3 `ChecksumSHA256` (base64), authoritative — not the hex form used in keys. */
  checksumSha256: string
  etag: string
}

export type DocumentDisposition = "inline" | "attachment"

export interface PresignGetInput {
  ttlSeconds: number
  disposition: DocumentDisposition
  responseContentType?: string
}

/**
 * Storage-agnostic seam for documents (receipts, invoices, ISDOC/XML, Brain
 * artifacts). Key convention: `documents/{workspaceId}/{sha256}.{ext}` —
 * content-addressed and workspace-scoped. Confirmation and undo promote an
 * exact source version into a new current same-key version so reaper races
 * cannot erase an acknowledged transition. See
 * `.context/s3-document-store/PLAN.md` §3, §7 for the full design.
 *
 * Ownership boundary: storage owns the bucket + this interface + all S3
 * tags. Callers (e.g. Inbox) own their own DB rows and call the tag methods
 * from their delete/undo/confirm flows — they never read S3 tags directly.
 */
export interface DocumentStore {
  /** Browser uploads directly to S3; S3 enforces key + size + content-type + checksum from the returned conditions. */
  presignPost(input: PresignPostInput): Promise<PresignPostResult>
  /** Server-side ingest (Brain artifacts, small files). Computes sha256 itself — never trusts a caller-supplied hash. */
  put(bytes: Buffer, input: PutInput): Promise<PutResult>
  /** Streams object bytes; never buffers. `range` supports partial reads (e.g. magic-byte sniffing). */
  getBytes(key: string, range?: DocumentByteRange): Promise<Readable>
  /** AUTHORITATIVE S3-side values for confirm — never trust client-declared size/content-type. */
  head(key: string): Promise<HeadResult>
  /** Mints a short-lived GET URL. `disposition` controls inline preview vs. attachment download. */
  presignGet(key: string, input: PresignGetInput): Promise<string>
  /** Dedup check: does an object already exist at this content-addressed key? */
  headExists(key: string): Promise<boolean>
  /** Soft-delete: tags `deleted-at=<ISO now>`. Reaper purges 60d later unless undone. */
  setDeletedTag(key: string): Promise<void>
  /** Undo within the 60d window: copies the pinned source into a new current version without `deleted-at`. */
  clearDeletedTag(key: string): Promise<void>
  /** Marks a confirmed, live object by copying the pinned source into a new current version with `confirmed-at=<ISO now>`. */
  tagConfirmed(key: string): Promise<void>
  /** Marks a failed-validation object: tags `orphan-at=<ISO now>`. Reaper purges within ~1h. */
  tagOrphan(key: string): Promise<void>
}
