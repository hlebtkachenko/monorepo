/**
 * reap-admission-slots job tests (#472).
 *
 * Boots a Postgres 18 testcontainer and exercises the backstop reaper end to
 * end through its worker entry point (`handleReapAdmissionSlots`, which runs on
 * a `withAdminBypass` tx). Proves it deletes only rows staler than the
 * threshold, leaving fresh holders alone, and validates its guard.
 *
 * Mirrors prune-auth-tokens.test.ts in containerization.
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { bootPostgres18 } from "@workspace/testcontainers"
import type { BootResult } from "@workspace/testcontainers"

process.env["NODE_ENV"] = process.env["NODE_ENV"] ?? "test"

// Cold testcontainer boot + first-call DB pool init can drift over the default
// 5 s per-test budget on a busy CI runner.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 })

let boot: BootResult

beforeAll(async () => {
  boot = await bootPostgres18()
  process.env["DATABASE_URL"] = boot.userUrl
  process.env["DATABASE_DIRECT_URL"] = boot.adminUrl
}, 120_000)

afterAll(async () => {
  if (boot?.container) await boot.container.stop()
})

beforeEach(async () => {
  const { adminClient } = await import("@workspace/db/tests/fixtures")
  const sql = adminClient()
  try {
    await sql`TRUNCATE brain_admission_slot`
  } finally {
    await sql.end({ timeout: 5 })
  }
})

describe("handleReapAdmissionSlots", () => {
  it("deletes only rows staler than the threshold", async () => {
    const { handleReapAdmissionSlots } = await import("./reap-admission-slots")
    const { adminClient } = await import("@workspace/db/tests/fixtures")
    const sql = adminClient()
    try {
      await sql`
        INSERT INTO brain_admission_slot
          (scope, scope_key, instance_id, acquired_at, heartbeat_at)
        VALUES
          ('global', 'global', 'i-fresh', now(), now()),
          ('org', 'org-1', 'i-fresh', now(), now()),
          ('global', 'global', 'i-stale', now() - interval '10 minutes', now() - interval '10 minutes')
      `

      await handleReapAdmissionSlots()

      const rows = await sql<
        Array<{ instance_id: string }>
      >`SELECT instance_id FROM brain_admission_slot ORDER BY instance_id`
      const present = rows.map((r) => r.instance_id)
      expect(present).toEqual(["i-fresh", "i-fresh"])
      expect(present).not.toContain("i-stale")
    } finally {
      await sql.end({ timeout: 5 })
    }
  })

  it("honors a custom threshold", async () => {
    const { handleReapAdmissionSlots } = await import("./reap-admission-slots")
    const { adminClient } = await import("@workspace/db/tests/fixtures")
    const sql = adminClient()
    try {
      await sql`
        INSERT INTO brain_admission_slot
          (scope, scope_key, instance_id, heartbeat_at)
        VALUES
          ('global', 'global', 'i-2min', now() - interval '2 minutes')
      `
      // Default 5-min threshold leaves the 2-min-stale row.
      await handleReapAdmissionSlots()
      expect(
        (await sql`SELECT count(*)::int AS n FROM brain_admission_slot`)[0]?.[
          "n"
        ],
      ).toBe(1)

      // A 60s threshold reaps it.
      await handleReapAdmissionSlots({ olderThanSeconds: 60 })
      expect(
        (await sql`SELECT count(*)::int AS n FROM brain_admission_slot`)[0]?.[
          "n"
        ],
      ).toBe(0)
    } finally {
      await sql.end({ timeout: 5 })
    }
  })

  it("rejects a non-positive threshold", async () => {
    const { handleReapAdmissionSlots } = await import("./reap-admission-slots")
    await expect(
      handleReapAdmissionSlots({ olderThanSeconds: 0 }),
    ).rejects.toThrow(/positive number/i)
    await expect(
      handleReapAdmissionSlots({ olderThanSeconds: -5 }),
    ).rejects.toThrow(/positive number/i)
  })
})
