/**
 * rollForwardPeriod — end-to-end period close + open next, on a real PG18.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  executeRows,
  lockPeriodInTx,
  sql,
  withOrganization,
} from "@workspace/db"
import {
  captureDocument,
  createEvent,
  generalLedger,
  PeriodCloseBlockedError,
  postDoubleEntry,
  rollForwardPeriod,
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

async function postRevenue(
  seed: DoubleEntrySeed,
  date: string,
  amount = "1000.00",
): Promise<string> {
  return await withOrganization(seed.ctx.organizationId, userId, async (db) => {
    const event = await createEvent(db, seed.ctx, {
      periodId: seed.periodId,
      seriesId: seed.eventSeriesId,
      description: "Revenue before close",
      occurredAt: date,
      responsibleUserId: userId,
    })
    const document = await captureDocument(db, seed.ctx, {
      periodId: seed.periodId,
      seriesId: seed.documentSeriesId,
      type: "INTERNAL",
      issuedAt: date,
      lines: [],
    })
    const posting = await postDoubleEntry(db, seed.ctx, {
      periodId: seed.periodId,
      summaryRecordId: document.summaryRecordId,
      accountingEventId: event.eventId,
      postingDate: date,
      responsibleUserId: userId,
      lines: [
        { accountId: seed.accounts["221"]!, side: "DEBIT", amount },
        { accountId: seed.accounts["602"]!, side: "CREDIT", amount },
      ],
    })
    return posting.postingId
  })
}

async function closeSideEffectSnapshot(
  organizationId: string,
  periodId: string,
) {
  const [snapshot] = await admin<
    Array<{
      events: number
      documents: number
      postings: number
      outputs: number
      periods: number
      charts: number
      accounts: number
    }>
  >`
    SELECT
      (SELECT count(*)::int FROM accounting_event WHERE period_id = ${periodId}::uuid) AS events,
      (SELECT count(*)::int FROM summary_record WHERE period_id = ${periodId}::uuid) AS documents,
      (SELECT count(*)::int FROM posting WHERE period_id = ${periodId}::uuid) AS postings,
      (SELECT count(*)::int FROM period_output WHERE period_id = ${periodId}::uuid) AS outputs,
      (SELECT count(*)::int FROM accounting_period WHERE organization_id = ${organizationId}::uuid) AS periods,
      (SELECT count(*)::int FROM chart_of_accounts WHERE organization_id = ${organizationId}::uuid) AS charts,
      (SELECT count(*)::int FROM account WHERE organization_id = ${organizationId}::uuid) AS accounts
  `
  if (!snapshot) throw new Error("close snapshot failed")
  return snapshot
}

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
        responsibleUserId: userId,
      }),
    )

    expect(result.newPeriodId).not.toBe("")
    expect(result.newChartId).not.toBeNull()
    expect(result.closeResultPostingId).not.toBeNull()
    expect(result.openingPostingId).not.toBeNull()
    expect(result.periodOutputId).not.toBe("")

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

      const [counts] = await executeRows<{
        prior_postings: number
        next_postings: number
        outputs: number
        next_periods: number
        next_charts: number
      }>(
        db,
        sql`SELECT
          (SELECT count(*)::int FROM posting WHERE period_id = ${s.periodId}::uuid) AS prior_postings,
          (SELECT count(*)::int FROM posting WHERE period_id = ${result.newPeriodId}::uuid) AS next_postings,
          (SELECT count(*)::int FROM period_output WHERE id = ${result.periodOutputId}::uuid) AS outputs,
          (SELECT count(*)::int FROM accounting_period WHERE id = ${result.newPeriodId}::uuid) AS next_periods,
          (SELECT count(*)::int FROM chart_of_accounts WHERE period_id = ${result.newPeriodId}::uuid) AS next_charts`,
      )
      expect(counts).toEqual({
        prior_postings: 2,
        next_postings: 1,
        outputs: 1,
        next_periods: 1,
        next_charts: 1,
      })
    })
  })

  it("monetary: closes + opens a bare next period (no chart, no opening posting)", async () => {
    const s = await seedCashOrg(orgB, workspaceId, userId, "TAX_RECORDS")

    const result = await withOrganization(orgB, userId, (db) =>
      rollForwardPeriod(db, s.ctx, {
        priorPeriodId: s.periodId,
        responsibleUserId: userId,
      }),
    )

    expect(result.newPeriodId).not.toBe("")
    expect(result.newChartId).toBeNull()
    expect(result.openingPostingId).toBeNull()
    expect(result.closeResultPostingId).toBeNull()
    expect(result.periodOutputId).not.toBe("")

    await withOrganization(orgB, userId, async (db) => {
      const [counts] = await executeRows<{
        outputs: number
        charts: number
        postings: number
      }>(
        db,
        sql`SELECT
          (SELECT count(*)::int FROM period_output
            WHERE id = ${result.periodOutputId}::uuid
              AND type = 'PERSONAL_INCOME_TAX') AS outputs,
          (SELECT count(*)::int FROM chart_of_accounts
            WHERE period_id = ${result.newPeriodId}::uuid) AS charts,
          (SELECT count(*)::int FROM posting
            WHERE period_id = ${result.newPeriodId}::uuid) AS postings`,
      )
      expect(counts).toEqual({ outputs: 1, charts: 0, postings: 0 })
    })
  })

  it("a blocked close leaves every close-related table unchanged", async () => {
    const seed = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2060-01-01",
      periodEnd: "2060-12-31",
    })
    await withOrganization(orgA, userId, async (db) => {
      const event = await createEvent(db, seed.ctx, {
        periodId: seed.periodId,
        seriesId: seed.eventSeriesId,
        description: "Unposted close blocker",
        occurredAt: "2060-04-01",
        responsibleUserId: userId,
      })
      await captureDocument(db, seed.ctx, {
        periodId: seed.periodId,
        seriesId: seed.documentSeriesId,
        type: "RECEIVED_INVOICE",
        issuedAt: "2060-04-01",
        lines: [
          {
            eventId: event.eventId,
            partials: [
              {
                baseAmount: "100.00",
                vatRate: "0",
                vatMode: "EXEMPT",
                currencyCode: "CZK",
              },
            ],
          },
        ],
      })
    })
    const before = await closeSideEffectSnapshot(orgA, seed.periodId)

    await expect(
      withOrganization(orgA, userId, (db) =>
        rollForwardPeriod(db, seed.ctx, {
          priorPeriodId: seed.periodId,
          responsibleUserId: userId,
        }),
      ),
    ).rejects.toBeInstanceOf(PeriodCloseBlockedError)

    expect(await closeSideEffectSnapshot(orgA, seed.periodId)).toEqual(before)
  })

  it("rejects a second call without creating duplicates", async () => {
    const seed = await seedDoubleEntryOrg(orgB, workspaceId, userId, {
      periodStart: "2061-01-01",
      periodEnd: "2061-12-31",
    })
    const first = await withOrganization(orgB, userId, (db) =>
      rollForwardPeriod(db, seed.ctx, {
        priorPeriodId: seed.periodId,
        responsibleUserId: userId,
      }),
    )
    const before = await closeSideEffectSnapshot(orgB, seed.periodId)

    let blocked: PeriodCloseBlockedError | null = null
    try {
      await withOrganization(orgB, userId, (db) =>
        rollForwardPeriod(db, seed.ctx, {
          priorPeriodId: seed.periodId,
          responsibleUserId: userId,
        }),
      )
    } catch (error) {
      if (error instanceof PeriodCloseBlockedError) blocked = error
      else throw error
    }

    expect(blocked).not.toBeNull()
    expect(
      blocked?.readiness.checks.find((check) => check.code === "PERIOD_OPEN")
        ?.status,
    ).toBe("FAIL")
    expect(await closeSideEffectSnapshot(orgB, seed.periodId)).toEqual(before)
    expect(first.newPeriodId).not.toBe("")
  })

  it("generates output after the closing result posting", async () => {
    const seed = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2062-01-01",
      periodEnd: "2062-12-31",
    })
    await postRevenue(seed, "2062-06-01")

    const result = await withOrganization(orgA, userId, (db) =>
      rollForwardPeriod(db, seed.ctx, {
        priorPeriodId: seed.periodId,
        responsibleUserId: userId,
      }),
    )

    const [order] = await admin<
      Array<{ posting_created_at: string; output_generated_at: string }>
    >`
      SELECT p.created_at::text AS posting_created_at,
             o.generated_at::text AS output_generated_at
        FROM posting p
        JOIN period_output o ON o.id = ${result.periodOutputId}::uuid
       WHERE p.id = ${result.closeResultPostingId}::uuid
    `
    expect(order).toBeDefined()
    expect(
      new Date(order!.output_generated_at).getTime(),
    ).toBeGreaterThanOrEqual(new Date(order!.posting_created_at).getTime())

    await withOrganization(orgA, userId, async (db) => {
      const ledger = await generalLedger(db, seed.periodId)
      expect(
        ledger.find((row) => row.account_number === "602")?.closing_balance,
      ).toBe("0.0000")
      expect(
        ledger.find((row) => row.account_number === "431")?.closing_balance,
      ).toBe("-1000.0000")
    })
  })

  it("rolls the full transaction back when output generation fails after the closing posting", async () => {
    const seed = await seedDoubleEntryOrg(orgB, workspaceId, userId, {
      periodStart: "2063-01-01",
      periodEnd: "2063-12-31",
    })
    await postRevenue(seed, "2063-06-01")
    const before = await closeSideEffectSnapshot(orgB, seed.periodId)

    await admin.unsafe(`
      CREATE OR REPLACE FUNCTION test_fail_period_output_for_close()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'forced period output failure';
      END;
      $$;
      CREATE TRIGGER test_fail_period_output_for_close
      BEFORE INSERT ON period_output
      FOR EACH ROW EXECUTE FUNCTION test_fail_period_output_for_close();
    `)
    try {
      await expect(
        withOrganization(orgB, userId, (db) =>
          rollForwardPeriod(db, seed.ctx, {
            priorPeriodId: seed.periodId,
            responsibleUserId: userId,
          }),
        ),
      ).rejects.toThrow(/INSERT INTO period_output/)
    } finally {
      await admin.unsafe(`
        DROP TRIGGER IF EXISTS test_fail_period_output_for_close ON period_output;
        DROP FUNCTION IF EXISTS test_fail_period_output_for_close();
      `)
    }

    expect(await closeSideEffectSnapshot(orgB, seed.periodId)).toEqual(before)
    const [period] = await admin<Array<{ status: string }>>`
      SELECT status FROM accounting_period WHERE id = ${seed.periodId}::uuid
    `
    expect(period?.status).toBe("OPEN")
  })
})

describe("guarded roll-forward advisory lock", () => {
  it("holds the per-(org, period) advisory lock through the transaction", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2041-01-01",
      periodEnd: "2041-12-31",
    })
    const advisoryLocksHeld = (db: Parameters<typeof executeRows>[0]) =>
      executeRows<{ n: number }>(
        db,
        sql`SELECT count(*)::int AS n FROM pg_locks
              WHERE locktype = 'advisory' AND pid = pg_backend_pid()`,
      ).then((r) => r[0]!.n)

    await withOrganization(orgA, userId, async (db) => {
      const before = await advisoryLocksHeld(db)
      await rollForwardPeriod(db, s.ctx, {
        priorPeriodId: s.periodId,
        responsibleUserId: userId,
      })
      const after = await advisoryLocksHeld(db)
      expect(after).toBeGreaterThan(before)
    })
  })

  it("serializes a concurrent post and close on the same advisory lock", async () => {
    const seed = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2064-01-01",
      periodEnd: "2064-12-31",
    })
    let signalLocked!: () => void
    let releasePost!: () => void
    const locked = new Promise<void>((resolve) => {
      signalLocked = resolve
    })
    const release = new Promise<void>((resolve) => {
      releasePost = resolve
    })

    const posting = withOrganization(orgA, userId, async (db) => {
      await lockPeriodInTx(db, orgA, seed.periodId)
      signalLocked()
      await release
      const event = await createEvent(db, seed.ctx, {
        periodId: seed.periodId,
        seriesId: seed.eventSeriesId,
        description: "Concurrent revenue",
        occurredAt: "2064-06-01",
        responsibleUserId: userId,
      })
      const document = await captureDocument(db, seed.ctx, {
        periodId: seed.periodId,
        seriesId: seed.documentSeriesId,
        type: "INTERNAL",
        issuedAt: "2064-06-01",
        lines: [],
      })
      await postDoubleEntry(db, seed.ctx, {
        periodId: seed.periodId,
        summaryRecordId: document.summaryRecordId,
        accountingEventId: event.eventId,
        postingDate: "2064-06-01",
        responsibleUserId: userId,
        lines: [
          {
            accountId: seed.accounts["221"]!,
            side: "DEBIT",
            amount: "250.00",
          },
          {
            accountId: seed.accounts["602"]!,
            side: "CREDIT",
            amount: "250.00",
          },
        ],
      })
    })
    await locked

    const closing = withOrganization(orgA, userId, (db) =>
      rollForwardPeriod(db, seed.ctx, {
        priorPeriodId: seed.periodId,
        responsibleUserId: userId,
      }),
    )
    const state = await Promise.race([
      closing.then(
        () => "closed",
        () => "failed",
      ),
      new Promise<string>((resolve) =>
        setTimeout(() => resolve("waiting"), 100),
      ),
    ])
    expect(state).toBe("waiting")

    releasePost()
    await posting
    const result = await closing
    expect(result.closeResultPostingId).not.toBeNull()
    expect(result.periodOutputId).not.toBe("")
  })
})
