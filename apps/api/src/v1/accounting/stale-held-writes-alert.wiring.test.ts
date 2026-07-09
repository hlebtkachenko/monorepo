import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const dbMock = vi.hoisted(() => ({
  getStaleHeldWriteQueueStats: vi.fn(),
  withAdminBypass: vi.fn(async (fn: (db: unknown) => Promise<unknown>) =>
    fn({}),
  ),
}))
const notifyMock = vi.hoisted(() => ({
  notify: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@workspace/db", () => dbMock)
vi.mock("@workspace/notify", () => ({
  notifierFromEnv: () => notifyMock,
}))

import { runStaleHeldWritesAlertCheck } from "./stale-held-writes-alert"

describe("runStaleHeldWritesAlertCheck (production wiring)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbMock.withAdminBypass.mockImplementation(
      async (fn: (db: unknown) => Promise<unknown>) => fn({}),
    )
    delete process.env["ACCOUNTING_STALE_HELD_THRESHOLD_HOURS"]
  })
  afterEach(() => {
    delete process.env["ACCOUNTING_STALE_HELD_THRESHOLD_HOURS"]
  })

  it("reads the cross-org queue via withAdminBypass and warns via notify() when stale", async () => {
    dbMock.getStaleHeldWriteQueueStats.mockResolvedValue({
      staleCount: 2,
      oldestCreatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    })

    const result = await runStaleHeldWritesAlertCheck()

    expect(result.staleCount).toBe(2)
    expect(dbMock.withAdminBypass).toHaveBeenCalledTimes(1)
    expect(dbMock.getStaleHeldWriteQueueStats).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(notifyMock.notify).toHaveBeenCalledTimes(1))
    const [text, opts] = notifyMock.notify.mock.calls[0] as [
      string,
      { level: string; source: string },
    ]
    expect(text).toContain("2 accounting write(s) held for review")
    expect(opts.level).toBe("warn")
  })

  it("does not warn when the queue is clean", async () => {
    dbMock.getStaleHeldWriteQueueStats.mockResolvedValue({
      staleCount: 0,
      oldestCreatedAt: null,
    })

    await runStaleHeldWritesAlertCheck()

    expect(notifyMock.notify).not.toHaveBeenCalled()
  })

  it("honors ACCOUNTING_STALE_HELD_THRESHOLD_HOURS override", async () => {
    process.env["ACCOUNTING_STALE_HELD_THRESHOLD_HOURS"] = "1"
    dbMock.getStaleHeldWriteQueueStats.mockResolvedValue({
      staleCount: 0,
      oldestCreatedAt: null,
    })

    await runStaleHeldWritesAlertCheck()

    const cutoff = dbMock.getStaleHeldWriteQueueStats.mock.calls[0]?.[1] as Date
    const expected = Date.now() - 1 * 60 * 60 * 1000
    expect(Math.abs(cutoff.getTime() - expected)).toBeLessThan(5000)
  })

  it("swallows a rejecting notify() — the check still resolves", async () => {
    notifyMock.notify.mockRejectedValueOnce(new Error("bot unreachable"))
    dbMock.getStaleHeldWriteQueueStats.mockResolvedValue({
      staleCount: 1,
      oldestCreatedAt: new Date(Date.now() - 30 * 60 * 60 * 1000),
    })

    await expect(runStaleHeldWritesAlertCheck()).resolves.toMatchObject({
      staleCount: 1,
    })
    await vi.waitFor(() => expect(notifyMock.notify).toHaveBeenCalledTimes(1))
    // Let the rejected promise's .catch(() => {}) settle before the test ends.
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
})
