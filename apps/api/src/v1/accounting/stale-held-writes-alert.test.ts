import { describe, expect, it, vi } from "vitest"

import type { StaleHeldWriteQueueStats } from "@workspace/db"
import {
  checkStaleHeldWrites,
  type StaleHeldWritesAlertInfo,
} from "./stale-held-writes-alert"

const NOW = new Date("2026-07-09T12:00:00.000Z")
const fixedNow = () => NOW

function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000)
}

describe("checkStaleHeldWrites", () => {
  it("fires notifyStale with count + oldest age when the queue has entries older than the threshold", async () => {
    const stats: StaleHeldWriteQueueStats = {
      staleCount: 3,
      oldestCreatedAt: hoursAgo(30),
    }
    const getStats = vi.fn().mockResolvedValue(stats)
    const notifyStale = vi.fn<(info: StaleHeldWritesAlertInfo) => void>()

    const result = await checkStaleHeldWrites({
      now: fixedNow,
      thresholdHours: 24,
      getStats,
      notifyStale,
    })

    expect(result).toEqual(stats)
    expect(notifyStale).toHaveBeenCalledTimes(1)
    const info = notifyStale.mock.calls[0]?.[0]
    expect(info?.staleCount).toBe(3)
    expect(info?.oldestAgeHours).toBeCloseTo(30, 5)

    // The cutoff handed to the store is now - thresholdHours.
    const cutoff = getStats.mock.calls[0]?.[0] as Date
    expect(cutoff.toISOString()).toBe(hoursAgo(24).toISOString())
  })

  it("does NOT fire when the queue has no stale entries", async () => {
    const getStats = vi.fn().mockResolvedValue({
      staleCount: 0,
      oldestCreatedAt: null,
    } satisfies StaleHeldWriteQueueStats)
    const notifyStale = vi.fn()

    await checkStaleHeldWrites({
      now: fixedNow,
      thresholdHours: 24,
      getStats,
      notifyStale,
    })

    expect(notifyStale).not.toHaveBeenCalled()
  })

  it("swallows a throwing notifyStale — the check still resolves with the stats, error never propagates", async () => {
    const stats: StaleHeldWriteQueueStats = {
      staleCount: 1,
      oldestCreatedAt: hoursAgo(48),
    }
    const getStats = vi.fn().mockResolvedValue(stats)
    const notifyStale = vi.fn(() => {
      throw new Error("bot unreachable")
    })

    const result = await checkStaleHeldWrites({
      now: fixedNow,
      thresholdHours: 24,
      getStats,
      notifyStale,
    })

    expect(result).toEqual(stats)
    expect(notifyStale).toHaveBeenCalledTimes(1)
  })
})
