/**
 * listConstantSymbols — the konstantní-symbol reference register read. Reference (no
 * tenant scope), read through an org-bound tx. PG18 testcontainer with every migration
 * applied (incl. 0082 constant_symbol + 0083 seed). Asserts the seed cardinality,
 * ordering, and a couple of well-known KS codes.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { withOrganization } from "@workspace/db"
import { adminClient, seedTwoOrganizations } from "./fixtures.js"
import { listConstantSymbols } from "../src/constant-symbols"

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

describe("listConstantSymbols", () => {
  it("returns the full seeded KS register (15 rows), sorted by code", async () => {
    await withOrganization(orgA, userId, async (db) => {
      const all = await listConstantSymbols(db)
      expect(all).toHaveLength(15)
      expect(all[0]!.code).toBe("0008")
      const codes = all.map((c) => c.code)
      expect(codes).toEqual([...codes].sort())
    })
  })

  it("carries well-known konstantní-symbol codes", async () => {
    await withOrganization(orgA, userId, async (db) => {
      const codes = new Set((await listConstantSymbols(db)).map((c) => c.code))
      expect(codes.has("0008")).toBe(true) // Platby za dodávky výrobků
      expect(codes.has("0308")).toBe(true) // Platby za dodávky prací, výkonů a služeb
      expect(codes.has("7618")).toBe(true) // Odvod sociálního zabezpečení
    })
  })

  it("activeOnly returns only active rows (all seeded rows are active)", async () => {
    await withOrganization(orgA, userId, async (db) => {
      const active = await listConstantSymbols(db, { activeOnly: true })
      expect(active).toHaveLength(15)
      expect(active.every((c) => c.active)).toBe(true)
    })
  })
})
