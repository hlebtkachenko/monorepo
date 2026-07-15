// Pure reaper decision logic — NO AWS SDK import, so the whole delete/undo
// tag-state model is unit-testable without S3. `index.mjs` imports this and
// wraps it with S3 List/GetTagging/DeleteObjects I/O.
//
// Tag-state model (ADR-0031, no Object Lock). Storage owns the S3
// object tags; the reaper reads tag VALUES only (never any DB) and purges by
// age:
//   - `orphan-at`   older than 1h  → purge (bad-magic-byte / rejected upload,
//                                    gone fast — never lingers 60 days).
//   - untagged      older than 24h → purge (client abandoned an upload that was
//                                    never confirmed).
//   - `deleted-at`  older than 60d → purge (user soft-delete past the
//                                    redemption window).
// A live confirmed document (`confirmed-at` set, no `deleted-at`) is NEVER
// purged, whatever its age.
//
// Undo/confirm promote an exact source VersionId into a new current same-key
// version with safe tags. The handler also re-reads the evaluated version's
// tags immediately before deleting and re-runs this same function. Either the
// transition fails because its source was reaped, or its new version survives
// deletion of the old evaluated version.

export const ORPHAN_TTL_MS = 60 * 60 * 1000 // 1 hour
export const UNCONFIRMED_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
export const DELETED_TTL_MS = 60 * 24 * 60 * 60 * 1000 // 60 days

// Decision branches (stable strings — the handler tallies counts per branch
// and the tests assert on them).
export const KEEP_LIVE_CONFIRMED = "keep:live-confirmed"
export const KEEP_ORPHAN_PENDING = "keep:orphan-pending"
export const KEEP_DELETED_PENDING = "keep:deleted-pending"
export const KEEP_RECENT_UNCONFIRMED = "keep:recent-unconfirmed"
export const PURGE_ORPHAN_EXPIRED = "purge:orphan-expired"
export const PURGE_DELETED_EXPIRED = "purge:deleted-expired"
export const PURGE_NEVER_CONFIRMED = "purge:never-confirmed-abandoned"

/**
 * Decide whether a single key should be purged, from its S3 tags + object
 * LastModified + the current time. Deterministic (inject `nowMs`) and pure.
 *
 * @param {{
 *   tags: Record<string, string>,
 *   lastModifiedMs: number,
 *   nowMs: number,
 * }} input
 * @returns {{ purge: boolean, branch: string }}
 */
export function decideReap({ tags, lastModifiedMs, nowMs }) {
  const deletedAt = tags["deleted-at"]
  const orphanAt = tags["orphan-at"]

  // HARD GUARD, checked FIRST: a live confirmed document — `confirmed-at`
  // PRESENT and NOT soft-deleted — is never purged, regardless of age. Keyed
  // on tag PRESENCE, not value truthiness: an empty `confirmed-at=""` must
  // still keep the object (fail toward keep — never delete a live doc over a
  // malformed tag value).
  if ("confirmed-at" in tags && !deletedAt) {
    return { purge: false, branch: KEEP_LIVE_CONFIRMED }
  }

  // Soft-deleted: purge 60 days after the delete tag. This is the ONLY branch
  // that can purge a previously-confirmed object (`confirmed-at` + `deleted-at`
  // both present). Undo (`clearDeletedTag`) removes `deleted-at`, after which
  // the guard above keeps the object — so undo within the window is safe.
  if (deletedAt) {
    return nowMs - Date.parse(deletedAt) >= DELETED_TTL_MS
      ? { purge: true, branch: PURGE_DELETED_EXPIRED }
      : { purge: false, branch: KEEP_DELETED_PENDING }
  }

  // Rejected upload (bad magic bytes / wrong type): purge fast, 1 hour.
  if (orphanAt) {
    return nowMs - Date.parse(orphanAt) >= ORPHAN_TTL_MS
      ? { purge: true, branch: PURGE_ORPHAN_EXPIRED }
      : { purge: false, branch: KEEP_ORPHAN_PENDING }
  }

  // Untagged: never-confirmed, client-abandoned upload. Purge 24 hours after
  // creation (LastModified). SAFE ONLY IF the confirm endpoint tags
  // `confirmed-at` on EVERY kept object at/with the DB write, so a live
  // document is never left untagged (see the invariant note in index.mjs).
  return nowMs - lastModifiedMs >= UNCONFIRMED_TTL_MS
    ? { purge: true, branch: PURGE_NEVER_CONFIRMED }
    : { purge: false, branch: KEEP_RECENT_UNCONFIRMED }
}
