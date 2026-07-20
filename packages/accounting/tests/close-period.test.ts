/**
 * closePeriod — full year-end close (result close + 702 balance-close + účetní
 * závěrka output + carryover 701) on a real PG18.
 *
 * The 702 Konečný účet rozvažný posting is the new core step: it closes every
 * balance-sheet account (incl. 431 after the result close) to 702 as ONE is_closing
 * posting whose own net proves the KÚR balance equation (assets = liabilities +
 * equity). is_closing keeps it read-model-neutral, so the balance-sheet
 * closing_balances stay the carryover / rozvaha source of truth and the next
 * period's 701 opening is derived from them unchanged.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { withOrganization } from "@workspace/db"
import {
  captureDocument,
  closePeriod,
  createEvent,
  createPeriod,
  generalLedger,
  openPeriod,
  postDoubleEntry,
  postOpeningBalances,
  reconcileReadModel,
} from "../src/index"
import {
  adminClient,
  seedCashOrg,
  seedDoubleEntryOrg,
  seedTwoOrganizations,
  type DoubleEntrySeed,
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

/** Post one double-entry line pair through an internal doklad. */
async function postPair(
  seed: DoubleEntrySeed,
  date: string,
  debit: { number: string; amount: string },
  credit: { number: string; amount: string },
): Promise<void> {
  await withOrganization(seed.ctx.organizationId, userId, async (db) => {
    const event = await createEvent(db, seed.ctx, {
      periodId: seed.periodId,
      seriesId: seed.eventSeriesId,
      description: "Booking before close",
      occurredAt: date,
      responsibleUserId: userId,
    })
    const doc = await captureDocument(db, seed.ctx, {
      periodId: seed.periodId,
      seriesId: seed.documentSeriesId,
      type: "INTERNAL",
      issuedAt: date,
      lines: [],
    })
    await postDoubleEntry(db, seed.ctx, {
      periodId: seed.periodId,
      summaryRecordId: doc.summaryRecordId,
      accountingEventId: event.eventId,
      postingDate: date,
      responsibleUserId: userId,
      lines: [
        {
          accountId: seed.accounts[debit.number]!,
          side: "DEBIT",
          amount: debit.amount,
        },
        {
          accountId: seed.accounts[credit.number]!,
          side: "CREDIT",
          amount: credit.amount,
        },
      ],
    })
  })
}

