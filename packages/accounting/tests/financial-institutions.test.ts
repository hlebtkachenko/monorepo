/**
 * listFinancialInstitutions — the ČNB bank-code reference register read. Reference (no
 * tenant scope), read through an org-bound tx. PG18 testcontainer with every migration
 * applied (incl. 0080 financial_institution + 0081 seed). Asserts the seed cardinality,
 * ordering, and a couple of well-known bank codes.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { withOrganization } from "@workspace/db"
import { adminClient, seedTwoOrganizations } from "./fixtures.js"
import { listFinancialInstitutions } from "../src/financial-institutions"

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

describe("listFinancialInstitutions", () => {
  it("returns the full seeded bank-code register (52 rows), sorted by bank_code", async () => {
    await withOrganization(orgA, userId, async (db) => {
      const all = await listFinancialInstitutions(db)
      expect(all).toHaveLength(52)
      expect(all[0]!.bank_code).toBe("0100")
      const codes = all.map((b) => b.bank_code)
      expect(codes).toEqual([...codes].sort())
    })
  })

  it("carries well-known ČNB bank codes", async () => {
    await withOrganization(orgA, userId, async (db) => {
      const codes = new Set(
        (await listFinancialInstitutions(db)).map((b) => b.bank_code),
      )
      expect(codes.has("0100")).toBe(true) // Komerční banka
      expect(codes.has("0800")).toBe(true) // Česká spořitelna
      expect(codes.has("2010")).toBe(true) // Fio banka
    })
  })

  it("activeOnly returns only active rows (all seeded rows are active)", async () => {
    await withOrganization(orgA, userId, async (db) => {
      const active = await listFinancialInstitutions(db, { activeOnly: true })
      expect(active).toHaveLength(52)
      expect(active.every((b) => b.active)).toBe(true)
    })
  })
})
