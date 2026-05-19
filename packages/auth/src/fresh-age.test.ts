import { describe, expect, it } from "vitest"
import { isFreshSession, FRESH_AGE_MS } from "./fresh-age"

const NOW = 1_700_000_000_000 // fixed epoch for determinism

describe("isFreshSession", () => {
  it("returns true when session was updated 1 hour ago", () => {
    const updatedAt = new Date(NOW - 60 * 60 * 1000)
    expect(isFreshSession(updatedAt, NOW)).toBe(true)
  })

  it("returns true when session was updated exactly at the freshness boundary", () => {
    const updatedAt = new Date(NOW - FRESH_AGE_MS)
    expect(isFreshSession(updatedAt, NOW)).toBe(true)
  })

  it("returns false when session was updated 25 hours ago (stale)", () => {
    const updatedAt = new Date(NOW - 25 * 60 * 60 * 1000)
    expect(isFreshSession(updatedAt, NOW)).toBe(false)
  })

  it("returns false when session was updated 1 ms past the freshness boundary", () => {
    const updatedAt = new Date(NOW - FRESH_AGE_MS - 1)
    expect(isFreshSession(updatedAt, NOW)).toBe(false)
  })

  it("accepts an ISO string as updatedAt", () => {
    const updatedAt = new Date(NOW - 30 * 60 * 1000).toISOString()
    expect(isFreshSession(updatedAt, NOW)).toBe(true)
  })

  it("returns false for an old ISO string (>24h)", () => {
    const updatedAt = new Date(NOW - 48 * 60 * 60 * 1000).toISOString()
    expect(isFreshSession(updatedAt, NOW)).toBe(false)
  })

  it("uses Date.now() when no clock is injected (smoke)", () => {
    const recentDate = new Date()
    expect(isFreshSession(recentDate)).toBe(true)
  })
})
