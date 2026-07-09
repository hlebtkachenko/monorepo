import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const alertMock = vi.hoisted(() => ({
  runStaleHeldWritesAlertCheck: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("./stale-held-writes-alert", () => alertMock)

import { StaleHeldWritesScheduler } from "./stale-held-writes-scheduler"

describe("StaleHeldWritesScheduler", () => {
  const originalEnabled = process.env["ACCOUNTING_STALE_HELD_ALERT_ENABLED"]
  const originalIntervalMs =
    process.env["ACCOUNTING_STALE_HELD_CHECK_INTERVAL_MS"]
  const originalNodeEnv = process.env["NODE_ENV"]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    if (originalEnabled === undefined) {
      delete process.env["ACCOUNTING_STALE_HELD_ALERT_ENABLED"]
    } else {
      process.env["ACCOUNTING_STALE_HELD_ALERT_ENABLED"] = originalEnabled
    }
    if (originalIntervalMs === undefined) {
      delete process.env["ACCOUNTING_STALE_HELD_CHECK_INTERVAL_MS"]
    } else {
      process.env["ACCOUNTING_STALE_HELD_CHECK_INTERVAL_MS"] =
        originalIntervalMs
    }
    if (originalNodeEnv === undefined) {
      delete process.env["NODE_ENV"]
    } else {
      process.env["NODE_ENV"] = originalNodeEnv
    }
  })

  it("stays dormant when the flag is unset", async () => {
    delete process.env["ACCOUNTING_STALE_HELD_ALERT_ENABLED"]

    const scheduler = new StaleHeldWritesScheduler()
    scheduler.onModuleInit()
    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000)

    expect(alertMock.runStaleHeldWritesAlertCheck).not.toHaveBeenCalled()
    scheduler.onModuleDestroy()
  })

  it("stays dormant when the flag is explicitly 'false'", async () => {
    process.env["ACCOUNTING_STALE_HELD_ALERT_ENABLED"] = "false"
    process.env["NODE_ENV"] = "development"

    const scheduler = new StaleHeldWritesScheduler()
    scheduler.onModuleInit()
    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000)

    expect(alertMock.runStaleHeldWritesAlertCheck).not.toHaveBeenCalled()
    scheduler.onModuleDestroy()
  })

  it("stays dormant in the test environment even if the flag is 'true'", async () => {
    process.env["ACCOUNTING_STALE_HELD_ALERT_ENABLED"] = "true"
    process.env["NODE_ENV"] = "test"

    const scheduler = new StaleHeldWritesScheduler()
    scheduler.onModuleInit()
    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000)

    expect(alertMock.runStaleHeldWritesAlertCheck).not.toHaveBeenCalled()
    scheduler.onModuleDestroy()
  })

  it("arms an immediate check + one per interval when enabled, and stops after destroy", async () => {
    process.env["ACCOUNTING_STALE_HELD_ALERT_ENABLED"] = "true"
    process.env["NODE_ENV"] = "development"
    process.env["ACCOUNTING_STALE_HELD_CHECK_INTERVAL_MS"] = "1000"

    const scheduler = new StaleHeldWritesScheduler()
    scheduler.onModuleInit()

    // Immediate check fires synchronously on arm, before any timer advance.
    expect(alertMock.runStaleHeldWritesAlertCheck).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1000)
    expect(alertMock.runStaleHeldWritesAlertCheck).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(1000)
    expect(alertMock.runStaleHeldWritesAlertCheck).toHaveBeenCalledTimes(3)

    scheduler.onModuleDestroy()
    await vi.advanceTimersByTimeAsync(5000)
    expect(alertMock.runStaleHeldWritesAlertCheck).toHaveBeenCalledTimes(3)
  })

  it("falls back to the 1h default interval when the override is non-finite", async () => {
    process.env["ACCOUNTING_STALE_HELD_ALERT_ENABLED"] = "true"
    process.env["NODE_ENV"] = "development"
    process.env["ACCOUNTING_STALE_HELD_CHECK_INTERVAL_MS"] = "not-a-number"

    const scheduler = new StaleHeldWritesScheduler()
    scheduler.onModuleInit()
    expect(alertMock.runStaleHeldWritesAlertCheck).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000 - 1)
    expect(alertMock.runStaleHeldWritesAlertCheck).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(alertMock.runStaleHeldWritesAlertCheck).toHaveBeenCalledTimes(2)

    scheduler.onModuleDestroy()
  })

  it("swallows a rejecting check — never throws from the timer callback", async () => {
    process.env["ACCOUNTING_STALE_HELD_ALERT_ENABLED"] = "true"
    process.env["NODE_ENV"] = "development"
    process.env["ACCOUNTING_STALE_HELD_CHECK_INTERVAL_MS"] = "1000"
    alertMock.runStaleHeldWritesAlertCheck.mockRejectedValueOnce(
      new Error("db unreachable"),
    )

    const scheduler = new StaleHeldWritesScheduler()
    expect(() => scheduler.onModuleInit()).not.toThrow()
    await vi.advanceTimersByTimeAsync(1000)

    expect(alertMock.runStaleHeldWritesAlertCheck).toHaveBeenCalledTimes(2)
    scheduler.onModuleDestroy()
  })
})
