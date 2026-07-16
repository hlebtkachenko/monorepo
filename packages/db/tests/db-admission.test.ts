/**
 * DbAdmissionController integration tests (ADR-0028 §Decision.1, #472) — real
 * Postgres via the shared bootPostgres18() testcontainer.
 *
 * Proves the cross-instance admission controller enforces the caps the
 * in-memory one can only enforce per-process:
 *
 *   1. GLOBAL cap enforced across TWO controller instances (two containers,
 *      distinct instanceIds, one shared DB) — the (N+1)th run is rejected.
 *   2. PER-KEY cap enforced across instances — one org cannot exceed its slice.
 *   3. Kill-switch fails closed WITHOUT touching the DB.
 *   4. Crash-leak reap — a dead holder's stale row is reaped inline on the next
 *      acquire, so a crashed instance never wedges the cap forever.
 *   5. release() frees the slot (deletes the rows) and is idempotent.
 *   6. The heartbeat keeps a held slot alive (bumps heartbeat_at past the reap
 *      threshold) so a long run is not reaped out from under itself.
 *   7. reapExpiredAdmissionSlots (the backstop reaper's core) deletes only the
 *      stale rows.
 *
 * Each property is a direct consequence of the advisory-locked count-then-insert
 * transaction; the test observes them through the real table.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import {
  AdmissionRejected,
  DbAdmissionController,
  reapExpiredAdmissionSlots,
} from "../src/admission.js"

let sql: postgres.Sql

const getAdminUrl = (): string => {
  const url = process.env["DATABASE_DIRECT_URL"]
  if (!url)
    throw new Error("DATABASE_DIRECT_URL not set — did globalSetup run?")
  return url
}

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms))

const alwaysActive = { isActive: () => true }

const ORG_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
const ORG_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"

beforeAll(() => {
  // Its own pool with room for several backend connections so concurrent
  // acquires hold DISTINCT connections (the advisory lock, not the pool, is
  // what serializes them).
  sql = postgres(getAdminUrl(), { prepare: false, max: 6, onnotice: () => {} })
})

afterAll(async () => {
  await sql.end({ timeout: 5 })
})

afterEach(async () => {
  await sql`TRUNCATE brain_admission_slot`
})

const countRows = async (): Promise<number> => {
  const rows = (await sql`
    SELECT count(*)::int AS n FROM brain_admission_slot
  `) as unknown as Array<{ n: number }>
  return rows[0]?.n ?? 0
}

describe("DbAdmissionController — kill-switch", () => {
  it("fails closed WITHOUT touching the DB", async () => {
    const ctrl = new DbAdmissionController(
      { global: 10, perKey: 10 },
      { sql, isActive: () => false, instanceId: "i-kill" },
    )
    await expect(ctrl.acquire(ORG_A)).rejects.toBeInstanceOf(AdmissionRejected)
    await expect(ctrl.acquire(ORG_A)).rejects.toMatchObject({
      reason: "kill_switch_inactive",
    })
    // No slot rows were written.
    expect(await countRows()).toBe(0)
  })
})

describe("DbAdmissionController — cross-instance caps", () => {
  it("enforces the GLOBAL cap across two instances", async () => {
    const caps = { global: 2, perKey: 5 }
    const a = new DbAdmissionController(caps, {
      ...alwaysActive,
      sql,
      instanceId: "i-a",
    })
    const b = new DbAdmissionController(caps, {
      ...alwaysActive,
      sql,
      instanceId: "i-b",
    })

    const s1 = await a.acquire(ORG_A)
    const s2 = await b.acquire(ORG_A)
    // Third run (either instance) is over the global cap → rejected.
    await expect(a.acquire(ORG_B)).rejects.toMatchObject({
      reason: "global_cap_exceeded",
    })

    // Freeing one slot admits the next.
    s1.release()
    await sleep(50) // let the fire-and-forget delete land
    const s3 = await a.acquire(ORG_B)

    s2.release()
    s3.release()
    await sleep(50)
    expect(await countRows()).toBe(0)
  })

  it("enforces the PER-KEY cap across two instances", async () => {
    const caps = { global: 10, perKey: 1 }
    const a = new DbAdmissionController(caps, {
      ...alwaysActive,
      sql,
      instanceId: "i-a",
    })
    const b = new DbAdmissionController(caps, {
      ...alwaysActive,
      sql,
      instanceId: "i-b",
    })

    const s1 = await a.acquire(ORG_A)
    // Same org, different instance → still over the per-org cap.
    await expect(b.acquire(ORG_A)).rejects.toMatchObject({
      reason: "per_key_cap_exceeded",
    })
    // A DIFFERENT org is unaffected (global cap has room).
    const s2 = await b.acquire(ORG_B)

    s1.release()
    s2.release()
    await sleep(50)
    expect(await countRows()).toBe(0)
  })
})

describe("DbAdmissionController — crash-leak reap", () => {
  it("reaps a dead holder's stale rows inline so the cap is not wedged", async () => {
    const caps = { global: 1, perKey: 1 }
    // Simulate a crashed instance that left its rows behind with a stale
    // heartbeat (older than the 90s inline threshold).
    await sql`
      INSERT INTO brain_admission_slot
        (scope, scope_key, instance_id, acquired_at, heartbeat_at)
      VALUES
        ('global', 'global', 'i-dead', now() - interval '200 seconds', now() - interval '200 seconds'),
        ('org', ${ORG_A}, 'i-dead', now() - interval '200 seconds', now() - interval '200 seconds')
    `
    expect(await countRows()).toBe(2)

    const ctrl = new DbAdmissionController(caps, {
      ...alwaysActive,
      sql,
      instanceId: "i-live",
    })
    // Global cap is 1 and there is a (stale) global row — this only succeeds if
    // the inline reap deleted the dead holder before counting.
    const slot = await ctrl.acquire(ORG_A)
    // The 2 dead rows are gone, the 2 fresh rows remain.
    expect(await countRows()).toBe(2)

    slot.release()
    await sleep(50)
    expect(await countRows()).toBe(0)
  })
})

describe("DbAdmissionController — release idempotency", () => {
  it("a double release does not double-free and never throws", async () => {
    const caps = { global: 1, perKey: 1 }
    const ctrl = new DbAdmissionController(caps, {
      ...alwaysActive,
      sql,
      instanceId: "i-rel",
    })
    const slot = await ctrl.acquire(ORG_A)
    slot.release()
    slot.release() // no-op, must not throw
    await sleep(50)
    expect(await countRows()).toBe(0)

    // Capacity is exactly 1 again — a fresh acquire succeeds.
    const slot2 = await ctrl.acquire(ORG_A)
    slot2.release()
    await sleep(50)
    expect(await countRows()).toBe(0)
  })
})

describe("DbAdmissionController — heartbeat", () => {
  it("keeps a held slot alive (bumps heartbeat_at) past a simulated staleness", async () => {
    const caps = { global: 1, perKey: 1 }
    const ctrl = new DbAdmissionController(caps, {
      ...alwaysActive,
      sql,
      instanceId: "i-hb",
      heartbeatIntervalMs: 40,
    })
    const slot = await ctrl.acquire(ORG_A)

    // Force the rows stale, as if 200s had elapsed. The heartbeat timer must
    // bump heartbeat_at back to ~now before the next reap would remove them.
    await sql`
      UPDATE brain_admission_slot
      SET heartbeat_at = now() - interval '200 seconds'
    `
    // Let several heartbeats fire.
    await sleep(200)

    const rows = (await sql`
      SELECT extract(epoch FROM (now() - heartbeat_at))::float8 AS age_seconds
      FROM brain_admission_slot
    `) as unknown as Array<{ age_seconds: number }>
    expect(rows).toHaveLength(2)
    for (const r of rows) {
      // Heartbeat pulled the age back well under the 90s inline threshold.
      expect(r.age_seconds).toBeLessThan(5)
    }

    slot.release()
    await sleep(50)
    expect(await countRows()).toBe(0)
  })
})

describe("reapExpiredAdmissionSlots (backstop reaper core)", () => {
  it("deletes only rows staler than the threshold", async () => {
    await sql`
      INSERT INTO brain_admission_slot
        (scope, scope_key, instance_id, acquired_at, heartbeat_at)
      VALUES
        ('global', 'global', 'i-fresh', now(), now()),
        ('global', 'global', 'i-stale', now() - interval '10 minutes', now() - interval '10 minutes')
    `
    const d = drizzle(sql)
    await reapExpiredAdmissionSlots(d, 300)

    const rows = (await sql`
      SELECT instance_id FROM brain_admission_slot
    `) as unknown as Array<{ instance_id: string }>
    expect(rows).toHaveLength(1)
    expect(rows[0]?.instance_id).toBe("i-fresh")
  })
})
