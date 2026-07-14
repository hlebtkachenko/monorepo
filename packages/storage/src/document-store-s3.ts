import { createHash } from "node:crypto"
import type { Readable } from "node:stream"
import {
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
  /** Dedicated KMS CMK. When set, `put()` sets SSE-KMS explicitly; presigned POST uploads rely on the bucket's default encryption instead. */
  kmsKeyId?: string
}

function configFromEnv(): S3DocumentStoreConfig {
  const bucket = process.env.DOCUMENTS_BUCKET
  if (!bucket) {
    throw new Error("DOCUMENTS_BUCKET is not set")
  }
  return {
    bucket,
    region: process.env.AWS_REGION,
    endpoint: process.env.S3_ENDPOINT,
    kmsKeyId: process.env.DOCUMENTS_KMS_KEY_ID,
  }
}

function documentKey(
  workspaceId: string,
  sha256Hex: string,
  ext: string,
): string {
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
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: input.disposition,
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
    await this.mergeTags(key, { "deleted-at": null })
  }

  async tagConfirmed(key: string): Promise<void> {
    await this.mergeTags(key, { "confirmed-at": new Date().toISOString() })
  }

  async tagOrphan(key: string): Promise<void> {
    await this.mergeTags(key, { "orphan-at": new Date().toISOString() })
  }

  /**
   * Merges `changes` into the object's existing tag set — a `null` value
   * removes that tag. `PutObjectTagging` REPLACES the whole tag set, so
   * every write reads the current set first and preserves untouched tags.
   *
   * Read-modify-write is non-atomic (no compare-and-swap between the Get and
   * the Put). Acceptable for P0: document tag transitions are app-serialized
   * (e.g. confirm happens once, before any user delete). Revisit if
   * concurrent taggers show up.
   */
  private async mergeTags(
    key: string,
    changes: Record<string, string | null>,
  ): Promise<void> {
    const existing = await this.client.send(
      new GetObjectTaggingCommand({ Bucket: this.bucket, Key: key }),
    )
    const tags = new Map<string, string>()
    for (const tag of existing.TagSet ?? []) {
      if (tag.Key) tags.set(tag.Key, tag.Value ?? "")
    }
    for (const [tagKey, value] of Object.entries(changes)) {
      if (value === null) {
        tags.delete(tagKey)
      } else {
        tags.set(tagKey, value)
      }
    }
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
}
