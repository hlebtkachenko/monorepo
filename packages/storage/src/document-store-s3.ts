import { createHash } from "node:crypto"
import type { Readable } from "node:stream"
import {
  CopyObjectCommand,
  GetObjectCommand,
  GetObjectTaggingCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  PutObjectTaggingCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import {
  createPresignedPost,
  type PresignedPostOptions,
} from "@aws-sdk/s3-presigned-post"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { parseDocumentKey } from "./document-validation"
import type {
  DocumentByteRange,
  DocumentStore,
  HeadResult,
  PresignGetInput,
  PresignPostInput,
  PresignPostResult,
  PutInput,
  PutResult,
} from "./document-store"

type PresignConditions = NonNullable<PresignedPostOptions["Conditions"]>

export interface S3DocumentStoreConfig {
  bucket: string
  region?: string
  /** Set for minio dev / any S3-compatible endpoint. Forces path-style addressing. */
  endpoint?: string
  /** Dedicated KMS CMK. When set, server-side put/copy operations set SSE-KMS explicitly; presigned POST uploads rely on the bucket's default encryption instead. */
  kmsKeyId?: string
  /**
   * Static credentials for a custom endpoint (minio dev). Pins them explicitly
   * so the SDK never consults the node provider chain, which errors when BOTH
   * `AWS_PROFILE` and `AWS_ACCESS_KEY_ID`/`SECRET` are set (common on a dev
   * machine with a global profile). Left unset in production so the ECS
   * task-role provider chain resolves normally.
   */
  credentials?: { accessKeyId: string; secretAccessKey: string }
}

function configFromEnv(): S3DocumentStoreConfig {
  const bucket = process.env.DOCUMENTS_BUCKET
  if (!bucket) {
    throw new Error("DOCUMENTS_BUCKET is not set")
  }
  const endpoint = process.env.S3_ENDPOINT
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
  return {
    bucket,
    region: process.env.AWS_REGION,
    endpoint,
    kmsKeyId: process.env.DOCUMENTS_KMS_KEY_ID,
    // Only for the custom-endpoint (dev/minio) path, and only when both are
    // present — production leaves these unset and uses the task-role chain.
    ...(endpoint && accessKeyId && secretAccessKey
      ? { credentials: { accessKeyId, secretAccessKey } }
      : {}),
  }
}

// Matches the workspaceId segment of DOCUMENT_KEY_PATTERN in
// document-validation.ts. presignPost/put and confirm (parseDocumentKey) MUST
// agree on the key shape — a non-UUID workspaceId would build a key that
// uploads fine but can never be confirmed (orphaned, reaped at 24h, silently
// lost). Reject it here, at presign/put time. (S1)
const WORKSPACE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function documentKey(
  workspaceId: string,
  sha256Hex: string,
  ext: string,
): string {
  if (!WORKSPACE_ID_PATTERN.test(workspaceId)) {
    throw new Error(
      `Invalid workspaceId: expected a lowercase UUID, got "${workspaceId}"`,
    )
  }
  if (!/^[0-9a-f]{64}$/.test(sha256Hex)) {
    throw new Error(
      `Invalid sha256: expected 64 lowercase hex characters, got "${sha256Hex}"`,
    )
  }
  if (!/^[a-z0-9]+$/.test(ext)) {
    throw new Error(
      `Invalid file extension: expected lowercase alphanumeric, got "${ext}"`,
    )
  }
  return `documents/${workspaceId}/${sha256Hex}.${ext}`
}

function extensionFromFilename(filename: string): string {
  const dot = filename.lastIndexOf(".")
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase()
}

function encodeCopySource(
  bucket: string,
  objectKey: string,
  versionId: string,
): string {
  const encodeComponent = (value: string): string =>
    encodeURIComponent(value).replace(
      /[!'()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    )
  const encodedKey = objectKey.split("/").map(encodeComponent).join("/")
  return `${encodeComponent(bucket)}/${encodedKey}?versionId=${encodeComponent(versionId)}`
}

/**
 * Builds a `Content-Disposition` value. For a download we include the original
 * filename (falling back to the object key's basename otherwise), sanitized to
 * a quoted ASCII token so it can never break the header or the signature.
 */
function contentDisposition(
  disposition: "inline" | "attachment",
  filename?: string,
): string {
  if (disposition !== "attachment" || !filename) return disposition
  const trimmed = filename.slice(0, 200)
  // ASCII `filename=` fallback for legacy clients + RFC 5987 `filename*=` so
  // UTF-8 names keep their diacritics (Czech invoices: `faktura_č.pdf`). The
  // ASCII form flattens non-word bytes to `_`; the value is signed into the
  // presigned URL, so neither can break the header or the signature.
  const ascii = trimmed.replace(/[^\w.\- ]+/g, "_")
  const utf8 = encodeURIComponent(trimmed)
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`
}

function isNotFoundError(error: unknown): boolean {
  if (error instanceof NotFound) return true
  return (
    typeof error === "object" &&
    error !== null &&
    "$metadata" in error &&
    (error as { $metadata?: { httpStatusCode?: number } }).$metadata
      ?.httpStatusCode === 404
  )
}

/**
 * S3-backed `DocumentStore`. Credentials resolve via the default AWS
 * provider chain (ECS task role in AWS, `~/.aws` locally) — never
 * hardcoded. Set `endpoint` (via `S3_ENDPOINT`) to point at minio for local
 * dev; `forcePathStyle` is forced on whenever an endpoint is set since minio
 * does not support virtual-hosted-style addressing.
 */
export class S3DocumentStore implements DocumentStore {
  private readonly client: S3Client
  private readonly bucket: string
  private readonly kmsKeyId: string | undefined

  constructor(config: S3DocumentStoreConfig = configFromEnv()) {
    this.bucket = config.bucket
    this.kmsKeyId = config.kmsKeyId
    this.client = new S3Client({
      region: config.region,
      ...(config.endpoint
        ? { endpoint: config.endpoint, forcePathStyle: true }
        : {}),
      ...(config.credentials ? { credentials: config.credentials } : {}),
    })
  }

  async presignPost(input: PresignPostInput): Promise<PresignPostResult> {
    if (!Number.isInteger(input.maxBytes) || input.maxBytes < 1) {
      throw new Error(`maxBytes must be an integer >= 1, got ${input.maxBytes}`)
    }
    if (
      !Number.isInteger(input.ttlSeconds) ||
      input.ttlSeconds < 1 ||
      input.ttlSeconds > 604_800
    ) {
      throw new Error(
        `ttlSeconds must be an integer between 1 and 604800 (7 days), got ${input.ttlSeconds}`,
      )
    }
    const key = documentKey(input.workspaceId, input.sha256, input.ext)
    const checksumBase64 = Buffer.from(input.sha256, "hex").toString("base64")

    // No SSE headers here: a browser presigned POST does not reliably send
    // x-amz-server-side-encryption*, so requiring them would 403 every
    // KMS-mode upload. Encryption comes from the bucket's default
    // encryption (CMK + bucketKeyEnabled), which needs none.
    const conditions: PresignConditions = [
      ["content-length-range", 1, input.maxBytes],
      ["eq", "$key", key],
      ["eq", "$Content-Type", input.contentType],
      ["eq", "$x-amz-checksum-sha256", checksumBase64],
    ]

    const { url, fields } = await createPresignedPost(this.client, {
      Bucket: this.bucket,
      Key: key,
      Conditions: conditions,
      Fields: {
        "Content-Type": input.contentType,
        "x-amz-checksum-sha256": checksumBase64,
      },
      Expires: input.ttlSeconds,
    })

    return { key, url, fields }
  }

  async put(bytes: Buffer, input: PutInput): Promise<PutResult> {
    const sha256Hex = createHash("sha256").update(bytes).digest("hex")
    const checksumBase64 = Buffer.from(sha256Hex, "hex").toString("base64")
    const ext = extensionFromFilename(input.filename)
    const key = documentKey(input.workspaceId, sha256Hex, ext)

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentType: input.contentType,
        ChecksumSHA256: checksumBase64,
        ...(this.kmsKeyId
          ? {
              ServerSideEncryption: "aws:kms" as const,
              SSEKMSKeyId: this.kmsKeyId,
            }
          : {}),
      }),
    )

    return { key, sha256: sha256Hex, size: bytes.byteLength }
  }

  async getBytes(key: string, range?: DocumentByteRange): Promise<Readable> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ...(range ? { Range: `bytes=${range.start}-${range.end}` } : {}),
      }),
    )
    return response.Body as unknown as Readable
  }

  async head(key: string): Promise<HeadResult> {
    const response = await this.client.send(
      // ChecksumMode: "ENABLED" is required for S3 to include ChecksumSHA256
      // in the response — omitted, it comes back empty even though the
      // object was uploaded with a checksum.
      new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ChecksumMode: "ENABLED",
      }),
    )
    return {
      size: response.ContentLength ?? 0,
      contentType: response.ContentType ?? "",
      checksumSha256: response.ChecksumSHA256 ?? "",
      etag: response.ETag ?? "",
    }
  }

  async presignGet(key: string, input: PresignGetInput): Promise<string> {
    // Fail-closed backstop: never sign a key outside the caller's workspace,
    // whatever the route did. Not a replacement for route-level authorization.
    const parsed = parseDocumentKey(key)
    if (!parsed || parsed.workspaceId !== input.callerWorkspaceId) {
      throw new Error(
        "presignGet: object key does not belong to the caller's workspace",
      )
    }
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: contentDisposition(
          input.disposition,
          input.filename,
        ),
        ...(input.responseContentType
          ? { ResponseContentType: input.responseContentType }
          : {}),
      }),
      { expiresIn: input.ttlSeconds },
    )
  }

  async headExists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      )
      return true
    } catch (error) {
      if (isNotFoundError(error)) return false
      throw error
    }
  }

  async setDeletedTag(key: string): Promise<void> {
    await this.mergeTags(key, { "deleted-at": new Date().toISOString() })
  }

  async clearDeletedTag(key: string): Promise<void> {
    await this.copyWithMergedTags(key, { "deleted-at": null })
  }

  async tagConfirmed(key: string): Promise<void> {
    await this.copyWithMergedTags(key, {
      "confirmed-at": new Date().toISOString(),
      "deleted-at": null,
      "orphan-at": null,
    })
  }

  async tagOrphan(key: string): Promise<void> {
    await this.mergeTags(key, { "orphan-at": new Date().toISOString() })
  }

  /**
   * Promotes an exact source VersionId into a new current same-key version
   * while replacing its tags. This closes the reaper TOCTOU window: if the
   * source is deleted before CopyObject, the transition fails; if the copy
   * wins, the new current version survives deletion of the old one.
   * Metadata is copied unchanged and S3 calculates a fresh SHA256 checksum.
   */
  private async copyWithMergedTags(
    key: string,
    changes: Record<string, string | null>,
  ): Promise<void> {
    // Pin the current version via HeadObject, which returns the VersionId on
    // every S3 implementation. (Real S3 also returns it on GetObjectTagging, but
    // minio omits it there — so HEAD is the portable source of the pinned id.)
    const source = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
    )
    const sourceVersionId = source.VersionId
    if (!sourceVersionId) {
      throw new Error("S3 did not return a source VersionId for tag transition")
    }
    if (!source.ETag) {
      throw new Error("S3 did not return a source ETag for tag transition")
    }

    // Read the tags of that exact version (explicit VersionId works everywhere).
    const existing = await this.client.send(
      new GetObjectTaggingCommand({
        Bucket: this.bucket,
        Key: key,
        VersionId: sourceVersionId,
      }),
    )

    const tags = this.applyTagChanges(existing.TagSet, changes)
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        Key: key,
        CopySource: encodeCopySource(this.bucket, key, sourceVersionId),
        CopySourceIfMatch: source.ETag,
        MetadataDirective: "REPLACE",
        Metadata: source.Metadata,
        CacheControl: source.CacheControl,
        ContentDisposition: source.ContentDisposition,
        ContentEncoding: source.ContentEncoding,
        ContentLanguage: source.ContentLanguage,
        ContentType: source.ContentType,
        Expires: source.Expires,
        StorageClass: source.StorageClass,
        WebsiteRedirectLocation: source.WebsiteRedirectLocation,
        TaggingDirective: "REPLACE",
        Tagging: new URLSearchParams(Array.from(tags)).toString(),
        ChecksumAlgorithm: "SHA256",
        ...(this.kmsKeyId
          ? {
              ServerSideEncryption: "aws:kms" as const,
              SSEKMSKeyId: this.kmsKeyId,
            }
          : {}),
      }),
    )
  }

  /**
   * Merges `changes` into the object's existing tag set — a `null` value
   * removes that tag. `PutObjectTagging` REPLACES the whole tag set, so
   * every write reads the current set first and preserves untouched tags.
   *
   * Read-modify-write is non-atomic (no compare-and-swap between the Get and
   * the Put). It is used only for delete/orphan marking. Safety-critical
   * confirm and undo transitions use `copyWithMergedTags` instead.
   */
  private async mergeTags(
    key: string,
    changes: Record<string, string | null>,
  ): Promise<void> {
    const existing = await this.client.send(
      new GetObjectTaggingCommand({ Bucket: this.bucket, Key: key }),
    )
    const tags = this.applyTagChanges(existing.TagSet, changes)
    await this.client.send(
      new PutObjectTaggingCommand({
        Bucket: this.bucket,
        Key: key,
        Tagging: {
          TagSet: Array.from(tags, ([Key, Value]) => ({ Key, Value })),
        },
      }),
    )
  }

  private applyTagChanges(
    tagSet: Array<{ Key?: string; Value?: string }> | undefined,
    changes: Record<string, string | null>,
  ): Map<string, string> {
    const tags = new Map<string, string>()
    for (const tag of tagSet ?? []) {
      if (tag.Key) tags.set(tag.Key, tag.Value ?? "")
    }
    for (const [tagKey, value] of Object.entries(changes)) {
      if (value === null) {
        tags.delete(tagKey)
      } else {
        tags.set(tagKey, value)
      }
    }
    return tags
  }
}
