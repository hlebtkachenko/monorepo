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
// "Purge" = delete ALL versions (and delete markers) of the key — a true byte
// purge, since versioning is ON. Undo is preserved because storage's
// `clearDeletedTag` removes `deleted-at` before the reaper fires, AND because
// the handler re-reads tags immediately before deleting and re-runs the same
// pure decision (TOCTOU guard): a document undone or confirmed in the scan
// window is skipped.
//
// CROSS-TRACK INVARIANT (contract the P3 confirm endpoint MUST honor; NOT
// enforced here): the "untagged > 24h → purge" branch is safe ONLY if confirm
// applies `confirmed-at` to EVERY kept object at/with the DB write, so a live
// document is never left untagged and reaped as "abandoned". If confirm ever
// persists a row without first tagging `confirmed-at`, that document becomes
// reapable — this branch trusts the tag, not the DB.
//
// No KMS: deleting an SSE-KMS object does not decrypt it, so the reaper role
// carries no kms:* — it only enumerates, reads tags, and deletes.
//
// Required env var:
//   DOCUMENTS_BUCKET  the documents bucket name.

import {
  DeleteObjectsCommand,
  GetObjectTaggingCommand,
  ListObjectsV2Command,
  ListObjectVersionsCommand,
  S3Client,
} from "@aws-sdk/client-s3"

import { decideReap } from "./decide.mjs"

const s3 = new S3Client({})
const DOCUMENTS_BUCKET = process.env.DOCUMENTS_BUCKET

// DeleteObjects caps at 1000 objects per request.
const DELETE_BATCH = 1000

function log(event, fields) {
  console.log(JSON.stringify({ event, ...fields }))
}

async function readTags(key) {
  const res = await s3.send(
    new GetObjectTaggingCommand({ Bucket: DOCUMENTS_BUCKET, Key: key }),
  )
  const tags = {}
  for (const t of res.TagSet ?? []) {
    if (t.Key != null) tags[t.Key] = t.Value ?? ""
  }
  return tags
}

// Delete every version + delete-marker of a single key = a true byte purge
// (versioning is ON). ListObjectVersions matches by PREFIX, so filter to the
// EXACT key — a content-addressed key could be a prefix of another.
async function purgeAllVersions(key) {
  let keyMarker
  let versionIdMarker
  let deleted = 0
  do {
    const listed = await s3.send(
      new ListObjectVersionsCommand({
        Bucket: DOCUMENTS_BUCKET,
        Prefix: key,
        KeyMarker: keyMarker,
        VersionIdMarker: versionIdMarker,
      }),
    )
    const objects = [
      ...(listed.Versions ?? []),
      ...(listed.DeleteMarkers ?? []),
    ]
      .filter((v) => v.Key === key && v.VersionId)
      .map((v) => ({ Key: v.Key, VersionId: v.VersionId }))

    for (let i = 0; i < objects.length; i += DELETE_BATCH) {
      const batch = objects.slice(i, i + DELETE_BATCH)
      // Quiet:true returns only per-object failures. A throttle/5xx on a
      // version is a SAFE direction (the object survives), but must NOT be
      // counted as deleted, and must surface — the reaper is the only delete
      // path, so a persistently-failing delete needs to be visible.
      const res = await s3.send(
        new DeleteObjectsCommand({
          Bucket: DOCUMENTS_BUCKET,
          Delete: { Objects: batch, Quiet: true },
        }),
      )
      const failed = res.Errors ?? []
      if (failed.length > 0) {
        log("reap-delete-errors", {
          key,
          failed: failed.length,
          firstError: { code: failed[0]?.Code, message: failed[0]?.Message },
        })
      }
      deleted += batch.length - failed.length
    }

    keyMarker = listed.IsTruncated ? listed.NextKeyMarker : undefined
    versionIdMarker = listed.IsTruncated
      ? listed.NextVersionIdMarker
      : undefined
  } while (keyMarker || versionIdMarker)
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

  let continuationToken
  do {
    const listed = await s3.send(
      new ListObjectsV2Command({
        Bucket: DOCUMENTS_BUCKET,
        ContinuationToken: continuationToken,
      }),
    )

    for (const obj of listed.Contents ?? []) {
      const key = obj.Key
      if (!key) continue
      counts.scanned += 1

      // Isolate per-key failures: a transient S3 error (throttle/5xx/404 from a
      // concurrent change) must NOT abort the whole sweep and skip every later
      // key. Count + log it and move on; the direction is safe (nothing gets
      // over-deleted — a purge only proceeds after a clean read + recheck).
      try {
        const lastModifiedMs = obj.LastModified
          ? new Date(obj.LastModified).getTime()
          : nowMs
        const tags = await readTags(key)
        const decision = decideReap({ tags, lastModifiedMs, nowMs })
        counts.byBranch[decision.branch] =
          (counts.byBranch[decision.branch] ?? 0) + 1

        if (!decision.purge) continue

        // TOCTOU guard for undo: re-read tags immediately before deleting and
        // re-run the SAME pure decision. If storage cleared `deleted-at` (undo)
        // or tagged `confirmed-at` in the window since the first read, the
        // decision flips to keep and we skip — a live/undone doc is never purged.
        const freshTags = await readTags(key)
        const recheck = decideReap({ tags: freshTags, lastModifiedMs, nowMs })
        if (!recheck.purge) {
          counts.skippedByRecheck += 1
          log("reap-skip-recheck", {
            key,
            firstBranch: decision.branch,
            recheckBranch: recheck.branch,
          })
          continue
        }

        const versions = await purgeAllVersions(key)
        counts.purged += 1
        counts.versionsDeleted += versions
        log("reap-purge", { key, branch: recheck.branch, versions })
      } catch (err) {
        counts.errors += 1
        log("reap-key-error", { key, error: err?.message ?? String(err) })
      }
    }

    continuationToken = listed.IsTruncated
      ? listed.NextContinuationToken
      : undefined
  } while (continuationToken)

  log("reap-summary", counts)
  return counts
}
