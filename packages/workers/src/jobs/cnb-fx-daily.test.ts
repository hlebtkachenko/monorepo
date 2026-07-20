/**
 * cnb-fx-daily job tests.
 *
 * Boots a Postgres 18 testcontainer (full migration chain → `currency` seeded,
 * `fx_rate` present) and drives `handleCnbFxDaily` through its `withAdminBypass`
 * write path with an injected fixture (ČNB is never hit). Proves it upserts one
 * row per REGISTERED currency, stores the ČNB `rate` + `amount` (množství) RAW,
 * skips CZK + unseeded codes, and is idempotent.
 *
 * Mirrors reap-admission-slots.test.ts in containerization.
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
import type { CnbRateRow } from "./cnb-fx-daily"

process.env["NODE_ENV"] = process.env["NODE_ENV"] ?? "test"

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
    await sql`DELETE FROM fx_rate WHERE source = 'CNB'`
  } finally {
    await sql.end({ timeout: 5 })
  }
})

// EUR (unit 1) + USD forced to množství 100 (raw-storage check) are registry
// currencies; ZZZ is not seeded; CZK is the self-rate. Only EUR + USD land.
const FIXTURE: CnbRateRow[] = [
  { validFor: "2026-07-20", currencyCode: "EUR", amount: 1, rate: 25.15 },
  { validFor: "2026-07-20", currencyCode: "USD", amount: 100, rate: 2300 },
  { validFor: "2026-07-20", currencyCode: "ZZZ", amount: 1, rate: 5 },
  { validFor: "2026-07-20", currencyCode: "CZK", amount: 1, rate: 1 },
]

describe("handleCnbFxDaily", () => {
  it("upserts one row per registered currency; stores rate + unit_amount raw; skips CZK + unseeded", async () => {
    const { handleCnbFxDaily } = await import("./cnb-fx-daily")
    const { adminClient } = await import("@workspace/db/tests/fixtures")

    const res = await handleCnbFxDaily(
      { date: "2026-07-20" },
      { fetchRates: async () => FIXTURE },
    )
    expect(res).toMatchObject({
      upserted: 2,
      skippedSelf: 1,
      skippedNotInRegistry: 1,
      received: 4,
    })

    const sql = adminClient()
    try {
      const rows = await sql<
        Array<{
          from_code: string
          to_code: string
          rate_date: string
          rate_kind: string
          unit_amount: number
          rate: string
          source: string
        }>
      >`
        SELECT from_code, to_code, rate_date::text AS rate_date, rate_kind,
               unit_amount, rate::text AS rate, source
          FROM fx_rate
         WHERE source = 'CNB'
         ORDER BY from_code
      `
      expect(rows.map((r) => r.from_code)).toEqual(["EUR", "USD"])
      expect(rows.find((r) => r.from_code === "EUR")).toMatchObject({
        to_code: "CZK",
        rate_date: "2026-07-20",
        rate_kind: "DAILY",
        unit_amount: 1,
        rate: "25.150000",
        source: "CNB",
      })
      // množství preserved verbatim (raw storage, no pre-division).
      expect(rows.find((r) => r.from_code === "USD")).toMatchObject({
        unit_amount: 100,
        rate: "2300.000000",
      })
    } finally {
      await sql.end({ timeout: 5 })
    }
  })

  it("is idempotent — a rerun keeps one row per pair", async () => {
    const { handleCnbFxDaily } = await import("./cnb-fx-daily")
    const { adminClient } = await import("@workspace/db/tests/fixtures")

    await handleCnbFxDaily(
      { date: "2026-07-20" },
      { fetchRates: async () => FIXTURE },
    )
    await handleCnbFxDaily(
      { date: "2026-07-20" },
      { fetchRates: async () => FIXTURE },
    )

    const sql = adminClient()
    try {
      const rows = await sql<Array<{ c: number }>>`
        SELECT COUNT(*)::int AS c FROM fx_rate WHERE source = 'CNB'
      `
      expect(rows[0]?.c).toBe(2)
    } finally {
      await sql.end({ timeout: 5 })
    }
  })

  it("updates rate + unit_amount in place on a shifted rerun", async () => {
    const { handleCnbFxDaily } = await import("./cnb-fx-daily")
    const { adminClient } = await import("@workspace/db/tests/fixtures")

    await handleCnbFxDaily(
      { date: "2026-07-20" },
      { fetchRates: async () => FIXTURE },
    )
    const shifted = FIXTURE.map((r) =>
      r.currencyCode === "EUR" ? { ...r, rate: 25.99 } : r,
    )
    await handleCnbFxDaily(
      { date: "2026-07-20" },
      { fetchRates: async () => shifted },
    )

    const sql = adminClient()
    try {
      const [row] = await sql<Array<{ rate: string; c: number }>>`
        SELECT rate::text AS rate,
               (SELECT COUNT(*)::int FROM fx_rate WHERE source = 'CNB') AS c
          FROM fx_rate
         WHERE source = 'CNB' AND from_code = 'EUR'
      `
      expect(row?.rate).toBe("25.990000")
      expect(row?.c).toBe(2)
    } finally {
      await sql.end({ timeout: 5 })
    }
  })

  it("writes nothing for an empty (weekend / holiday) response", async () => {
    const { handleCnbFxDaily } = await import("./cnb-fx-daily")
    const { adminClient } = await import("@workspace/db/tests/fixtures")

    const res = await handleCnbFxDaily(
      { date: "2026-07-25" },
      { fetchRates: async () => [] },
    )
    expect(res.upserted).toBe(0)

    const sql = adminClient()
    try {
      const rows = await sql<Array<{ c: number }>>`
        SELECT COUNT(*)::int AS c FROM fx_rate WHERE source = 'CNB'
      `
      expect(rows[0]?.c).toBe(0)
    } finally {
      await sql.end({ timeout: 5 })
    }
  })
})
