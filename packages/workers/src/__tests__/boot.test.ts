/**
 * boot() wiring tests — verifies every registered lane gets its queue created
 * and a worker bound, and that lanes declaring a cron schedule are scheduled
 * (while plain lanes are not). Uses a fake PgBoss (the registry + boot wiring is
 * independent of pg-boss internals; real pg-boss is exercised at the integration
 * level).
 */

import { afterEach, describe, expect, it, vi } from "vitest"

import { boot } from "../boot"

// Importing ../boot pulls heavy transitive deps (@workspace/db, @openfga/sdk via
// the self-registering lanes); their cold load on a CI runner can exceed the 5s
// default per-test budget. The pg-boss client itself is mocked below, so boot()
// does no real I/O — this headroom only covers module load.
vi.setConfig({ testTimeout: 20_000 })

type WorkCall = { name: string }
type QueueCall = { name: string }
type ScheduleCall = { name: string; cron: string; tz?: string }

const calls = {
  queues: [] as QueueCall[],
  works: [] as WorkCall[],
  schedules: [] as ScheduleCall[],
  started: 0,
  stopped: 0,
}

vi.mock("pg-boss", () => {
  class PgBoss {
    constructor(_opts: unknown) {}
    async start() {
      calls.started++
    }
    async createQueue(name: string) {
      calls.queues.push({ name })
    }
    async work(name: string, _opts: unknown, _handler: unknown) {
      calls.works.push({ name })
    }
    async schedule(
      name: string,
      cron: string,
      _data: unknown,
      options?: { tz?: string },
    ) {
      calls.schedules.push({ name, cron, tz: options?.tz })
    }
    async stop() {
      calls.stopped++
    }
  }
  return { PgBoss }
})

afterEach(() => {
  calls.queues = []
  calls.works = []
  calls.schedules = []
  calls.started = 0
  calls.stopped = 0
})

describe("boot()", () => {
  it("creates a queue + binds a worker for every registered lane", async () => {
    const b = await boot("postgres://direct/db")

    expect(calls.started).toBe(1)
    const queueNames = calls.queues.map((q) => q.name)
    const workNames = calls.works.map((w) => w.name)
    // Both self-registering lanes are present.
    expect(queueNames).toContain("permissions-drain")
    expect(queueNames).toContain("admission-reaper")
    // A queue is created for each worked lane (createQueue precedes work).
    expect(new Set(queueNames)).toEqual(new Set(workNames))

    await b.stop()
    expect(calls.stopped).toBe(1)
  })

  it("schedules only lanes that declare a cron", async () => {
    await boot("postgres://direct/db")

    const scheduled = calls.schedules.map((s) => s.name)
    expect(scheduled).toContain("admission-reaper")
    expect(scheduled).not.toContain("permissions-drain")

    const reaper = calls.schedules.find((s) => s.name === "admission-reaper")
    expect(reaper?.cron).toBe("*/5 * * * *")
    // A plain cron lane passes no timezone (pg-boss defaults to UTC).
    expect(reaper?.tz).toBeUndefined()
  })

  it("passes the lane timezone through to the scheduler (ČNB fix, Prague)", async () => {
    await boot("postgres://direct/db")

    const cnb = calls.schedules.find((s) => s.name === "cnb-fx-daily")
    expect(cnb?.cron).toBe("40 14 * * 1-5")
    expect(cnb?.tz).toBe("Europe/Prague")
  })
})
