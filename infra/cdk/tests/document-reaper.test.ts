import { describe, expect, it } from "vitest"

// @ts-expect-error - .mjs handler helper ships without declaration types
import * as reaper from "../lib/lambda/document-reaper/decide.mjs"
// @ts-expect-error - .mjs handler helper ships without declaration types
import * as sweep from "../lib/lambda/document-reaper/sweep.mjs"

const {
  decideReap,
  KEEP_DELETED_PENDING,
  KEEP_LIVE_CONFIRMED,
  KEEP_ORPHAN_PENDING,
  KEEP_RECENT_UNCONFIRMED,
  PURGE_DELETED_EXPIRED,
  PURGE_NEVER_CONFIRMED,
  PURGE_ORPHAN_EXPIRED,
} = reaper as {
  decideReap: (input: {
    tags: Record<string, string>
    lastModifiedMs: number
    nowMs: number
  }) => { purge: boolean; branch: string }
  KEEP_DELETED_PENDING: string
  KEEP_LIVE_CONFIRMED: string
  KEEP_ORPHAN_PENDING: string
  KEEP_RECENT_UNCONFIRMED: string
  PURGE_DELETED_EXPIRED: string
  PURGE_NEVER_CONFIRMED: string
  PURGE_ORPHAN_EXPIRED: string
}

interface VersionRef {
  key: string
  versionId: string
  lastModifiedMs: number
}

type ProcessResult = {
  branch?: string
  recheckBranch?: string
  purged: boolean
  skippedByRecheck: boolean
  versionsDeleted: number
}

const { assertSweepSucceeded, processEvaluatedVersion, throwOnDeleteErrors } =
  sweep as {
    processEvaluatedVersion(input: {
      evaluated: VersionRef
      nowMs: number
      readTags: (
        objectKey: string,
        versionId: string,
      ) => Promise<Record<string, string>>
      listVersionHistory: (objectKey: string) => Promise<VersionRef[]>
      deleteVersions: (versions: VersionRef[]) => Promise<number>
      isNotFoundError: (error: unknown) => boolean
    }): Promise<ProcessResult>
    throwOnDeleteErrors(errors: Array<{ Code?: string }>): void
    assertSweepSucceeded(counts: { errors: number }): void
  }

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
// Fixed clock so every case is deterministic (nowMs injected, never Date.now()).
const NOW = Date.parse("2026-07-14T12:00:00.000Z")

type Decision = { purge: boolean; branch: string }

function decide(tags: Record<string, string>, lastModifiedMs = NOW): Decision {
  return decideReap({ tags, lastModifiedMs, nowMs: NOW })
}

function ago(ms: number): string {
  return new Date(NOW - ms).toISOString()
}

