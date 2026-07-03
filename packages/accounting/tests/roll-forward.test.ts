/**
 * rollForwardPeriod — end-to-end period close + open next, on a real PG18.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { withOrganization } from "@workspace/db"
import {
  captureDocument,
  createEvent,
  generalLedger,
  postDoubleEntry,
  rollForwardPeriod,
} from "../src/index"
import {
  adminClient,
  seedCashOrg,
  seedDoubleEntryOrg,
  seedTwoOrganizations,
} from "./fixtures"

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
  await admin.end({ timeout: 5 })
})

describe("rollForwardPeriod", () => {
  it("double-entry: closes the result and carries balances forward via 701", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2040-01-01",
      periodEnd: "2040-12-31",
    })

    // Revenue: MD 221 (bank) / D 602 (tržby) = 1000. Leaves a P&L result.
    await withOrganization(orgA, userId, async (db) => {
      const ev = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "Tržba",
        occurredAt: "2040-06-01",
        responsibleUserId: userId,
      })
      const doc = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "INTERNAL",
        issuedAt: "2040-06-01",
        lines: [],
      })
      await postDoubleEntry(db, s.ctx, {
        periodId: s.periodId,
        summaryRecordId: doc.summaryRecordId,
        accountingEventId: ev.eventId,
        postingDate: "2040-06-01",
        responsibleUserId: userId,
        lines: [
          { accountId: s.accounts["221"]!, side: "DEBIT", amount: "1000.00" },
          { accountId: s.accounts["602"]!, side: "CREDIT", amount: "1000.00" },
        ],
      })
    })

    const result = await withOrganization(orgA, userId, (db) =>
      rollForwardPeriod(db, s.ctx, {
        priorPeriodId: s.periodId,
        periodStart: "2041-01-01",
        periodEnd: "2041-12-31",
        eventSeriesId: s.eventSeriesId,
        documentSeriesId: s.documentSeriesId,
        responsibleUserId: userId,
      }),
    )

    expect(result.newPeriodId).not.toBe("")
    expect(result.newChartId).not.toBeNull()
    expect(result.closeResultPostingId).not.toBeNull()
    expect(result.openingPostingId).not.toBeNull()

    // New period: bank asset carried on 701; result rolled to equity 431; P&L reset.
    await withOrganization(orgA, userId, async (db) => {
      const ledger = await generalLedger(db, result.newPeriodId)
      const bank = ledger.find((r) => r.account_number === "221")!
      const equity = ledger.find((r) => r.account_number === "431")!
      const revenue = ledger.find((r) => r.account_number === "602")
      expect(bank.opening_balance).toBe("1000.0000")
      expect(equity.opening_balance).toBe("-1000.0000")
      // P&L never carries forward (ČÚS 002): 602 has no opening balance row.
      expect(revenue?.opening_balance ?? "0.0000").toBe("0.0000")
    })
  })

  it("monetary: closes + opens a bare next period (no chart, no opening posting)", async () => {
    const s = await seedCashOrg(orgB, workspaceId, userId, "TAX_RECORDS")

    const result = await withOrganization(orgB, userId, (db) =>
      rollForwardPeriod(db, s.ctx, {
        priorPeriodId: s.periodId,
        periodStart: "2027-01-01",
        periodEnd: "2027-12-31",
        eventSeriesId: s.eventSeriesId,
        documentSeriesId: s.documentSeriesId,
        responsibleUserId: userId,
      }),
    )

    expect(result.newPeriodId).not.toBe("")
    expect(result.newChartId).toBeNull()
    expect(result.openingPostingId).toBeNull()
    expect(result.closeResultPostingId).toBeNull()
  })
})
