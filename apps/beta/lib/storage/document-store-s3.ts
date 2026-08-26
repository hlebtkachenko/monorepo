import "server-only"

/**
 * The S3 implementation of `BetaDocumentStore`.
 *
 * FENCED, like `db/client.ts`. This is the only module in the app that
 * constructs an `S3Client`, and `eslint.config.js` plus
 * `lib/storage/s3-fence.boundary.test.ts` keep it importable from
 * `lib/storage/**` and `lib/data/**` only. A route that imported it directly
 * would be a route holding a bucket-wide handle with no `OrgScope` in scope —
 * the same failure the database fence exists to prevent, with a longer tail
 * (an object read wrongly is a file downloaded, not a row rendered).
 *
 * CONFIG COMES FROM THE ENVIRONMENT THE CDK STACK SETS. `DOCUMENTS_BUCKET`,
 * `DOCUMENTS_KMS_KEY_ID` and `AWS_REGION` are all wired in
 * `infra/cdk/lib/beta-app-stack.ts`, and the task role there already carries
 * `grantReadWrite` on the bucket plus `grantEncryptDecrypt` on the CMK. There
 * are no credentials to read: the SDK picks up the task role from the container
 * credential provider.
 *
 * MULTIPART, NOT `PutObject`. `Upload` from `@aws-sdk/lib-storage` streams with
 * a bounded window (`partSize` × `queueSize`), so the task's memory ceiling for
 * an upload is ~5 MiB regardless of the file — a plain `PutObject` on a stream
 * needs `ContentLength` up front, and the only way to obtain it is to buffer the
 * whole body, which is exactly the DoS `upload-stream.ts` exists to avoid.
 * `leavePartsOnError: false` means a body that errors (the 25 MiB abort) leaves
 * no incomplete multipart behind.
 */
import { Readable } from "node:stream"

import {
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { Upload } from "@aws-sdk/lib-storage"

import {
  assertKeyBelongsTo,
  documentObjectKey,
  type BetaDocumentStore,
  type PutDocumentInput,
  type PutDocumentResult,
} from "./document-store"

/** 5 MiB is the S3 minimum part size; anything smaller is rejected by the API. */
const PART_SIZE = 5 * 1024 * 1024
/** One part in flight. Beta is one small task; throughput is not the constraint. */
const QUEUE_SIZE = 1

export type S3DocumentStoreConfig = {
  bucket: string
  region: string
  /** Optional: the bucket's default encryption already applies this CMK. */
  kmsKeyId?: string
}

export function readS3DocumentStoreConfig(): S3DocumentStoreConfig {
  const bucket = process.env["DOCUMENTS_BUCKET"]?.trim()
  if (!bucket) {
    throw new Error(
      "DOCUMENTS_BUCKET is not set. The beta task definition sets it from the " +
        "BetaData stack's bucket (infra/cdk/lib/beta-app-stack.ts).",
    )
  }
  const region =
    process.env["AWS_REGION"]?.trim() ??
    process.env["AWS_DEFAULT_REGION"]?.trim()
  if (!region) throw new Error("AWS_REGION is not set.")

  const kmsKeyId = process.env["DOCUMENTS_KMS_KEY_ID"]?.trim()
  return kmsKeyId ? { bucket, region, kmsKeyId } : { bucket, region }
}

export function createS3DocumentStore(
  config: S3DocumentStoreConfig,
  client: S3Client = new S3Client({ region: config.region }),
): BetaDocumentStore {
  return {
    async put(input: PutDocumentInput): Promise<PutDocumentResult> {
      const key = documentObjectKey(input.organizationId, input.extension)

      const upload = new Upload({
        client,
        params: {
          Bucket: config.bucket,
          Key: key,
          Body: input.body,
          // The SNIFFED type. Stored on the object so a future consumer that
          // does not read the row still sees the truth about the bytes.
          ContentType: input.contentType,
          // Belt and braces with the bucket's default encryption: an explicit
          // SSE-KMS request fails loudly if the grant is ever removed, where a
          // default would silently fall back to nothing on a re-created bucket.
          ...(config.kmsKeyId
            ? {
                ServerSideEncryption: "aws:kms" as const,
                SSEKMSKeyId: config.kmsKeyId,
              }
            : {}),
          // NO `Metadata`. The original filename stays in the database: object
          // metadata is visible in every bucket listing and CloudTrail event,
          // and a filename is client business information.
        },
        partSize: PART_SIZE,
        queueSize: QUEUE_SIZE,
        leavePartsOnError: false,
      })

      await upload.done()
      return { key }
    },

    async get(key: string, organizationId: string): Promise<Readable> {
      assertKeyBelongsTo(key, organizationId)
      const response = await client.send(
        new GetObjectCommand({ Bucket: config.bucket, Key: key }),
      )
      const body = response.Body
      if (!body || !(body instanceof Readable)) {
        throw new Error(`document object ${key} has no readable body`)
      }
      return body
    },

    async delete(key: string, organizationId: string): Promise<void> {
      assertKeyBelongsTo(key, organizationId)
      await client.send(
        new DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
      )
    },
  }
}
