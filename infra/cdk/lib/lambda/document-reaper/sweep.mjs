import {
  decideReap,
  PURGE_DELETED_EXPIRED,
  PURGE_NEVER_CONFIRMED,
  PURGE_ORPHAN_EXPIRED,
} from "./decide.mjs"

const SINGLE_VERSION_BRANCHES = new Set([
  PURGE_NEVER_CONFIRMED,
  PURGE_ORPHAN_EXPIRED,
])

function tagsEqual(left, right) {
  const leftEntries = Object.entries(left).sort(([a], [b]) =>
    a.localeCompare(b),
  )
  const rightEntries = Object.entries(right).sort(([a], [b]) =>
    a.localeCompare(b),
  )
  return JSON.stringify(leftEntries) === JSON.stringify(rightEntries)
}

export function throwOnDeleteErrors(errors) {
  if (errors.length === 0) return
  const error = new Error(
    `document-reaper: DeleteObjects reported ${errors.length} partial failure(s)`,
  )
  error.deleteErrors = errors
  throw error
}

export function assertSweepSucceeded(counts) {
  if (counts.errors === 0) return
  const error = new Error(
    `document-reaper: ${counts.errors} key operation(s) failed; see reap-key-error logs`,
  )
  error.counts = counts
  throw error
}

/**
 * Select the soft-deleted version and only unambiguously older history.
 * Version IDs are opaque, and S3 timestamps can tie, so same-millisecond
 * siblings are preserved unless they are the evaluated version itself.
 */
export function selectDeletedHistory(evaluated, history) {
  const { key: objectKey, versionId, lastModifiedMs } = evaluated
  const evaluatedStillExists = history.some((entry) => {
    const { key: entryKey, versionId: entryVersionId } = entry
    return entryKey === objectKey && entryVersionId === versionId
  })
  if (!evaluatedStillExists) return null

  return history.filter((entry) => {
    const {
      key: entryKey,
      versionId: entryVersionId,
      lastModifiedMs: entryLastModifiedMs,
    } = entry
    return (
      entryKey === objectKey &&
      (entryVersionId === versionId || entryLastModifiedMs < lastModifiedMs)
    )
  })
}

/**
 * Evaluate and purge one version-pinned current object. Every S3 operation is
 * injected so the race-sensitive behavior is testable without AWS.
 */
export async function processEvaluatedVersion({
  evaluated,
  nowMs,
  readTags,
  listVersionHistory,
  deleteVersions,
  isNotFoundError,
}) {
  const { key: objectKey, versionId, lastModifiedMs } = evaluated
  let initialTags
  try {
    initialTags = await readTags(objectKey, versionId)
  } catch (error) {
    if (isNotFoundError(error)) {
      return { purged: false, skippedByRecheck: true, versionsDeleted: 0 }
    }
    throw error
  }

  const decision = decideReap({ tags: initialTags, lastModifiedMs, nowMs })
  if (!decision.purge) {
    return {
      branch: decision.branch,
      purged: false,
      skippedByRecheck: false,
      versionsDeleted: 0,
    }
  }

  let olderVersions
  if (decision.branch === PURGE_DELETED_EXPIRED) {
    const history = await listVersionHistory(objectKey)
    const selected = selectDeletedHistory(evaluated, history)
    if (selected === null) {
      return {
        branch: decision.branch,
        purged: false,
        skippedByRecheck: true,
        versionsDeleted: 0,
      }
    }
    olderVersions = selected.filter((entry) => entry.versionId !== versionId)
  } else if (!SINGLE_VERSION_BRANCHES.has(decision.branch)) {
    throw new Error(
      `document-reaper: unsupported purge branch ${decision.branch}`,
    )
  }

  // Re-read the exact evaluated version after any history pagination and
  // immediately before deletion. Any tag transition or concurrent removal
  // fails toward keep.
  let freshTags
  try {
    freshTags = await readTags(objectKey, versionId)
  } catch (error) {
    if (isNotFoundError(error)) {
      return {
        branch: decision.branch,
        purged: false,
        skippedByRecheck: true,
        versionsDeleted: 0,
      }
    }
    throw error
  }

  const recheck = decideReap({ tags: freshTags, lastModifiedMs, nowMs })
  if (
    !tagsEqual(initialTags, freshTags) ||
    !recheck.purge ||
    recheck.branch !== decision.branch
  ) {
    return {
      branch: decision.branch,
      recheckBranch: recheck.branch,
      purged: false,
      skippedByRecheck: true,
      versionsDeleted: 0,
    }
  }

  let versionsDeleted = 0
  if (decision.branch === PURGE_DELETED_EXPIRED) {
    // Delete old history first and require a completely clean response. S3
    // gives DeleteObjects no execution-order guarantee, so the evaluated
    // current version must be isolated in a final request. If any history
    // member fails, deleteVersions throws and the recoverable current version
    // remains intact for the next run.
    if (olderVersions.length > 0) {
      versionsDeleted += await deleteVersions(olderVersions)
    }
    versionsDeleted += await deleteVersions([evaluated])
  } else {
    versionsDeleted = await deleteVersions([evaluated])
  }
  return {
    branch: decision.branch,
    purged: true,
    skippedByRecheck: false,
    versionsDeleted,
  }
}
