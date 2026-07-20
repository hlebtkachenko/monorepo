/**
 * posting.is_closing (702 balance-close) read-model semantics, on a real PG18.
 *
 * The 702 Konečný účet rozvažný posting is a deník/audit artifact + KÚR balance-equation
 * check — it must NOT mutate the read-model, or every balance-sheet `closing_balance`
 * would collapse to zero and destroy the carryover source. These tests pin the three
 * guarantees migration 0071 adds: (1) an is_closing line feeds neither turnover nor
 * opening_balance (closing_balance is unchanged), (2) the reconcile detector excludes
 * is_closing lines so it reports no false drift, and (3) an is_closing posting may not
 * touch a P&L (5xx/6xx) account (balance-sheet only, symmetric with 701).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { withOrganization } from "@workspace/db"
import {
  captureDocument,
  createEvent,
  postDoubleEntry,
  reconcileReadModel,
} from "../src/index"
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

/** closing_balance of one account in a period, or null when it has no balance row. */
async function closingBalance(
  periodId: string,
  accountId: string,
): Promise<string | null> {
  const [row] = await admin<Array<{ closing_balance: string }>>`
    SELECT closing_balance::text AS closing_balance
      FROM account_period_balance
     WHERE period_id = ${periodId}::uuid AND account_id = ${accountId}::uuid`
  return row?.closing_balance ?? null
}

describe("posting.is_closing (702 balance-close)", () => {
  it("is read-model-neutral: an is_closing posting leaves closing_balance intact and drives no reconcile drift", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2050-01-01",
      periodEnd: "2050-12-31",
    })

    // A normal booking: MD 221 (bank) / D 321 (payable) = 1000. Establishes real
    // turnover — closing_balance(221) = +1000, closing_balance(321) = -1000.
    await withOrganization(orgA, userId, async (db) => {
      const ev = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "Booking before close",
        occurredAt: "2050-06-01",
        responsibleUserId: userId,
      })
      const doc = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "INTERNAL",
        issuedAt: "2050-06-01",
        lines: [],
      })
      await postDoubleEntry(db, s.ctx, {
        periodId: s.periodId,
        summaryRecordId: doc.summaryRecordId,
        accountingEventId: ev.eventId,
        postingDate: "2050-06-01",
        responsibleUserId: userId,
        lines: [
          { accountId: s.accounts["221"]!, side: "DEBIT", amount: "1000.00" },
          { accountId: s.accounts["321"]!, side: "CREDIT", amount: "1000.00" },
        ],
      })
    })

    expect(await closingBalance(s.periodId, s.accounts["221"]!)).toBe(
      "1000.0000",
    )
    expect(await closingBalance(s.periodId, s.accounts["321"]!)).toBe(
      "-1000.0000",
    )

    // The 702 balance-close: close 221 (debit balance) and 321 (credit balance) to 702.
    // 702's own two sides net to zero (the KÚR balance equation). Tagged is_closing.
    await withOrganization(orgA, userId, async (db) => {
      const ev = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "Uzavření rozvahových účtů (702)",
        occurredAt: "2050-12-31",
        responsibleUserId: userId,
      })
      const doc = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "INTERNAL",
        issuedAt: "2050-12-31",
        lines: [],
      })
      await postDoubleEntry(db, s.ctx, {
        periodId: s.periodId,
        summaryRecordId: doc.summaryRecordId,
        accountingEventId: ev.eventId,
        postingDate: "2050-12-31",
        responsibleUserId: userId,
        isClosing: true,
        lines: [
          { accountId: s.accounts["221"]!, side: "CREDIT", amount: "1000.00" },
          { accountId: s.accounts["702"]!, side: "DEBIT", amount: "1000.00" },
          { accountId: s.accounts["321"]!, side: "DEBIT", amount: "1000.00" },
          { accountId: s.accounts["702"]!, side: "CREDIT", amount: "1000.00" },
        ],
      })
    })

    // Read-model unchanged: the is_closing lines fed neither turnover nor opening.
    expect(await closingBalance(s.periodId, s.accounts["221"]!)).toBe(
      "1000.0000",
    )
    expect(await closingBalance(s.periodId, s.accounts["321"]!)).toBe(
      "-1000.0000",
    )
    // 702 collected only is_closing lines, so it has no read-model row at all.
    expect(await closingBalance(s.periodId, s.accounts["702"]!)).toBeNull()

    // And the reconcile detector reports no drift — its journal Σ excludes is_closing.
    const drift = await withOrganization(orgA, userId, (db) =>
      reconcileReadModel(db, s.periodId),
    )
    expect(drift).toEqual([])
  })

  it("rejects an is_closing posting that touches a P&L (5xx/6xx) account", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2051-01-01",
      periodEnd: "2051-12-31",
    })

    await expect(
      withOrganization(orgA, userId, async (db) => {
        const ev = await createEvent(db, s.ctx, {
          periodId: s.periodId,
          seriesId: s.eventSeriesId,
          description: "Invalid 702 on a P&L account",
          occurredAt: "2051-12-31",
          responsibleUserId: userId,
        })
        const doc = await captureDocument(db, s.ctx, {
          periodId: s.periodId,
          seriesId: s.documentSeriesId,
          type: "INTERNAL",
          issuedAt: "2051-12-31",
          lines: [],
        })
        await postDoubleEntry(db, s.ctx, {
          periodId: s.periodId,
          summaryRecordId: doc.summaryRecordId,
          accountingEventId: ev.eventId,
          postingDate: "2051-12-31",
          responsibleUserId: userId,
          isClosing: true,
          lines: [
            { accountId: s.accounts["504"]!, side: "DEBIT", amount: "500.00" },
            { accountId: s.accounts["702"]!, side: "CREDIT", amount: "500.00" },
          ],
        })
      }),
    ).rejects.toThrow(/P&L|balance-sheet only/)
  })
})
