/**
 * listFxRates — the FX-rate reference-surface read (Finance ▸ Číselníky ▸ Kurzy).
 * Presentation read over the shared `fx_rate` store, run through an org-bound tx.
 * PG18 testcontainer with every migration applied. Asserts verbatim raw storage
 * (rate + unit_amount returned as-is), ordering (newest date first, then pair),
 * and the onDate filter.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { withOrganization } from "@workspace/db"
import { adminClient, seedTwoOrganizations } from "./fixtures.js"
import { listFxRates } from "../src/fx/list"

let admin: ReturnType<typeof adminClient>
let orgA: string
let userA: string

beforeAll(async () => {
  admin = adminClient()
  const seed = await seedTwoOrganizations(admin)
  orgA = seed.orgAId
  userA = seed.userAId
  // Two fixing dates; PLN quoted per 100 units (množství) to prove raw storage.
  // Codes are limited to the seeded currency catalog (CZK/EUR/USD/GBP/PLN).
  await admin`
    INSERT INTO fx_rate (from_code, to_code, rate_date, rate_kind, unit_amount, rate, source)
    VALUES
      ('EUR', 'CZK', '2026-01-02', 'DAILY', 1,   '25.240000', 'CNB'),
      ('USD', 'CZK', '2026-01-02', 'DAILY', 1,   '23.100000', 'CNB'),
      ('PLN', 'CZK', '2026-01-02', 'DAILY', 100, '585.000000', 'CNB'),
      ('EUR', 'CZK', '2026-01-03', 'DAILY', 1,   '25.310000', 'CNB')
  `
})

afterAll(async () => {
  await admin`DELETE FROM fx_rate`
  await admin.end({ timeout: 5 })
})

describe("listFxRates", () => {
  it("returns stored rates verbatim, newest date first then by pair", async () => {
    await withOrganization(orgA, userA, async (db) => {
      const all = await listFxRates(db)
      expect(all.length).toBe(4)
      // Newest date (2026-01-03) leads.
      expect(all[0]).toMatchObject({
        from_code: "EUR",
        to_code: "CZK",
        rate_date: "2026-01-03",
        rate: "25.310000",
        unit_amount: 1,
      })
      // Raw množství preserved (PLN per 100), not pre-divided.
      const pln = all.find((r) => r.from_code === "PLN")
      expect(pln?.unit_amount).toBe(100)
      expect(pln?.rate).toBe("585.000000")
    })
  })

  it("onDate narrows to a single fixing date", async () => {
    await withOrganization(orgA, userA, async (db) => {
      const day = await listFxRates(db, { onDate: "2026-01-02" })
      expect(day.length).toBe(3)
      expect(day.every((r) => r.rate_date === "2026-01-02")).toBe(true)
    })
  })
})
