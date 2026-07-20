/**
 * listPaymentForms — the forma-úhrady reference register read. Reference (no tenant
 * scope), read through an org-bound tx. PG18 testcontainer with every migration applied
 * (incl. 0084 payment_form + 0085 seed). Asserts the seed cardinality, ordering, and the
 * per-surface offer flags.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { withOrganization } from "@workspace/db"
import { adminClient, seedTwoOrganizations } from "./fixtures.js"
import { listPaymentForms } from "../src/payment-forms"

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

describe("listPaymentForms", () => {
  it("returns the full seeded forma-úhrady register (8 rows), sorted by code", async () => {
    await withOrganization(orgA, userId, async (db) => {
      const all = await listPaymentForms(db)
      expect(all).toHaveLength(8)
      expect(all[0]!.code).toBe("DOBIRKA")
      const codes = all.map((f) => f.code)
      expect(codes).toEqual([...codes].sort())
    })
  })

  it("carries the per-surface offer flags from the dataset", async () => {
    await withOrganization(orgA, userId, async (db) => {
      const byCode = new Map(
        (await listPaymentForms(db)).map((f) => [f.code, f]),
      )
      // HOTOVE is offered everywhere; PREVOD only on invoices.
      expect(byCode.get("HOTOVE")).toMatchObject({
        offer_on_invoice: true,
        offer_on_cash_desk: true,
        offer_on_pos: true,
      })
      expect(byCode.get("PREVOD")).toMatchObject({
        offer_on_invoice: true,
        offer_on_cash_desk: false,
        offer_on_pos: false,
      })
    })
  })

  it("activeOnly returns only active rows (all seeded rows are active)", async () => {
    await withOrganization(orgA, userId, async (db) => {
      const active = await listPaymentForms(db, { activeOnly: true })
      expect(active).toHaveLength(8)
      expect(active.every((f) => f.is_active)).toBe(true)
    })
  })
})
