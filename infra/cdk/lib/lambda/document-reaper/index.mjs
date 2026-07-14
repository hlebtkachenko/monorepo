// Document reaper — the SOLE S3-delete principal for the documents bucket.
//
// Design A (PLAN §1, §3): the documents bucket is a WORKING store, not the
// statutory archive of record, so there is NO Object Lock. Tamper/wipe
// protection is IAM (the shared app/api/admin + Brain task role holds Get +
// Put + tag but NEVER Delete) + versioning + this ONE dedicated reaper. This
// Lambda's execution role is the only principal in the account that holds
// s3:DeleteObject / s3:DeleteObjectVersion on the bucket.
//
// An hourly EventBridge schedule invokes it. It reads S3 object tag VALUES
// only (never any DB — that avoids coupling to the Inbox track) and purges by
// age, per decide.mjs:
//   - `orphan-at`  older than 1h  → purge (bad-magic-byte / rejected upload)
//   - untagged     older than 24h → purge (never-confirmed abandoned upload)
//   - `deleted-at` older than 60d → purge (user soft-delete past redemption)
// A live confirmed doc (`confirmed-at`, no `deleted-at`) is NEVER purged.
//
// Every decision is pinned to a concrete S3 VersionId. Abandoned/orphaned
// current versions delete only themselves, so an older confirmed version can
// never be collateral damage. An expired soft-delete removes the evaluated
// version plus unambiguously older history, while preserving every newer
// concurrent re-upload. Old history is deleted first; only a fully successful
// history phase permits a separate final request for the evaluated current
// version. Tags for that VersionId are re-read before deletion; drift fails
// toward keep. Confirm/undo create a new current same-key version, so whichever
// operation wins the race leaves acknowledged bytes available.
//
// CROSS-TRACK INVARIANT (contract the P3 confirm endpoint MUST honor; NOT
// enforced here): the "untagged > 24h → purge" branch is safe ONLY if confirm
// promotes EVERY kept object into a new `confirmed-at` current version before
// the DB write, so a live document is never left untagged and reaped as
// "abandoned". If confirm ever persists a row before that copy succeeds, the
// underlying document remains reapable — this branch trusts the tag, not the DB.
//
// No KMS: deleting an SSE-KMS object does not decrypt it, so the reaper role
// carries no kms:* — it only enumerates, reads tags, and deletes.
//
// Required env var:
//   DOCUMENTS_BUCKET  the documents bucket name.

import {
  DeleteObjectsCommand,
  GetObjectTaggingCommand,
  ListObjectVersionsCommand,
  S3Client,
} from "@aws-sdk/client-s3"

import {
  assertSweepSucceeded,
  processEvaluatedVersion,
  throwOnDeleteErrors,
} from "./sweep.mjs"

const s3 = new S3Client({})
const DOCUMENTS_BUCKET = process.env.DOCUMENTS_BUCKET

// DeleteObjects caps at 1000 objects per request.
const DELETE_BATCH = 1000

function log(event, fields) {
  console.log(JSON.stringify({ event, ...fields }))
}

async function readTags(key, versionId) {
  const res = await s3.send(
    new GetObjectTaggingCommand({
      Bucket: DOCUMENTS_BUCKET,
      Key: key,
      VersionId: versionId,
    }),
  )
  const tags = {}
  for (const t of res.TagSet ?? []) {
    if (t.Key != null) tags[t.Key] = t.Value ?? ""
  }
  return tags
}

function isNotFoundError(error) {
  return (
    error?.name === "NotFound" ||
    error?.name === "NoSuchKey" ||
    error?.name === "NoSuchVersion" ||
    error?.$metadata?.httpStatusCode === 404
  )
}

// List exact-key history. Prefix matching alone is insufficient because one
// content-addressed key can be a prefix of another.
async function listVersionHistory(key) {
  let keyMarker
  let versionIdMarker
  const history = []
  do {
    const listed = await s3.send(
      new ListObjectVersionsCommand({
        Bucket: DOCUMENTS_BUCKET,
        Prefix: key,
        KeyMarker: keyMarker,
        VersionIdMarker: versionIdMarker,
      }),
    )
    for (const version of listed.Versions ?? []) {
      if (version.Key !== key || !version.VersionId || !version.LastModified) {
        continue
      }
      history.push({
        key,
        versionId: version.VersionId,
        lastModifiedMs: version.LastModified.getTime(),
      })
    }
    for (const marker of listed.DeleteMarkers ?? []) {
      if (marker.Key !== key || !marker.VersionId || !marker.LastModified) {
        continue
      }
      history.push({
        key,
        versionId: marker.VersionId,
        lastModifiedMs: marker.LastModified.getTime(),
      })
    }

    keyMarker = listed.IsTruncated ? listed.NextKeyMarker : undefined
    versionIdMarker = listed.IsTruncated
      ? listed.NextVersionIdMarker
      : undefined
  } while (keyMarker || versionIdMarker)
  return history
}

