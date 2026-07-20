/**
 * listCountries — the ISO 3166-1 country reference register read. Reference (no tenant
 * scope), read through an org-bound tx. PG18 testcontainer with every migration applied
 * (incl. 0072 country + 0073 country_seed). Asserts the seed cardinality, ordering, and
 * the ISO-4217 currency where known.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { withOrganization } from "@workspace/db"
import { adminClient, seedTwoOrganizations } from "./fixtures.js"
import { listCountries } from "../src/countries"

let admin: ReturnType<typeof adminClient>
let orgA: string
let userId: string

beforeAll(async () => {
  admin = adminClient()
  const seed = await seedTwoOrganizations(admin)
  orgA = seed.orgAId
  userId = seed.userAId
})

afterAll(async () => {
  await admin.end({ timeout: 5 })
})

describe("listCountries", () => {
  it("returns the full seeded ISO-3166 register (258 rows), sorted by iso2", async () => {
    await withOrganization(orgA, userId, async (db) => {
      const all = await listCountries(db)
      expect(all).toHaveLength(258)
      expect(all[0]!.iso2).toBe("AD")
      const codes = all.map((c) => c.iso2)
      expect(codes).toEqual([...codes].sort())
    })
  })

  it("carries the ISO-4217 currency where known, NULL otherwise", async () => {
    await withOrganization(orgA, userId, async (db) => {
      const all = await listCountries(db)
      const byCode = new Map(all.map((c) => [c.iso2, c]))
      expect(byCode.get("AD")?.currency_code).toBe("EUR") // Andorra
      expect(byCode.get("ZA")?.currency_code).toBe("ZAR") // South Africa
      expect(byCode.get("AF")?.currency_code).toBeNull() // Afghanistan (blank in source)
    })
  })

  it("activeOnly returns only active rows (all seeded rows are active)", async () => {
    await withOrganization(orgA, userId, async (db) => {
      const active = await listCountries(db, { activeOnly: true })
      expect(active).toHaveLength(258)
      expect(active.every((c) => c.active)).toBe(true)
    })
  })
})
