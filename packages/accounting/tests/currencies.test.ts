/**
 * listCurrencies — the ISO 4217 currency reference surface read. Reads the shared
 * `currency` catalog and folds in two org-scoped facts (enablement via
 * org_currency; functional via accounting_period.accounting_currency) under an
 * org-bound tx. PG18 testcontainer with every migration applied (incl. 0078
 * org_currency). Asserts ordering, the enablement join, and that a fresh org
 * (no org_currency, no periods) reports every currency disabled + non-functional.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { withOrganization } from "@workspace/db"
import { adminClient, seedTwoOrganizations } from "./fixtures.js"
import { listCurrencies } from "../src/currencies"

let admin: ReturnType<typeof adminClient>
let orgA: string
let orgB: string
let userA: string

beforeAll(async () => {
  admin = adminClient()
  const seed = await seedTwoOrganizations(admin)
  orgA = seed.orgAId
  orgB = seed.orgBId
  userA = seed.userAId
})

afterAll(async () => {
  await admin`DELETE FROM org_currency`
  await admin.end({ timeout: 5 })
})

describe("listCurrencies", () => {
  it("returns the seeded currency catalog sorted by code", async () => {
    await withOrganization(orgA, userA, async (db) => {
      const all = await listCurrencies(db)
      expect(all.length).toBeGreaterThanOrEqual(3)
      const codes = all.map((c) => c.code)
      expect(codes).toEqual([...codes].sort())
      expect(codes).toContain("CZK")
      expect(codes).toContain("EUR")
      const czk = all.find((c) => c.code === "CZK")
      expect(czk?.name).toBeTruthy()
      expect(czk?.minor_units).toBe(2)
    })
  })

  it("reports every currency disabled + non-functional for a fresh org", async () => {
    await withOrganization(orgA, userA, async (db) => {
      const all = await listCurrencies(db)
      expect(all.every((c) => c.enabled === false)).toBe(true)
      expect(all.every((c) => c.functional === false)).toBe(true)
    })
  })

  it("flags a currency enabled once the org has an org_currency row", async () => {
    await admin`
      INSERT INTO org_currency (organization_id, currency_code)
      VALUES (${orgA}::uuid, 'EUR')
    `
    await withOrganization(orgA, userA, async (db) => {
      const all = await listCurrencies(db)
      const byCode = new Map(all.map((c) => [c.code, c]))
      expect(byCode.get("EUR")?.enabled).toBe(true)
      expect(byCode.get("CZK")?.enabled).toBe(false)
    })
  })

  it("does not leak org A's enablement into org B (RLS-scoped join)", async () => {
    // org A enabled EUR in the previous test; org B must not see it enabled.
    await withOrganization(orgB, userA, async (db) => {
      const all = await listCurrencies(db)
      const eur = all.find((c) => c.code === "EUR")
      expect(eur?.enabled).toBe(false)
    })
  })
})
