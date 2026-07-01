/**
 * withPeriodLock integration tests (ADR-0028 §Decision.2) — real Postgres via
 * the shared bootPostgres18() testcontainer.
 *
 * Proves the three properties the marshrutizátor's serialization layer must have:
 *   1. Same (org, period) key SERIALIZES — two concurrent lock holders never
 *      overlap (a shared in-flight counter never exceeds 1).
 *   2. Different keys run in PARALLEL — two holders on different keys DO overlap
 *      (the counter reaches 2).
 *   3. A THROWING callback releases the lock — the transaction rolls back, the
 *      xact lock is freed, and the next acquirer on the same key proceeds.
 *
 * The advisory lock is transaction-scoped (`pg_advisory_xact_lock`), so each
 * property is a direct consequence of Postgres semantics; the test observes them
 * through a shared JS counter and per-connection concurrency.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import postgres from "postgres"
import { hashInt, withPeriodLock } from "../src/period-lock.js"

// Its own pool with room for several real backend connections so concurrent
// withPeriodLock calls hold DISTINCT connections (otherwise they'd serialize at
// the pool, not at the advisory lock, and the test would prove nothing).
let sql: postgres.Sql

const getAdminUrl = (): string => {
  const url = process.env["DATABASE_DIRECT_URL"]
  if (!url)
    throw new Error("DATABASE_DIRECT_URL not set — did globalSetup run?")
  return url
}

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms))

beforeAll(() => {
  sql = postgres(getAdminUrl(), { prepare: false, max: 5, onnotice: () => {} })
})

afterAll(async () => {
  await sql.end({ timeout: 5 })
})

const ORG = "11111111-1111-1111-1111-111111111111"
const PERIOD_A = "22222222-2222-2222-2222-222222222222"
const PERIOD_B = "33333333-3333-3333-3333-333333333333"

describe("hashInt", () => {
  it("is deterministic and within signed int4 range", () => {
    const a = hashInt(ORG)
    expect(hashInt(ORG)).toBe(a)
    expect(Number.isInteger(a)).toBe(true)
    expect(a).toBeGreaterThanOrEqual(-2_147_483_648)
    expect(a).toBeLessThanOrEqual(2_147_483_647)
  })

  it("distinguishes different ids", () => {
    expect(hashInt(PERIOD_A)).not.toBe(hashInt(PERIOD_B))
  })
})

describe("withPeriodLock", () => {
  it("serializes concurrent holders of the SAME (org, period) key", async () => {
    let inFlight = 0
    let maxInFlight = 0
    const order: string[] = []

    const worker = (tag: string) =>
      withPeriodLock(sql, ORG, PERIOD_A, async () => {
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        order.push(`${tag}:enter`)
        // Hold the critical section long enough that, absent the lock, the
        // second worker would overlap the first.
        await sleep(150)
        order.push(`${tag}:exit`)
        inFlight -= 1
      })

    await Promise.all([worker("A"), worker("B")])

    // The load-bearing assertion: same key never overlaps.
    expect(maxInFlight).toBe(1)
    // Strictly one-after-another: the first holder fully enters AND exits
    // before the second enters (no interleaving), regardless of scheduling order.
    expect(order).toHaveLength(4)
    const [first, second, third, fourth] = order
    expect(second).toBe(first?.replace(":enter", ":exit"))
    expect(fourth).toBe(third?.replace(":enter", ":exit"))
    expect(third).not.toBe(first) // the two workers, in some order
  })

  it("runs DIFFERENT keys in parallel (overlap allowed)", async () => {
    let inFlight = 0
    let maxInFlight = 0

    const worker = (period: string) =>
      withPeriodLock(sql, ORG, period, async () => {
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        await sleep(150)
        inFlight -= 1
      })

    await Promise.all([worker(PERIOD_A), worker(PERIOD_B)])

    // Different (org, period) hash to different lock coordinates → they overlap.
    expect(maxInFlight).toBe(2)
  })

  it("releases the lock when the callback throws (rollback frees the xact lock)", async () => {
    const boom = new Error("callback blew up")

    await expect(
      withPeriodLock(sql, ORG, PERIOD_A, async () => {
        throw boom
      }),
    ).rejects.toBe(boom)

    // The next acquirer on the SAME key must proceed immediately — if the lock
    // had leaked, this would hang until the test timeout.
    const result = await withPeriodLock(sql, ORG, PERIOD_A, async () => "ok")
    expect(result).toBe("ok")
  })

  it("propagates the callback's return value", async () => {
    const value = await withPeriodLock(sql, ORG, PERIOD_B, async () => 42)
    expect(value).toBe(42)
  })
})