describe("document reaper — decideReap (delete/undo tag-state model, PLAN §3)", () => {
  it("orphan-at 2h old → PURGE (rejected upload, gone fast)", () => {
    const d = decide({ "orphan-at": ago(2 * HOUR) })
    expect(d.purge).toBe(true)
    expect(d.branch).toBe(PURGE_ORPHAN_EXPIRED)
  })

  it("orphan-at 30m old → KEEP (inside the 1h window)", () => {
    const d = decide({ "orphan-at": ago(30 * 60 * 1000) })
    expect(d.purge).toBe(false)
    expect(d.branch).toBe(KEEP_ORPHAN_PENDING)
  })

  it("untagged 25h old → PURGE (never-confirmed abandoned upload)", () => {
    const d = decide({}, NOW - 25 * HOUR)
    expect(d.purge).toBe(true)
    expect(d.branch).toBe(PURGE_NEVER_CONFIRMED)
  })

  it("untagged 1h old → KEEP (inside the 24h abandon window)", () => {
    const d = decide({}, NOW - 1 * HOUR)
    expect(d.purge).toBe(false)
    expect(d.branch).toBe(KEEP_RECENT_UNCONFIRMED)
  })

  it("deleted-at 61d old → PURGE (soft-delete past the 60d redemption window)", () => {
    const d = decide({ "deleted-at": ago(61 * DAY) })
    expect(d.purge).toBe(true)
    expect(d.branch).toBe(PURGE_DELETED_EXPIRED)
  })

  it("deleted-at 59d old → KEEP (still inside the redemption window)", () => {
    const d = decide({ "deleted-at": ago(59 * DAY) })
    expect(d.purge).toBe(false)
    expect(d.branch).toBe(KEEP_DELETED_PENDING)
  })

  it("confirmed-at with no deleted-at → KEEP always (live document, any age)", () => {
    // A live confirmed doc is never purged, even if its object is ancient.
    const d = decide({ "confirmed-at": ago(999 * DAY) }, NOW - 999 * DAY)
    expect(d.purge).toBe(false)
    expect(d.branch).toBe(KEEP_LIVE_CONFIRMED)
  })

  it("empty confirmed-at='' still KEEPs an old object (guard keys on presence, not value)", () => {
    // The guard checks tag PRESENCE, not truthiness: a malformed empty
    // confirmed-at must never let a (possibly live) doc fall through to the
    // untagged-24h purge. Fail toward keep.
    const d = decide({ "confirmed-at": "" }, NOW - 999 * DAY)
    expect(d.purge).toBe(false)
    expect(d.branch).toBe(KEEP_LIVE_CONFIRMED)
  })

  it("confirmed-at + deleted-at 61d → PURGE (soft-deleted a once-live doc, window elapsed)", () => {
    // deleted-at wins over the live-confirmed guard once it is present: the
    // user soft-deleted a previously-confirmed document and the 60d window
    // passed.
    const d = decide({
      "confirmed-at": ago(200 * DAY),
      "deleted-at": ago(61 * DAY),
    })
    expect(d.purge).toBe(true)
    expect(d.branch).toBe(PURGE_DELETED_EXPIRED)
  })

  it("undo re-adds no tag but removing deleted-at reverts a once-doomed doc to KEEP", () => {
    // Models `clearDeletedTag`: a confirmed doc whose deleted-at was cleared
    // (undo) still carries confirmed-at → the live-confirmed guard keeps it,
    // even though it is 61 days old. This is why undo is safe.
    const d = decide({ "confirmed-at": ago(200 * DAY) }, NOW - 200 * DAY)
    expect(d.purge).toBe(false)
    expect(d.branch).toBe(KEEP_LIVE_CONFIRMED)
  })

  it("threshold boundaries are inclusive (>= TTL purges exactly at the edge)", () => {
    expect(decide({ "orphan-at": ago(1 * HOUR) }).purge).toBe(true)
    expect(decide({ "deleted-at": ago(60 * DAY) }).purge).toBe(true)
    expect(decide({}, NOW - 24 * HOUR).purge).toBe(true)
  })
})

