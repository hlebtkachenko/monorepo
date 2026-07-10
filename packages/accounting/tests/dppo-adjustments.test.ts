/**
 * DPPO adjustments store — loadDppoAdjustments / saveDppoAdjustments round-trip
 * and how the persisted row drives buildDppo's completeness. Runs against the
 * PG18 testcontainer (globalSetup) as app_user under RLS via withOrganization,
 * the same path production takes (income-tax-data.ts → getCorporateIncomeTax).
 *
 * A row with all six amounts + a taxpayer category makes buildDppo compute
 * (WORKSHEET_READY); a field left unanswered (null amount) is OMITTED on load so
 * buildDppo keeps reporting it as a blocking input.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { withOrganization } from "@workspace/db"
import {
  adminClient,
  seedDoubleEntryOrg,
  seedTwoOrganizations,
} from "./fixtures.js"
import {
  buildDppo,
  loadDppoAdjustments,
  saveDppoAdjustments,
  type DppoAdjustmentSaveInput,
} from "../src/index"

let admin: ReturnType<typeof adminClient>
let workspaceId: string
let orgA: string
let orgB: string
let userId: string

beforeAll(async () => {
  admin = adminClient()
  const seed = await seedTwoOrganizations(admin)
  workspaceId = seed.workspaceId
  orgA = seed.orgAId
  orgB = seed.orgBId
  userId = seed.userAId
})

afterAll(async () => {
  // Clear this suite's rows so a later file's cleanup never trips the FK.
  await admin`DELETE FROM dppo_annual_adjustment`
  await admin`DELETE FROM dppo_annual_taxpayer_category`
  await admin.end({ timeout: 5 })
})

/** All six adjustments answered (a non-nonprofit for-profit: only §25 non-zero). */
function fullEntries(): DppoAdjustmentSaveInput["entries"] {
  return {
    nonDeductibleExpenses: {
      amount: "5000.00",
      reference: "ř. 40 — §25/1/t reprezentace (513)",
    },
    exemptRevenue: { amount: "0", reference: "žádné osvobozené výnosy" },
    excludeLossMakingMainActivity: {
      amount: "0",
      reference: "not a veřejně prospěšný poplatník",
    },
    lossCarryForward: { amount: "0", reference: "no §34 loss carry-forward" },
    taxReliefs: { amount: "0", reference: "no §35 relief" },
    advancesPaid: { amount: "0", reference: "no §38a advances paid" },
  }
}

describe("saveDppoAdjustments / loadDppoAdjustments → buildDppo", () => {
  it("a full row computes a WORKSHEET_READY worksheet with round-tripped provenance", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId)

    await withOrganization(orgA, userId, (db) =>
      saveDppoAdjustments(db, s.ctx, s.periodId, {
        taxpayerCategory: "STANDARD",
        entries: fullEntries(),
      }),
    )

    const dppo = await withOrganization(orgA, userId, async (db) => {
      const input = await loadDppoAdjustments(db, s.periodId)
      expect(input.taxpayerCategory).toBe("STANDARD")
      expect(input.nonDeductibleExpenses?.amount).toBe("5000.0000")
      expect(input.nonDeductibleExpenses?.provenance.source).toBe("USER")
      expect(input.nonDeductibleExpenses?.provenance.reference).toContain(
        "reprezentace",
      )
      expect(input.nonDeductibleExpenses?.provenance.recordedAt).not.toBe("")
      return buildDppo(db, s.periodId, input)
    })

    expect(dppo.completeness.status).toBe("WORKSHEET_READY")
    expect(dppo.completeness.blockingInputs).toEqual([])
    expect(dppo.sazba).toBe("0.2100")
    // účetní výsledek 0 (no postings) + 5000 §25 − 0 + 0 = základ 5000
    expect(dppo.zaklad_dane).toBe("5000.0000")
    // provenance is echoed back on the worksheet
    expect(dppo.adjustments.nonDeductibleExpenses?.provenance.source).toBe(
      "USER",
    )
  }, 30_000)

  it("an unanswered (null) amount is omitted on load, so buildDppo reports it blocking", async () => {
    const s = await seedDoubleEntryOrg(orgB, workspaceId, userId)

    const entries = fullEntries()
    entries.lossCarryForward = null // not answered

    await withOrganization(orgB, userId, (db) =>
      saveDppoAdjustments(db, s.ctx, s.periodId, {
        taxpayerCategory: "STANDARD",
        entries,
      }),
    )

    const dppo = await withOrganization(orgB, userId, async (db) => {
      const input = await loadDppoAdjustments(db, s.periodId)
      expect(input.lossCarryForward).toBeUndefined()
      expect(input.nonDeductibleExpenses).toBeDefined()
      return buildDppo(db, s.periodId, input)
    })

    expect(dppo.completeness.status).toBe("NEEDS_INPUT")
    expect(dppo.completeness.blockingInputs).toEqual(
      expect.arrayContaining([expect.stringContaining("lossCarryForward")]),
    )
    expect(dppo.zaklad_dane).toBeNull()
  }, 30_000)

  it("returns {} for a period with no row (buildDppo blocks on every input)", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId)

    const input = await withOrganization(orgA, userId, (db) =>
      loadDppoAdjustments(db, s.periodId),
    )

    expect(input).toEqual({})
  }, 30_000)

  it("overwrites the single row on re-save (no version history) and can re-answer a field", async () => {
    const s = await seedDoubleEntryOrg(orgB, workspaceId, userId)

    // First save: lossCarryForward unanswered → blocking.
    const partial = fullEntries()
    partial.lossCarryForward = null
    await withOrganization(orgB, userId, (db) =>
      saveDppoAdjustments(db, s.ctx, s.periodId, {
        taxpayerCategory: "STANDARD",
        entries: partial,
      }),
    )

    // Second save: now answer every field → WORKSHEET_READY.
    await withOrganization(orgB, userId, (db) =>
      saveDppoAdjustments(db, s.ctx, s.periodId, {
        taxpayerCategory: "STANDARD",
        entries: fullEntries(),
      }),
    )

    // Exactly six rows for the period — one per answered adjustment; the save
    // replaces the set (delete + re-insert), it does not append (admin bypasses RLS).
    const counted = await admin<Array<{ n: number }>>`
      SELECT count(*)::int AS n
        FROM dppo_annual_adjustment
       WHERE period_id = ${s.periodId}::uuid
    `
    expect(counted[0]?.n).toBe(6)

    const dppo = await withOrganization(orgB, userId, async (db) => {
      const input = await loadDppoAdjustments(db, s.periodId)
      return buildDppo(db, s.periodId, input)
    })
    expect(dppo.completeness.status).toBe("WORKSHEET_READY")
  }, 30_000)
})