describe("closePeriod", () => {
  it("posts the 702 balance-close, foots via KÚR, stays read-model-neutral, and carries 701 forward", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2080-01-01",
      periodEnd: "2080-12-31",
    })

    // Revenue MD 221 / D 602 = 1000, expense MD 504 / D 321 = 300. Result = 700 profit.
    await postPair(
      s,
      "2080-06-01",
      { number: "221", amount: "1000.00" },
      { number: "602", amount: "1000.00" },
    )
    await postPair(
      s,
      "2080-06-02",
      { number: "504", amount: "300.00" },
      { number: "321", amount: "300.00" },
    )

    const result = await withOrganization(orgA, userId, (db) =>
      closePeriod(db, s.ctx, {
        priorPeriodId: s.periodId,
        responsibleUserId: userId,
      }),
    )

    expect(result.closeResultPostingId).not.toBeNull()
    expect(result.closingPostingId).not.toBeNull()
    expect(result.openingPostingId).not.toBeNull()
    expect(result.newPeriodId).not.toBe("")
    expect(result.newChartId).not.toBeNull()

    // Prior period sealed.
    const [prior] = await admin<Array<{ status: string }>>`
      SELECT status FROM accounting_period WHERE id = ${s.periodId}::uuid`
    expect(prior?.status).toBe("CLOSED")

    // The 702 posting exists and is tagged is_closing.
    const [posting] = await admin<Array<{ is_closing: boolean }>>`
      SELECT is_closing FROM posting WHERE id = ${result.closingPostingId!}::uuid`
    expect(posting?.is_closing).toBe(true)

    // KÚR: the whole posting nets to zero (R4), and — the meaningful check — 702's
    // OWN net (its debits vs credits) is exactly zero = assets − (liab + equity).
    const [kur] = await admin<Array<{ whole: string; account_702: string }>>`
      SELECT COALESCE(SUM(CASE WHEN side = 'DEBIT' THEN amount ELSE -amount END), 0)::text AS whole,
             COALESCE(SUM(CASE WHEN side = 'DEBIT' THEN amount ELSE -amount END)
                        FILTER (WHERE account_id = ${s.accounts["702"]!}::uuid), 0)::text AS account_702
        FROM posting_double_entry_line
       WHERE posting_id = ${result.closingPostingId!}::uuid`
    expect(kur?.whole).toBe("0.0000")
    expect(kur?.account_702).toBe("0.0000")

    // Read-model-neutral: the 702 did NOT zero the balance-sheet closing_balances.
    expect(await closingBalance(s.periodId, s.accounts["221"]!)).toBe(
      "1000.0000",
    )
    expect(await closingBalance(s.periodId, s.accounts["321"]!)).toBe(
      "-300.0000",
    )
    expect(await closingBalance(s.periodId, s.accounts["431"]!)).toBe(
      "-700.0000",
    )
    // Result close zeroed the P&L; 702 collected only is_closing lines (no balance row).
    expect(await closingBalance(s.periodId, s.accounts["602"]!)).toBe("0.0000")
    expect(await closingBalance(s.periodId, s.accounts["504"]!)).toBe("0.0000")
    expect(await closingBalance(s.periodId, s.accounts["702"]!)).toBeNull()

    // The 701 carried the intact balance-sheet balances into the next period.
    await withOrganization(orgA, userId, async (db) => {
      const ledger = await generalLedger(db, result.newPeriodId)
      const opening = (num: string) =>
        ledger.find((r) => r.account_number === num)?.opening_balance ??
        "0.0000"
      expect(opening("221")).toBe("1000.0000")
      expect(opening("321")).toBe("-300.0000")
      expect(opening("431")).toBe("-700.0000")
      // P&L never carries forward (ČÚS 002).
      expect(opening("602")).toBe("0.0000")
      expect(opening("504")).toBe("0.0000")
    })

    // Both periods reconcile (the reconcile detector excludes is_closing lines).
    const priorDrift = await withOrganization(orgA, userId, (db) =>
      reconcileReadModel(db, s.periodId),
    )
    const nextDrift = await withOrganization(orgA, userId, (db) =>
      reconcileReadModel(db, result.newPeriodId),
    )
    expect(priorDrift).toEqual([])
    expect(nextDrift).toEqual([])
  })

  it("refuses to carry a second 701 into a next period that already holds opening balances", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2081-01-01",
      periodEnd: "2081-12-31",
    })

    // A balance-sheet balance to carry: MD 221 / D 321 = 500.
    await postPair(
      s,
      "2081-06-01",
      { number: "221", amount: "500.00" },
      { number: "321", amount: "500.00" },
    )

    // Open the next period EARLY via openPeriod (chart forward, NO 701), then seed its
    // 701 opening balances directly through the postOpeningBalances primitive, so the
    // target already carries live opening balances before closePeriod's carryover runs.
    await withOrganization(orgA, userId, async (db) => {
      const opened = await openPeriod(db, s.ctx, {
        priorPeriodId: s.periodId,
        periodStart: "2082-01-01",
        periodEnd: "2082-12-31",
      })
      await postOpeningBalances(db, s.ctx, {
        priorPeriodId: s.periodId,
        targetPeriodId: opened.newPeriodId,
        eventSeriesId: s.eventSeriesId,
        documentSeriesId: s.documentSeriesId,
        responsibleUserId: userId,
        postingDate: "2082-01-01",
      })
    })

    // closePeriod reaches its carryover, finds the pre-opened 2082 with live opening
    // balances, and refuses rather than double-posting the 701.
    await expect(
      withOrganization(orgA, userId, (db) =>
        closePeriod(db, s.ctx, {
          priorPeriodId: s.periodId,
          responsibleUserId: userId,
        }),
      ),
    ).rejects.toThrow(/double-open guard/)

    // The refusal rolled the whole close back — the prior period is still OPEN.
    const [prior] = await admin<Array<{ status: string }>>`
      SELECT status FROM accounting_period WHERE id = ${s.periodId}::uuid`
    expect(prior?.status).toBe("OPEN")
  })

  it("closes N into a next period opened early via openPeriod (targets it, does not duplicate, posts the 701)", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2083-01-01",
      periodEnd: "2083-12-31",
    })

    // Balance-sheet activity to carry: MD 221 / D 321 = 800.
    await postPair(
      s,
      "2083-06-01",
      { number: "221", amount: "800.00" },
      { number: "321", amount: "800.00" },
    )

    // Open N+1 EARLY via openPeriod — copies the chart forward, posts NO 701 (the
    // independence path: start booking into 2084 while 2083 is still open).
    const opened = await withOrganization(orgA, userId, (db) =>
      openPeriod(db, s.ctx, {
        priorPeriodId: s.periodId,
        periodStart: "2084-01-01",
        periodEnd: "2084-12-31",
      }),
    )

    // Closing 2083 must FIND the pre-opened 2084 (not create a second one) and post
    // the 701 into it — its opening balances are empty, so the guard passes.
    const result = await withOrganization(orgA, userId, (db) =>
      closePeriod(db, s.ctx, {
        priorPeriodId: s.periodId,
        responsibleUserId: userId,
      }),
    )

    // Same period targeted, and no duplicate 2084 was created.
    expect(result.newPeriodId).toBe(opened.newPeriodId)
    expect(result.openingPostingId).not.toBeNull()
    const [dup] = await admin<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM accounting_period
       WHERE organization_id = ${orgA}::uuid AND period_start = '2084-01-01'`
    expect(dup?.n).toBe(1)

    // The 701 carried the intact balances into the pre-opened period.
    await withOrganization(orgA, userId, async (db) => {
      const ledger = await generalLedger(db, result.newPeriodId)
      const opening = (num: string) =>
        ledger.find((r) => r.account_number === num)?.opening_balance ??
        "0.0000"
      expect(opening("221")).toBe("800.0000")
      expect(opening("321")).toBe("-800.0000")
    })

    // Both periods reconcile.
    const priorDrift = await withOrganization(orgA, userId, (db) =>
      reconcileReadModel(db, s.periodId),
    )
    const nextDrift = await withOrganization(orgA, userId, (db) =>
      reconcileReadModel(db, result.newPeriodId),
    )
    expect(priorDrift).toEqual([])
    expect(nextDrift).toEqual([])
  })

  it("closes N into a next period opened early with an IRREGULAR (short) end — targets it by start, no duplicate", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2085-01-01",
      periodEnd: "2085-12-31",
    })

    // Balance-sheet activity to carry: MD 221 / D 321 = 900.
    await postPair(
      s,
      "2085-06-01",
      { number: "221", amount: "900.00" },
      { number: "321", amount: "900.00" },
    )

    // Open N+1 EARLY via openPeriod as a SHORT fiscal year: irregular end 2086-06-30,
    // NOT the 2086-12-31 that nextPeriodBounds computes. The successor START
    // (2086-01-01, the day after N ends) is invariant regardless of that length —
    // matching on start+end would MISS this period and create a duplicate overlapping
    // full-calendar-year 2086, posting the 701 into the wrong period.
    const opened = await withOrganization(orgA, userId, (db) =>
      openPeriod(db, s.ctx, {
        priorPeriodId: s.periodId,
        periodStart: "2086-01-01",
        periodEnd: "2086-06-30",
      }),
    )

    const result = await withOrganization(orgA, userId, (db) =>
      closePeriod(db, s.ctx, {
        priorPeriodId: s.periodId,
        responsibleUserId: userId,
      }),
    )

    // Targeted the pre-opened irregular period and posted the 701 into it.
    expect(result.newPeriodId).toBe(opened.newPeriodId)
    expect(result.openingPostingId).not.toBeNull()

    // Exactly ONE period starts on 2086-01-01, and its end is still the irregular
    // 2086-06-30 — no duplicate full-calendar-year successor was created.
    const periods = await admin<Array<{ id: string; period_end: string }>>`
      SELECT id, period_end::text AS period_end FROM accounting_period
       WHERE organization_id = ${orgA}::uuid AND period_start = '2086-01-01'`
    expect(periods).toHaveLength(1)
    expect(periods[0]!.id).toBe(opened.newPeriodId)
    expect(periods[0]!.period_end).toBe("2086-06-30")

    // The 701 carried the intact balances into the pre-opened period.
    await withOrganization(orgA, userId, async (db) => {
      const ledger = await generalLedger(db, result.newPeriodId)
      const opening = (num: string) =>
        ledger.find((r) => r.account_number === num)?.opening_balance ??
        "0.0000"
      expect(opening("221")).toBe("900.0000")
      expect(opening("321")).toBe("-900.0000")
    })

    const priorDrift = await withOrganization(orgA, userId, (db) =>
      reconcileReadModel(db, s.periodId),
    )
    const nextDrift = await withOrganization(orgA, userId, (db) =>
      reconcileReadModel(db, result.newPeriodId),
    )
    expect(priorDrift).toEqual([])
    expect(nextDrift).toEqual([])
  })

  it("monetary: closes N into a bare next period opened early with an irregular end — finds it by start, no duplicate", async () => {
    const s = await seedCashOrg(orgB, workspaceId, userId, "TAX_RECORDS")

    // Pre-open the successor EARLY as a bare SHORT year (2027-01-01..2027-06-30). Cash
    // regimes have no chart, so this is a plain createPeriod, not openPeriod.
    const earlyId = await withOrganization(orgB, userId, (db) =>
      createPeriod(db, s.ctx, {
        periodStart: "2027-01-01",
        periodEnd: "2027-06-30",
        regimeCode: "TAX_RECORDS",
        accountingCurrency: "CZK",
      }),
    )

    // Closing 2026 must FIND the pre-opened 2027 by START (matching on both start+end
    // would create a second full 2027 calendar year) and post no 701 (monetary).
    const result = await withOrganization(orgB, userId, (db) =>
      closePeriod(db, s.ctx, {
        priorPeriodId: s.periodId,
        responsibleUserId: userId,
      }),
    )

    expect(result.newPeriodId).toBe(earlyId)
    expect(result.newChartId).toBeNull()
    expect(result.openingPostingId).toBeNull()

    // Exactly ONE period starts on 2027-01-01, end still 2027-06-30 (no duplicate).
    const periods = await admin<Array<{ id: string; period_end: string }>>`
      SELECT id, period_end::text AS period_end FROM accounting_period
       WHERE organization_id = ${orgB}::uuid AND period_start = '2027-01-01'`
    expect(periods).toHaveLength(1)
    expect(periods[0]!.id).toBe(earlyId)
    expect(periods[0]!.period_end).toBe("2027-06-30")
  })
})