describe("document reaper — version-pinned sweep", () => {
  const objectKey = "documents/workspace/hash.pdf"
  const evaluated = (versionId: string, ageMs: number): VersionRef => ({
    key: objectKey,
    versionId,
    lastModifiedMs: NOW - ageMs,
  })
  const notFound = (error: unknown): boolean =>
    error instanceof Error && error.name === "NoSuchVersion"

  function dependencies(input: {
    tagReads: Array<Record<string, string> | Error>
    history?: VersionRef[]
    deleteOutcomes?: Array<number | Error>
  }) {
    const tagReads = [...input.tagReads]
    const deleteOutcomes = [...(input.deleteOutcomes ?? [])]
    const deleted: VersionRef[][] = []
    return {
      deleted,
      readTags: async () => {
        const next = tagReads.shift()
        if (next instanceof Error) throw next
        if (!next) throw new Error("unexpected tag read")
        return next
      },
      listVersionHistory: async () => input.history ?? [],
      deleteVersions: async (versions: VersionRef[]) => {
        deleted.push(versions)
        const outcome = deleteOutcomes.shift()
        if (outcome instanceof Error) throw outcome
        return outcome ?? versions.length
      },
      isNotFoundError: notFound,
    }
  }

  it("deletes only an abandoned current overwrite, preserving an older confirmed version", async () => {
    const deps = dependencies({ tagReads: [{}, {}] })
    const current = evaluated("abandoned-current", 25 * HOUR)

    const result = await processEvaluatedVersion({
      evaluated: current,
      nowMs: NOW,
      ...deps,
    })

    expect(result.purged).toBe(true)
    expect(deps.deleted).toEqual([[current]])
  })

  it("deletes only an orphan current overwrite, preserving an older confirmed version", async () => {
    const tags = { "orphan-at": ago(2 * HOUR) }
    const deps = dependencies({ tagReads: [tags, tags] })
    const current = evaluated("orphan-current", 3 * HOUR)

    const result = await processEvaluatedVersion({
      evaluated: current,
      nowMs: NOW,
      ...deps,
    })

    expect(result.purged).toBe(true)
    expect(deps.deleted).toEqual([[current]])
  })

  it("purges deleted history but preserves a newer concurrent re-upload", async () => {
    const tags = {
      "confirmed-at": ago(200 * DAY),
      "deleted-at": ago(61 * DAY),
    }
    const deletedVersion = evaluated("deleted", 100 * DAY)
    const newer = evaluated("new-live", 1 * HOUR)
    const older = evaluated("old-live", 200 * DAY)
    const oldMarker = evaluated("old-marker", 300 * DAY)
    const deps = dependencies({
      tagReads: [tags, tags],
      history: [newer, deletedVersion, older, oldMarker],
    })

    await processEvaluatedVersion({
      evaluated: deletedVersion,
      nowMs: NOW,
      ...deps,
    })

    expect(deps.deleted).toHaveLength(2)
    expect(deps.deleted[0]?.map(({ versionId }) => versionId).sort()).toEqual([
      "old-live",
      "old-marker",
    ])
    expect(deps.deleted[1]).toEqual([deletedVersion])
  })

  it("never attempts the evaluated current delete when an older-history batch partially fails", async () => {
    const tags = { "deleted-at": ago(61 * DAY) }
    const deletedVersion = evaluated("deleted-current", 100 * DAY)
    const older = evaluated("older", 200 * DAY)
    let partialFailure: Error | undefined
    try {
      throwOnDeleteErrors([{ Code: "InternalError" }])
    } catch (error) {
      partialFailure = error as Error
    }
    if (!partialFailure) throw new Error("expected partial delete failure")
    const deps = dependencies({
      tagReads: [tags, tags],
      history: [deletedVersion, older],
      deleteOutcomes: [partialFailure],
    })

    await expect(
      processEvaluatedVersion({
        evaluated: deletedVersion,
        nowMs: NOW,
        ...deps,
      }),
    ).rejects.toThrow(/partial failure/)

    expect(deps.deleted).toEqual([[older]])
  })

  it("turns accumulated per-key errors into a Lambda error signal after the sweep", () => {
    expect(() => assertSweepSucceeded({ errors: 0 })).not.toThrow()
    expect(() => assertSweepSucceeded({ errors: 1 })).toThrow(
      /1 key operation.*failed/,
    )
  })

  it("never deletes a same-millisecond upload racing after evaluation", async () => {
    const tags = { "deleted-at": ago(61 * DAY) }
    const deletedVersion = evaluated("deleted", 100 * DAY)
    const racing = { ...deletedVersion, versionId: "racing-newer" }
    const deps = dependencies({
      tagReads: [tags, tags],
      history: [racing, deletedVersion],
    })

    await processEvaluatedVersion({
      evaluated: deletedVersion,
      nowMs: NOW,
      ...deps,
    })

    expect(deps.deleted[0]).toEqual([deletedVersion])
  })

  it("skips when tags drift between evaluation and deletion", async () => {
    const deps = dependencies({
      tagReads: [
        { "orphan-at": ago(2 * HOUR) },
        { "confirmed-at": ago(1 * HOUR) },
      ],
    })

    const result = await processEvaluatedVersion({
      evaluated: evaluated("confirmed-during-sweep", 3 * HOUR),
      nowMs: NOW,
      ...deps,
    })

    expect(result.skippedByRecheck).toBe(true)
    expect(deps.deleted).toEqual([])
  })

  it("skips when the evaluated deleted version disappears from history", async () => {
    const tags = { "deleted-at": ago(61 * DAY) }
    const deps = dependencies({
      tagReads: [tags, tags],
      history: [evaluated("different-version", 200 * DAY)],
    })

    const result = await processEvaluatedVersion({
      evaluated: evaluated("gone", 100 * DAY),
      nowMs: NOW,
      ...deps,
    })

    expect(result.skippedByRecheck).toBe(true)
    expect(deps.deleted).toEqual([])
  })

  it("skips conservatively when the pinned version vanishes before recheck", async () => {
    const missing = new Error("gone")
    missing.name = "NoSuchVersion"
    const deps = dependencies({
      tagReads: [{ "orphan-at": ago(2 * HOUR) }, missing],
    })

    const result = await processEvaluatedVersion({
      evaluated: evaluated("gone", 3 * HOUR),
      nowMs: NOW,
      ...deps,
    })

    expect(result.skippedByRecheck).toBe(true)
    expect(deps.deleted).toEqual([])
  })
})