async function deleteVersions(versions) {
  let deleted = 0
  for (let i = 0; i < versions.length; i += DELETE_BATCH) {
    const batch = versions.slice(i, i + DELETE_BATCH)
    const objects = batch.map((version) => {
      const { key, versionId } = version
      return { Key: key, VersionId: versionId }
    })
    // Quiet:true returns only per-object failures. Any reported failure must
    // throw into the per-key catch and later the aggregate Lambda error. For
    // soft-deleted objects, history and evaluated-current requests are
    // separated, so a partial history failure leaves current intact.
    const res = await s3.send(
      new DeleteObjectsCommand({
        Bucket: DOCUMENTS_BUCKET,
        Delete: { Objects: objects, Quiet: true },
      }),
    )
    const failed = res.Errors ?? []
    if (failed.length > 0) {
      const first = batch[0]
      log("reap-delete-errors", {
        key: first?.["key"],
        failed: failed.length,
        firstError: { code: failed[0]?.Code, message: failed[0]?.Message },
      })
    }
    throwOnDeleteErrors(failed)
    deleted += batch.length
  }
  return deleted
}

export const handler = async () => {
  if (!DOCUMENTS_BUCKET) {
    throw new Error("document-reaper: DOCUMENTS_BUCKET env var is required.")
  }

  // One wall clock for the whole sweep — deterministic, and conservative (an
  // object crossing a threshold mid-run is evaluated at run-start time).
  const nowMs = Date.now()
  const counts = {
    scanned: 0,
    purged: 0,
    versionsDeleted: 0,
    skippedByRecheck: 0,
    errors: 0,
    byBranch: {},
  }

  let keyMarker
  let versionIdMarker
  do {
    const listed = await s3.send(
      new ListObjectVersionsCommand({
        Bucket: DOCUMENTS_BUCKET,
        KeyMarker: keyMarker,
        VersionIdMarker: versionIdMarker,
      }),
    )

    for (const version of listed.Versions ?? []) {
      const key = version.Key
      if (
        !version.IsLatest ||
        !key ||
        !version.VersionId ||
        !version.LastModified
      ) {
        continue
      }
      counts.scanned += 1

      // Isolate per-key failures: a transient S3 error (throttle/5xx/404 from a
      // concurrent change) must NOT abort the whole sweep and skip every later
      // key. Count + log it and move on; the direction is safe (nothing gets
      // over-deleted — a purge only proceeds after a clean read + recheck).
      try {
        const evaluated = {
          key,
          versionId: version.VersionId,
          lastModifiedMs: version.LastModified.getTime(),
        }
        const result = await processEvaluatedVersion({
          evaluated,
          nowMs,
          readTags,
          listVersionHistory,
          deleteVersions,
          isNotFoundError,
        })
        if (result.branch) {
          counts.byBranch[result.branch] =
            (counts.byBranch[result.branch] ?? 0) + 1
        }
        if (result.skippedByRecheck) {
          counts.skippedByRecheck += 1
          log("reap-skip-recheck", {
            key,
            versionId: version.VersionId,
            branch: result.branch,
            recheckBranch: result.recheckBranch,
          })
          continue
        }
        if (!result.purged) continue

        counts.purged += 1
        counts.versionsDeleted += result.versionsDeleted
        log("reap-purge", {
          key,
          versionId: version.VersionId,
          branch: result.branch,
          versions: result.versionsDeleted,
        })
      } catch (err) {
        counts.errors += 1
        log("reap-key-error", { key, error: err?.message ?? String(err) })
      }
    }

    keyMarker = listed.IsTruncated ? listed.NextKeyMarker : undefined
    versionIdMarker = listed.IsTruncated
      ? listed.NextVersionIdMarker
      : undefined
  } while (keyMarker || versionIdMarker)

  log("reap-summary", counts)
  // Per-key isolation covers the full sweep, then the aggregate failure is
  // rethrown so Lambda's Errors metric increments and the alarm fires.
  assertSweepSucceeded(counts)
  return counts
}
