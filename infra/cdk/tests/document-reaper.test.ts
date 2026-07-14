import { describe, expect, it } from "vitest"

// @ts-expect-error - .mjs handler helper ships without declaration types
import * as reaper from "../lib/lambda/document-reaper/decide.mjs"

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
