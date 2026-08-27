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
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectVersionsCommand,
  S3Client,
  type ObjectIdentifier,
} from "@aws-sdk/client-s3"
import { Upload } from "@aws-sdk/lib-storage"

import {
  assertKeyBelongsTo,
  documentObjectKey,
  organizationPrefix,
  type BetaDocumentStore,
  type PurgeResult,
  type PutDocumentInput,
  type PutDocumentResult,
} from "./document-store"

/** 5 MiB is the S3 minimum part size; anything smaller is rejected by the API. */
const PART_SIZE = 5 * 1024 * 1024
/** One part in flight. Beta is one small task; throughput is not the constraint. */
const QUEUE_SIZE = 1
/** `DeleteObjects` refuses more than 1000 keys per request. */
const DELETE_BATCH = 1000

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

    async purgeOrganization(organizationId: string): Promise<PurgeResult> {
      // Throws on anything that is not a uuid, so a caller cannot arrive here
      // with a prefix that would list — and then destroy — a wider slice of the
      // bucket than one organization. This is the whole containment check for
      // the purge: unlike `get` / `delete` there is no key to compare against,
      // so the prefix has to be the thing that is provably narrow.
      const prefix = organizationPrefix(organizationId)

      let removed = 0
      let keyMarker: string | undefined
      let versionIdMarker: string | undefined

      do {
        const page = await client.send(
          new ListObjectVersionsCommand({
            Bucket: config.bucket,
            Prefix: prefix,
            KeyMarker: keyMarker,
            VersionIdMarker: versionIdMarker,
          }),
        )

        // BOTH LISTS, NOT JUST `Versions`. A delete marker is itself a version
        // of the object, and leaving them behind leaves the object's history —
        // and, with `expiredObjectDeleteMarker` on the lifecycle rule, a stub
        // that keeps the key visible in a version listing.
        const targets: ObjectIdentifier[] = [
          ...(page.Versions ?? []),
          ...(page.DeleteMarkers ?? []),
        ]
          // Every field on both shapes is optional in the SDK's types, and
          // `ObjectIdentifier.Key` is `string | undefined` — so mapping one to
          // the other COMPILES with no filter at all and sends `{Key:
          // undefined}` to S3. Narrowed by hand because the type system will
          // not do it here.
          .flatMap((entry) =>
            entry.Key !== undefined && entry.VersionId !== undefined
              ? [{ Key: entry.Key, VersionId: entry.VersionId }]
              : [],
          )
          // A listing is a prefix match, and `assertKeyBelongsTo`'s own tests
          // pin that `org/<uuid>-evil/` is a string prefix of `org/<uuid>`.
          // That cannot happen here (the prefix ends in `/`), and it is checked
          // anyway: this loop issues unrecoverable deletes, so it re-proves
          // containment on every key rather than trusting the list.
          .filter((entry) => entry.Key.startsWith(prefix))

        for (let index = 0; index < targets.length; index += DELETE_BATCH) {
          const batch = targets.slice(index, index + DELETE_BATCH)
          const response = await client.send(
            new DeleteObjectsCommand({
              Bucket: config.bucket,
              Delete: { Objects: batch, Quiet: true },
            }),
          )
          // `DeleteObjects` REPORTS PARTIAL FAILURE AS HTTP 200 with a
          // populated `Errors` array — `send()` does not throw. A purge that
          // swallowed that would return a count and a clean conscience while
          // leaving bytes behind, which is the one outcome this method exists
          // to prevent.
          const errors = response.Errors ?? []
          if (errors.length > 0) {
            throw new Error(
              `purge of ${prefix} failed for ${errors.length} object(s): ` +
                `${errors[0]?.Key ?? "?"} ${errors[0]?.Code ?? ""}`.trim(),
            )
          }
          removed += batch.length
        }

        // BOTH MARKERS CARRY FORWARD. Paging a version listing on `KeyMarker`
        // alone re-reads the first page whenever one key has more versions than
        // fit in a page, and the loop never ends.
        keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined
        versionIdMarker = page.IsTruncated
          ? page.NextVersionIdMarker
          : undefined
      } while (keyMarker !== undefined || versionIdMarker !== undefined)

      return { removed }
    },
  }
}
