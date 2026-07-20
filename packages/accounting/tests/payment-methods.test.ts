/**
 * listPaymentMethods — the forma-úhrady vocabulary read (Finance ▸ Číselníky ▸
 * Formy úhrady). Reference (no tenant scope), read through an org-bound tx. PG18
 * testcontainer with every migration applied (incl. 0079 payment_method, seeded
 * with the 4 canonical codes). Asserts the seed set, display order, and flags.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { withOrganization } from "@workspace/db"
import { adminClient, seedTwoOrganizations } from "./fixtures.js"
import { listPaymentMethods } from "../src/payment-methods"

let admin: ReturnType<typeof adminClient>
let orgA: string
let userA: string

beforeAll(async () => {
  admin = adminClient()
  const seed = await seedTwoOrganizations(admin)
  orgA = seed.orgAId
  userA = seed.userAId
})

afterAll(async () => {
  await admin.end({ timeout: 5 })
})

describe("listPaymentMethods", () => {
  it("returns the 4 seeded codes in display order", async () => {
    await withOrganization(orgA, userA, async (db) => {
      const all = await listPaymentMethods(db)
      expect(all.map((m) => m.code)).toEqual([
        "cash",
        "transfer",
        "card",
        "other",
      ])
    })
  })

  it("carries the intake flags (cash is_cash, transfer requires_bank_detail)", async () => {
    await withOrganization(orgA, userA, async (db) => {
      const all = await listPaymentMethods(db)
      const byCode = new Map(all.map((m) => [m.code, m]))
      expect(byCode.get("cash")?.is_cash).toBe(true)
      expect(byCode.get("cash")?.requires_bank_detail).toBe(false)
      expect(byCode.get("transfer")?.requires_bank_detail).toBe(true)
      expect(byCode.get("transfer")?.is_cash).toBe(false)
    })
  })

  it("activeOnly returns only active rows (all seeded rows are active)", async () => {
    await withOrganization(orgA, userA, async (db) => {
      const active = await listPaymentMethods(db, { activeOnly: true })
      expect(active).toHaveLength(4)
      expect(active.every((m) => m.is_active)).toBe(true)
    })
  })
})
