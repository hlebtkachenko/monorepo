/**
 * Browser-side client for the S3 document working store (issue #751). Turns the
 * `/api/documents/*` routes into a small typed surface the Inspector Attachments
 * section can be wired to. The three-step upload mirrors the server contract:
 *
 *   1. POST /api/documents/presign-upload  { sha256, filename, contentType, size }
 *        → { key, url, fields }            (or { id, key, alreadyExists } on a
 *                                            hash dedup hit — skip 2 & 3)
 *   2. POST <presigned S3 url>  (multipart form: fields… + file LAST)
 *   3. POST /api/documents/confirm  { key, filename }  → { id, key }
 *
 * The sha256 is computed here (the presign pins the content-addressed key + an
 * S3 checksum condition to it), so the server never trusts a client hash for the
 * stored bytes — it re-heads S3 and validates in `confirm`. Read/delete/restore
 * are single calls. No React here; the hook (`useInspectorAttachments`) layers
 * state on top.
 */

export type DocumentAction =
  "presign" | "upload" | "confirm" | "url" | "delete" | "restore"

/** A failed document call, carrying which step failed and the HTTP status. */
export class DocumentActionError extends Error {
  constructor(
    readonly action: DocumentAction,
    readonly status: number,
    message?: string,
  ) {
    super(message ?? `document ${action} failed (${status})`)
    this.name = "DocumentActionError"
  }
}

export interface UploadedDocument {
  /** `inbox_attachment` row id — the stable reference a record stores. */
  id: string
  /** Content-addressed S3 object key. */
  key: string
  filename: string
  contentType: string
  size: number
  /** True when an identical (hash-equal) live document already existed. */
  alreadyExists: boolean
}

/** Hex sha256 of a Blob, via WebCrypto — the content-address the presign pins. */
export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

interface PresignResponse {
  key: string
  url: string
  fields: Record<string, string>
}
interface DedupResponse {
  id: string
  key: string
  alreadyExists: true
}

async function readJson<T>(
  response: Response,
  action: DocumentAction,
): Promise<T> {
  if (!response.ok) throw new DocumentActionError(action, response.status)
  return (await response.json()) as T
}

/** Run the full presign → S3 POST → confirm upload for one file. */
export async function uploadDocument(file: File): Promise<UploadedDocument> {
  const sha256 = await sha256Hex(file)

  const presign = await readJson<PresignResponse | DedupResponse>(
    await fetch("/api/documents/presign-upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sha256,
        filename: file.name,
        contentType: file.type,
        size: file.size,
      }),
    }),
    "presign",
  )

  const base = {
    filename: file.name,
    contentType: file.type,
    size: file.size,
  }

  if ("alreadyExists" in presign) {
    return { id: presign.id, key: presign.key, alreadyExists: true, ...base }
  }

  // S3 presigned POST: every returned field, then the file LAST (S3 requires it).
  const form = new FormData()
  for (const [name, value] of Object.entries(presign.fields)) {
    form.append(name, value)
  }
  form.append("file", file)
  const s3Response = await fetch(presign.url, { method: "POST", body: form })
  if (!s3Response.ok) {
    throw new DocumentActionError("upload", s3Response.status)
  }

  const confirmed = await readJson<{ id: string; key: string }>(
    await fetch("/api/documents/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: presign.key, filename: file.name }),
    }),
    "confirm",
  )

  return { id: confirmed.id, key: confirmed.key, alreadyExists: false, ...base }
}

/** Mint a short-lived presigned GET URL (inline = preview, attachment = download). */
export async function getDocumentUrl(
  id: string,
  disposition: "inline" | "attachment",
): Promise<string> {
  const { url } = await readJson<{ url: string }>(
    await fetch(
      `/api/documents/${encodeURIComponent(id)}/url?disposition=${disposition}`,
    ),
    "url",
  )
  return url
}

/** Soft-delete a document (reversible via `restoreDocument`). */
export async function deleteDocument(id: string): Promise<void> {
  const response = await fetch(`/api/documents/${encodeURIComponent(id)}`, {
    method: "DELETE",
  })
  if (!response.ok) throw new DocumentActionError("delete", response.status)
}

/** Undo a soft-delete. */
export async function restoreDocument(id: string): Promise<void> {
  const response = await fetch(
    `/api/documents/${encodeURIComponent(id)}/restore`,
    { method: "POST" },
  )
  if (!response.ok) throw new DocumentActionError("restore", response.status)
}
