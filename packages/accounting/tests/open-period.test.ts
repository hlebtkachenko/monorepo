/**
 * openPeriod — decoupled period open (create + copy chart forward, NO 701), on a real PG18.
 *
 * openPeriod is the "start a new účetní období while the prior one is still OPEN" half of
 * the old openNextPeriod: it creates the period and carries the chart forward, but does NOT
 * post the 701 opening balances (those are posted exactly once by closePeriod's carryover,
 * because a period opened early has no final opening balances yet).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { withOrganization } from "@workspace/db"
import { openPeriod } from "../src/index"
import {
  adminClient,
  seedDoubleEntryOrg,
  seedTwoOrganizations,
} from "./fixtures"

let admin: ReturnType<typeof adminClient>
let workspaceId: string
let orgA: string
let userId: string

beforeAll(async () => {
  admin = adminClient()
  const seed = await seedTwoOrganizations(admin)
  workspaceId = seed.workspaceId
  orgA = seed.orgAId
  userId = seed.userAId
})

afterAll(async () => {
  await admin.end({ timeout: 5 })
})

describe("openPeriod", () => {
  it("creates the next period and copies the chart forward, WITHOUT posting a 701", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2060-01-01",
      periodEnd: "2060-12-31",
    })

    const [priorChart] = await admin<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM account WHERE period_id = ${s.periodId}::uuid`
    const priorAccounts = priorChart?.n ?? 0

    const result = await withOrganization(orgA, userId, (db) =>
      openPeriod(db, s.ctx, {
        priorPeriodId: s.periodId,
        periodStart: "2061-01-01",
        periodEnd: "2061-12-31",
      }),
    )

    expect(result.newPeriodId).toBeTruthy()
    expect(result.newChartId).toBeTruthy()
    expect(result.regimeCode).toBe("DOUBLE_ENTRY")

    // The new period exists, is OPEN, and copied the prior regime + currency + bounds.
    const [np] = await admin<
      Array<{
        period_start: string
        period_end: string
        status: string
        regime_code: string
        accounting_currency: string
      }>
    >`
      SELECT period_start::text, period_end::text, status, regime_code, accounting_currency
        FROM accounting_period WHERE id = ${result.newPeriodId}::uuid`
    expect(np).toMatchObject({
      period_start: "2061-01-01",
      period_end: "2061-12-31",
      status: "OPEN",
      regime_code: "DOUBLE_ENTRY",
      accounting_currency: "CZK",
    })

    // The chart was copied forward — same account count as the prior period.
    const [newChart] = await admin<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM account WHERE period_id = ${result.newPeriodId}::uuid`
    expect(newChart?.n).toBe(priorAccounts)
    expect(priorAccounts).toBeGreaterThan(0)

    // The contract: NO 701 opening posting in the new period (openPeriod never posts it).
    const [opening] = await admin<Array<{ n: number }>>`
      SELECT count(*)::int AS n
        FROM posting WHERE period_id = ${result.newPeriodId}::uuid AND is_opening`
    expect(opening?.n).toBe(0)

    // And the prior period is untouched — openPeriod opens forward, it does not close.
    const [prior] = await admin<Array<{ status: string }>>`
      SELECT status FROM accounting_period WHERE id = ${s.periodId}::uuid`
    expect(prior?.status).toBe("OPEN")
  })
})
