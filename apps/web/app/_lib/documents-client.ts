/**
 * Generic browser-side client for the S3 document store.
 *
 * UI-AGNOSTIC by design: these are plain async functions any component, block,
 * or page can call — they are NOT tied to the Inbox or any specific surface.
 * The whole point is that S3 document handling is a reusable capability wired
 * wherever a document is uploaded, previewed, downloaded, or deleted.
 *
 * Bytes go DIRECT to S3 (presigned POST / presigned GET); nothing streams
 * through our compute. `uploadDocument` computes the content sha256 in the
 * browser (which pins the content-addressed key), presigns, POSTs the file
 * straight to S3, then confirms.
 */

export interface UploadedDocument {
  id: string
  key: string
  /** True when an identical document already existed in this workspace (dedup hit — no upload happened). */
  deduped: boolean
}

export type DocumentDisposition = "inline" | "attachment"

export class DocumentClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly stage: "presign" | "s3" | "confirm" | "url" | "delete" | "restore",
  ) {
    super(message)
    this.name = "DocumentClientError"
  }
}

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string }
    return body.error ?? res.statusText
  } catch {
    return res.statusText
  }
}

/**
 * Full upload flow: sha256 → presign-upload (or dedup hit) → direct S3 POST →
 * confirm. Returns the durable attachment id. Throws `DocumentClientError`
 * naming the stage that failed.
 */
export async function uploadDocument(file: File): Promise<UploadedDocument> {
  const sha256 = await sha256Hex(file)

  const presignRes = await fetch("/api/documents/presign-upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sha256,
      filename: file.name,
      contentType: file.type,
      size: file.size,
    }),
  })
  if (!presignRes.ok) {
    throw new DocumentClientError(
      await readError(presignRes),
      presignRes.status,
      "presign",
    )
  }
  const presign = (await presignRes.json()) as
    | { alreadyExists: true; id: string; key: string }
    | { url: string; key: string; fields: Record<string, string> }

  if ("alreadyExists" in presign) {
    return { id: presign.id, key: presign.key, deduped: true }
  }

  // Direct-to-S3 POST. Every policy field first, the file LAST (S3 requires it).
  const form = new FormData()
  for (const [name, value] of Object.entries(presign.fields)) {
    form.append(name, value)
  }
  form.append("file", file)
  const s3Res = await fetch(presign.url, { method: "POST", body: form })
  if (!s3Res.ok) {
    throw new DocumentClientError(
      `S3 rejected the upload (${s3Res.status})`,
      s3Res.status,
      "s3",
    )
  }

  const confirmRes = await fetch("/api/documents/confirm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key: presign.key, filename: file.name }),
  })
  if (!confirmRes.ok) {
    throw new DocumentClientError(
      await readError(confirmRes),
      confirmRes.status,
      "confirm",
    )
  }
  const confirmed = (await confirmRes.json()) as { id: string; key: string }
  return { id: confirmed.id, key: confirmed.key, deduped: false }
}

/** Mints a short-lived presigned URL for preview (`inline`) or download (`attachment`). */
export async function getDocumentUrl(
  id: string,
  disposition: DocumentDisposition = "inline",
): Promise<string> {
  const res = await fetch(
    `/api/documents/${encodeURIComponent(id)}/url?disposition=${disposition}`,
  )
  if (!res.ok) {
    throw new DocumentClientError(await readError(res), res.status, "url")
  }
  return ((await res.json()) as { url: string }).url
}

/** Soft-delete (60-day redemption window). */
export async function deleteDocument(id: string): Promise<void> {
  const res = await fetch(`/api/documents/${encodeURIComponent(id)}`, {
    method: "DELETE",
  })
  if (!res.ok) {
    throw new DocumentClientError(await readError(res), res.status, "delete")
  }
}

/** Undo a soft-delete within the redemption window. */
export async function restoreDocument(id: string): Promise<void> {
  const res = await fetch(`/api/documents/${encodeURIComponent(id)}/restore`, {
    method: "POST",
  })
  if (!res.ok) {
    throw new DocumentClientError(await readError(res), res.status, "restore")
  }
}
