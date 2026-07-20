/**
 * reopenPeriod — storno the year-end close of a CLOSED účetní období (READ-MODEL-
 * DESIGN §3), on a real PG18. The single riskiest accounting operation: it reverses
 * a sealed year append-only (STORNO, never DELETE).
 *
 * The round-trip proves the cascade is a faithful inverse of closePeriod: after a
 * close (N→CLOSED, N+1 carrying the 701) reopenPeriod(N) stornos the three close
 * generations (701 in N+1, 702 in N, 710 in N), flips N back to OPEN, and both
 * periods reconcile. Critically, N+1's Σ|opening_balance| returns to 0 (the 701
 * storno is tagged is_opening), so the double-open guard lets N be re-closed —
 * proving the reopen is a true inverse, not just a status flip.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { sql } from "drizzle-orm"
import { executeRows, withOrganization } from "@workspace/db"
import {
  captureDocument,
  closePeriod,
  createEvent,
  PeriodReopenBlockedError,
  postDoubleEntry,
  reconcileReadModel,
  reopenPeriod,
} from "../src/index"
import {
  adminClient,
  seedDoubleEntryOrg,
  seedTwoOrganizations,
  type DoubleEntrySeed,
} from "./fixtures"

let admin: ReturnType<typeof adminClient>
let workspaceId: string
let orgA: string
let orgB: string
let userId: string
let userBId: string

beforeAll(async () => {
  admin = adminClient()
  const seed = await seedTwoOrganizations(admin)
  workspaceId = seed.workspaceId
  orgA = seed.orgAId
  orgB = seed.orgBId
  userId = seed.userAId
  userBId = seed.userBId
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

/** Σ|opening_balance| across a period — the double-open guard's live-carry test. */
async function sumAbsOpening(periodId: string): Promise<string> {
  const [row] = await admin<Array<{ s: string }>>`
    SELECT COALESCE(SUM(abs(opening_balance)), 0)::text AS s
      FROM account_period_balance WHERE period_id = ${periodId}::uuid`
  return row?.s ?? "0"
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

/** account id for a given number within a specific period (setup helper). */
async function accountIdInPeriod(
  periodId: string,
  number: string,
): Promise<string> {
  const [row] = await admin<Array<{ id: string }>>`
    SELECT id FROM account WHERE period_id = ${periodId}::uuid AND number = ${number}`
  if (!row) throw new Error(`no account ${number} in period ${periodId}`)
  return row.id
}

/** Post a double-entry pair into an ARBITRARY period, resolving THAT period's accounts. */
async function postPairInPeriod(
  organizationId: string,
  ctx: DoubleEntrySeed["ctx"],
  eventSeriesId: string,
  documentSeriesId: string,
  actorId: string,
  periodId: string,
  date: string,
  debit: { number: string; amount: string },
  credit: { number: string; amount: string },
): Promise<void> {
  const debitId = await accountIdInPeriod(periodId, debit.number)
  const creditId = await accountIdInPeriod(periodId, credit.number)
  await withOrganization(organizationId, actorId, async (db) => {
    const event = await createEvent(db, ctx, {
      periodId,
      seriesId: eventSeriesId,
      description: "Booking in a specific period",
      occurredAt: date,
      responsibleUserId: actorId,
    })
    const doc = await captureDocument(db, ctx, {
      periodId,
      seriesId: documentSeriesId,
      type: "INTERNAL",
      issuedAt: date,
      lines: [],
    })
    await postDoubleEntry(db, ctx, {
      periodId,
      summaryRecordId: doc.summaryRecordId,
      accountingEventId: event.eventId,
      postingDate: date,
      responsibleUserId: actorId,
      lines: [
        { accountId: debitId, side: "DEBIT", amount: debit.amount },
        { accountId: creditId, side: "CREDIT", amount: credit.amount },
      ],
    })
  })
}

describe("reopenPeriod", () => {
  it("stornos the three close generations, restores the read-model, and lets N be re-closed", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2090-01-01",
      periodEnd: "2090-12-31",
    })

    // Revenue MD 221 / D 602 = 1000, expense MD 504 / D 321 = 300. Result = 700 profit.
    await postPair(
      s,
      "2090-06-01",
      { number: "221", amount: "1000.00" },
      { number: "602", amount: "1000.00" },
    )
    await postPair(
      s,
      "2090-06-02",
      { number: "504", amount: "300.00" },
      { number: "321", amount: "300.00" },
    )

    const close = await withOrganization(orgA, userId, (db) =>
      closePeriod(db, s.ctx, {
        priorPeriodId: s.periodId,
        responsibleUserId: userId,
      }),
    )
    const nextPeriodId = close.newPeriodId
    expect(close.openingPostingId).not.toBeNull()

    // Pre-reopen: N is CLOSED, N+1 carries a live 701, N's 431 holds the -700 result.
    const [beforeStatus] = await admin<Array<{ status: string }>>`
      SELECT status FROM accounting_period WHERE id = ${s.periodId}::uuid`
    expect(beforeStatus?.status).toBe("CLOSED")
    expect(await closingBalance(s.periodId, s.accounts["431"]!)).toBe(
      "-700.0000",
    )
    expect(await sumAbsOpening(nextPeriodId)).not.toBe("0.0000")

    // --- Reopen N -----------------------------------------------------------
    const reopen = await withOrganization(orgA, userId, (db) =>
      reopenPeriod(db, s.ctx, {
        periodId: s.periodId,
        reopenedBy: userId,
        reason: "correction of prior-year booking",
      }),
    )

    // All three storno generations were posted.
    expect(reopen.resultStornoId).not.toBeNull()
    expect(reopen.balanceStornoId).not.toBeNull()
    expect(reopen.openingStornoId).not.toBeNull()
    expect(reopen.reopenLogId).not.toBe("")

    // N is OPEN again.
    const [afterStatus] = await admin<Array<{ status: string }>>`
      SELECT status FROM accounting_period WHERE id = ${s.periodId}::uuid`
    expect(afterStatus?.status).toBe("OPEN")

    // Exactly three REVERSAL storno postings across N and N+1, matching the ids.
    const stornos = await admin<Array<{ id: string; correction_type: string }>>`
      SELECT id, correction_type FROM posting
       WHERE correction_type = 'REVERSAL'
         AND period_id IN (${s.periodId}::uuid, ${nextPeriodId}::uuid)
       ORDER BY id`
    expect(stornos).toHaveLength(3)
    expect(stornos.every((r) => r.correction_type === "REVERSAL")).toBe(true)
    const stornoIds = new Set(stornos.map((r) => r.id))
    expect(stornoIds).toContain(reopen.resultStornoId!)
    expect(stornoIds).toContain(reopen.balanceStornoId!)
    expect(stornoIds).toContain(reopen.openingStornoId!)

    // The storno tags: 701 storno is is_opening, 702 storno is is_closing, 710 storno is neither.
    const [openingStorno] = await admin<
      Array<{ is_opening: boolean; is_closing: boolean }>
    >`
      SELECT is_opening, is_closing FROM posting WHERE id = ${reopen.openingStornoId!}::uuid`
    expect(openingStorno).toEqual({ is_opening: true, is_closing: false })
    const [balanceStorno] = await admin<
      Array<{ is_opening: boolean; is_closing: boolean }>
    >`
      SELECT is_opening, is_closing FROM posting WHERE id = ${reopen.balanceStornoId!}::uuid`
    expect(balanceStorno).toEqual({ is_opening: false, is_closing: true })
    const [resultStorno] = await admin<
      Array<{ is_opening: boolean; is_closing: boolean }>
    >`
      SELECT is_opening, is_closing FROM posting WHERE id = ${reopen.resultStornoId!}::uuid`
    expect(resultStorno).toEqual({ is_opening: false, is_closing: false })

    // Read-model of both periods reconciles (the storno INSERTs self-corrected it).
    const driftN = await withOrganization(orgA, userId, (db) =>
      reconcileReadModel(db, s.periodId),
    )
    const driftNext = await withOrganization(orgA, userId, (db) =>
      reconcileReadModel(db, nextPeriodId),
    )
    expect(driftN).toEqual([])
    expect(driftNext).toEqual([])

    // Balance-sheet accounts untouched by the result close are unchanged (the 702 +
    // its storno are both read-model-neutral).
    expect(await closingBalance(s.periodId, s.accounts["221"]!)).toBe(
      "1000.0000",
    )
    expect(await closingBalance(s.periodId, s.accounts["321"]!)).toBe(
      "-300.0000",
    )
    // The result close is undone: 431 back to 0, the P&L restored to pre-close (the
    // 710 storno reversed the 5xx/6xx → 710 → 431 transfer).
    expect(await closingBalance(s.periodId, s.accounts["431"]!)).toBe("0.0000")
    expect(await closingBalance(s.periodId, s.accounts["602"]!)).toBe(
      "-1000.0000",
    )
    expect(await closingBalance(s.periodId, s.accounts["504"]!)).toBe(
      "300.0000",
    )

    // The double-open guard invariant: N+1's Σ|opening_balance| is 0, so N re-closes.
    expect(await sumAbsOpening(nextPeriodId)).toBe("0.0000")

    // A period_reopen_log row records the reopen with its storno ids + reason.
    const [log] = await admin<
      Array<{
        period_id: string
        reopened_by: string
        reason: string | null
        result_storno_posting_id: string | null
        balance_storno_posting_id: string | null
        opening_storno_posting_id: string | null
      }>
    >`SELECT period_id, reopened_by, reason,
             result_storno_posting_id, balance_storno_posting_id, opening_storno_posting_id
        FROM period_reopen_log WHERE id = ${reopen.reopenLogId}::uuid`
    expect(log?.period_id).toBe(s.periodId)
    expect(log?.reopened_by).toBe(userId)
    expect(log?.reason).toBe("correction of prior-year booking")
    expect(log?.result_storno_posting_id).toBe(reopen.resultStornoId)
    expect(log?.balance_storno_posting_id).toBe(reopen.balanceStornoId)
    expect(log?.opening_storno_posting_id).toBe(reopen.openingStornoId)

    // The závěrka output is voided by an append-only reversal marker.
    const [voidMarker] = await admin<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM period_output
       WHERE period_id = ${s.periodId}::uuid AND reverses_output_id IS NOT NULL`
    expect(voidMarker?.n).toBe(1)

    // --- Re-close N (proves the reopen is a true inverse, not just a flip) ----
    const reclose = await withOrganization(orgA, userId, (db) =>
      closePeriod(db, s.ctx, {
        priorPeriodId: s.periodId,
        responsibleUserId: userId,
      }),
    )
    expect(reclose.closeResultPostingId).not.toBeNull()
    expect(reclose.closingPostingId).not.toBeNull()
    // The re-close re-carries the 701 into the SAME successor period.
    expect(reclose.newPeriodId).toBe(nextPeriodId)
    expect(reclose.openingPostingId).not.toBeNull()

    const [reclosedStatus] = await admin<Array<{ status: string }>>`
      SELECT status FROM accounting_period WHERE id = ${s.periodId}::uuid`
    expect(reclosedStatus?.status).toBe("CLOSED")

    // The re-close reproduces the year-end state: 431 holds the 700 result again.
    expect(await closingBalance(s.periodId, s.accounts["431"]!)).toBe(
      "-700.0000",
    )
    const driftReclosed = await withOrganization(orgA, userId, (db) =>
      reconcileReadModel(db, s.periodId),
    )
    expect(driftReclosed).toEqual([])
  })

  it("refuses to reopen an OPEN period", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2091-01-01",
      periodEnd: "2091-12-31",
    })
    await postPair(
      s,
      "2091-06-01",
      { number: "221", amount: "500.00" },
      { number: "321", amount: "500.00" },
    )

    await expect(
      withOrganization(orgA, userId, (db) =>
        reopenPeriod(db, s.ctx, { periodId: s.periodId, reopenedBy: userId }),
      ),
    ).rejects.toThrow(PeriodReopenBlockedError)
  })

  it("refuses to reopen N while its successor N+1 is still CLOSED", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2092-01-01",
      periodEnd: "2092-12-31",
    })
    await postPair(
      s,
      "2092-06-01",
      { number: "221", amount: "900.00" },
      { number: "321", amount: "900.00" },
    )

    // Close N → N+1 created; then close N+1 → N+2 created. N+1 is now CLOSED.
    const close = await withOrganization(orgA, userId, (db) =>
      closePeriod(db, s.ctx, {
        priorPeriodId: s.periodId,
        responsibleUserId: userId,
      }),
    )
    await withOrganization(orgA, userId, (db) =>
      closePeriod(db, s.ctx, {
        priorPeriodId: close.newPeriodId,
        responsibleUserId: userId,
      }),
    )

    // Reopening N is refused: its successor is sealed (reopen successors first).
    await expect(
      withOrganization(orgA, userId, (db) =>
        reopenPeriod(db, s.ctx, { periodId: s.periodId, reopenedBy: userId }),
      ),
    ).rejects.toThrow(/later period .* is still CLOSED/)

    // N stayed CLOSED (the refusal rolled the whole tx back).
    const [status] = await admin<Array<{ status: string }>>`
      SELECT status FROM accounting_period WHERE id = ${s.periodId}::uuid`
    expect(status?.status).toBe("CLOSED")
  })

  it("reopens reverse-chronologically without a false RESULT_DISTRIBUTED deadlock", async () => {
    // Close N and N+1 (each with its OWN result-close → a normal MD 710/D 431 posting),
    // then reopen N+1, then reopen N. The 431-distribution guard must exclude N+1's
    // ALREADY-REVERSED result-close, or reopen(N) falsely deadlocks on RESULT_DISTRIBUTED.
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2110-01-01",
      periodEnd: "2110-12-31",
    })
    // N: revenue 1000, expense 300 → profit 700 → a 710/431 result-close in N.
    await postPair(
      s,
      "2110-06-01",
      { number: "221", amount: "1000.00" },
      { number: "602", amount: "1000.00" },
    )
    await postPair(
      s,
      "2110-06-02",
      { number: "504", amount: "300.00" },
      { number: "321", amount: "300.00" },
    )
    const closeN = await withOrganization(orgA, userId, (db) =>
      closePeriod(db, s.ctx, {
        priorPeriodId: s.periodId,
        responsibleUserId: userId,
      }),
    )
    const nPlus1 = closeN.newPeriodId

    // N+1 gets its OWN P&L (revenue 400) → its own 710/431 result-close.
    await postPairInPeriod(
      orgA,
      s.ctx,
      s.eventSeriesId,
      s.documentSeriesId,
      userId,
      nPlus1,
      "2111-06-01",
      { number: "221", amount: "400.00" },
      { number: "602", amount: "400.00" },
    )
    const closeNext = await withOrganization(orgA, userId, (db) =>
      closePeriod(db, s.ctx, {
        priorPeriodId: nPlus1,
        responsibleUserId: userId,
      }),
    )
    expect(closeNext.closeResultPostingId).not.toBeNull()

    // Reopen N+1 first (reverse-chronological). This reverses N+1's own 710/431.
    const reopenNext = await withOrganization(orgA, userId, (db) =>
      reopenPeriod(db, s.ctx, { periodId: nPlus1, reopenedBy: userId }),
    )
    expect(reopenNext.resultStornoId).not.toBeNull()
    expect(
      await withOrganization(orgA, userId, (db) =>
        reconcileReadModel(db, nPlus1),
      ),
    ).toEqual([])

    // Reopen N. Without the reversed-exclusion this throws RESULT_DISTRIBUTED because
    // N+1's (now reversed) result-close is a normal 431 posting in a later period.
    const reopenN = await withOrganization(orgA, userId, (db) =>
      reopenPeriod(db, s.ctx, { periodId: s.periodId, reopenedBy: userId }),
    )
    expect(reopenN.openingStornoId).not.toBeNull() // N+1's incoming 701 reversed
    expect(reopenN.resultStornoId).not.toBeNull() // N's own 710 reversed

    // Both periods reconcile and N is OPEN again.
    expect(
      await withOrganization(orgA, userId, (db) =>
        reconcileReadModel(db, s.periodId),
      ),
    ).toEqual([])
    expect(
      await withOrganization(orgA, userId, (db) =>
        reconcileReadModel(db, nPlus1),
      ),
    ).toEqual([])
    const [status] = await admin<Array<{ status: string }>>`
      SELECT status FROM accounting_period WHERE id = ${s.periodId}::uuid`
    expect(status?.status).toBe("OPEN")
  })

  it("refuses to reopen after a genuine 431 → 428 result distribution", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2120-01-01",
      periodEnd: "2120-12-31",
    })
    await postPair(
      s,
      "2120-06-01",
      { number: "221", amount: "1000.00" },
      { number: "602", amount: "1000.00" },
    )
    await postPair(
      s,
      "2120-06-02",
      { number: "504", amount: "300.00" },
      { number: "321", amount: "300.00" },
    )
    const close = await withOrganization(orgA, userId, (db) =>
      closePeriod(db, s.ctx, {
        priorPeriodId: s.periodId,
        responsibleUserId: userId,
      }),
    )

    // Distribute the výsledek hospodaření: MD 431 / D 428 in N+1 (a genuine, NON-reversed
    // normal posting on 431). Reopening N after this would corrupt equity.
    await postPairInPeriod(
      orgA,
      s.ctx,
      s.eventSeriesId,
      s.documentSeriesId,
      userId,
      close.newPeriodId,
      "2121-03-01",
      { number: "431", amount: "700.00" },
      { number: "428", amount: "700.00" },
    )

    await expect(
      withOrganization(orgA, userId, (db) =>
        reopenPeriod(db, s.ctx, { periodId: s.periodId, reopenedBy: userId }),
      ),
    ).rejects.toThrow(/distributed/)

    // N stayed CLOSED (the refusal rolled the whole tx back).
    const [status] = await admin<Array<{ status: string }>>`
      SELECT status FROM accounting_period WHERE id = ${s.periodId}::uuid`
    expect(status?.status).toBe("CLOSED")
  })

  it("refuses to reopen after a SUPPLEMENTARY (doplňkový) 431 distribution in a later period", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2125-01-01",
      periodEnd: "2125-12-31",
    })
    await postPair(
      s,
      "2125-06-01",
      { number: "221", amount: "1000.00" },
      { number: "602", amount: "1000.00" },
    )
    await postPair(
      s,
      "2125-06-02",
      { number: "504", amount: "300.00" },
      { number: "321", amount: "300.00" },
    )
    const close = await withOrganization(orgA, userId, (db) =>
      closePeriod(db, s.ctx, {
        priorPeriodId: s.periodId,
        responsibleUserId: userId,
      }),
    )
    const nPlus1 = close.newPeriodId
    expect(close.openingPostingId).not.toBeNull()

    // A doplňkový (SUPPLEMENTARY) correction on 431 in N+1: MD 431 / D 428 = 700 — a
    // genuine, NON-reversed distribution of the výsledek hospodaření booked as a
    // SUPPLEMENTARY correction (correctsPostingId set) rather than a plain posting.
    // The guard must still trip: it now keys on correction_type IS DISTINCT FROM
    // 'REVERSAL' (not corrects_posting_id IS NULL), so a SUPPLEMENTARY — which by
    // definition carries a corrects_posting_id — is no longer wrongly skipped.
    const debit431 = await accountIdInPeriod(nPlus1, "431")
    const credit428 = await accountIdInPeriod(nPlus1, "428")
    await withOrganization(orgA, userId, async (db) => {
      const event = await createEvent(db, s.ctx, {
        periodId: nPlus1,
        seriesId: s.eventSeriesId,
        description: "Doplňkový zápis rozdělení VH",
        occurredAt: "2126-03-01",
        responsibleUserId: userId,
      })
      const doc = await captureDocument(db, s.ctx, {
        periodId: nPlus1,
        seriesId: s.documentSeriesId,
        type: "INTERNAL",
        issuedAt: "2126-03-01",
        lines: [],
      })
      await postDoubleEntry(db, s.ctx, {
        periodId: nPlus1,
        summaryRecordId: doc.summaryRecordId,
        accountingEventId: event.eventId,
        postingDate: "2126-03-01",
        responsibleUserId: userId,
        correctsPostingId: close.openingPostingId!,
        correctionType: "SUPPLEMENTARY",
        lines: [
          { accountId: debit431, side: "DEBIT", amount: "700.00" },
          { accountId: credit428, side: "CREDIT", amount: "700.00" },
        ],
      })
    })

    await expect(
      withOrganization(orgA, userId, (db) =>
        reopenPeriod(db, s.ctx, { periodId: s.periodId, reopenedBy: userId }),
      ),
    ).rejects.toThrow(/distributed/)

    // N stayed CLOSED (the refusal rolled the whole tx back).
    const [status] = await admin<Array<{ status: string }>>`
      SELECT status FROM accounting_period WHERE id = ${s.periodId}::uuid`
    expect(status?.status).toBe("CLOSED")
  })

  it("reverses only the 701 carry in N+1 and preserves N+1's own postings", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2130-01-01",
      periodEnd: "2130-12-31",
    })
    await postPair(
      s,
      "2130-06-01",
      { number: "221", amount: "1000.00" },
      { number: "602", amount: "1000.00" },
    )
    await postPair(
      s,
      "2130-06-02",
      { number: "504", amount: "300.00" },
      { number: "321", amount: "300.00" },
    )
    const close = await withOrganization(orgA, userId, (db) =>
      closePeriod(db, s.ctx, {
        priorPeriodId: s.periodId,
        responsibleUserId: userId,
      }),
    )
    const nPlus1 = close.newPeriodId

    // N+1's OWN activity (a normal posting, not a close generation): revenue 250.
    await postPairInPeriod(
      orgA,
      s.ctx,
      s.eventSeriesId,
      s.documentSeriesId,
      userId,
      nPlus1,
      "2131-06-01",
      { number: "221", amount: "250.00" },
      { number: "602", amount: "250.00" },
    )

    const reopen = await withOrganization(orgA, userId, (db) =>
      reopenPeriod(db, s.ctx, { periodId: s.periodId, reopenedBy: userId }),
    )

    // Exactly ONE reversal was posted into N+1 — the 701 opening storno — and nothing
    // else in N+1 was touched.
    const nextReversals = await admin<Array<{ id: string }>>`
      SELECT id FROM posting
       WHERE period_id = ${nPlus1}::uuid AND correction_type = 'REVERSAL'
       ORDER BY id`
    expect(nextReversals).toHaveLength(1)
    expect(nextReversals[0]!.id).toBe(reopen.openingStornoId)

    // N+1's own revenue survives untouched (602 = -250; P&L never carries via 701, so
    // the opening storno cannot have touched it).
    const nextRevenueId = await accountIdInPeriod(nPlus1, "602")
    expect(await closingBalance(nPlus1, nextRevenueId)).toBe("-250.0000")

    // Both periods reconcile.
    expect(
      await withOrganization(orgA, userId, (db) =>
        reconcileReadModel(db, s.periodId),
      ),
    ).toEqual([])
    expect(
      await withOrganization(orgA, userId, (db) =>
        reconcileReadModel(db, nPlus1),
      ),
    ).toEqual([])
  })

  it("round-trips the 702/701 stornos for a period with no P&L movement", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2140-01-01",
      periodEnd: "2140-12-31",
    })
    // Balance-sheet-only activity: no 5xx/6xx → closeResult returns null.
    await postPair(
      s,
      "2140-06-01",
      { number: "221", amount: "500.00" },
      { number: "321", amount: "500.00" },
    )
    const close = await withOrganization(orgA, userId, (db) =>
      closePeriod(db, s.ctx, {
        priorPeriodId: s.periodId,
        responsibleUserId: userId,
      }),
    )
    expect(close.closeResultPostingId).toBeNull() // no P&L result
    expect(close.closingPostingId).not.toBeNull() // 702 closed 221/321
    expect(close.openingPostingId).not.toBeNull() // 701 carried them

    const reopen = await withOrganization(orgA, userId, (db) =>
      reopenPeriod(db, s.ctx, { periodId: s.periodId, reopenedBy: userId }),
    )
    // No 710 to storno, but the 702 + 701 stornos still round-trip.
    expect(reopen.resultStornoId).toBeNull()
    expect(reopen.balanceStornoId).not.toBeNull()
    expect(reopen.openingStornoId).not.toBeNull()

    expect(
      await withOrganization(orgA, userId, (db) =>
        reconcileReadModel(db, s.periodId),
      ),
    ).toEqual([])
    expect(
      await withOrganization(orgA, userId, (db) =>
        reconcileReadModel(db, close.newPeriodId),
      ),
    ).toEqual([])
    const [status] = await admin<Array<{ status: string }>>`
      SELECT status FROM accounting_period WHERE id = ${s.periodId}::uuid`
    expect(status?.status).toBe("OPEN")
  })

  it("does not leak the app_admin role past the reopen (cross-org read stays RLS-blocked)", async () => {
    // orgB owns a period that orgA's app_user must never see.
    const other = await seedDoubleEntryOrg(orgB, workspaceId, userBId, {
      periodStart: "2150-01-01",
      periodEnd: "2150-12-31",
    })
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2150-01-01",
      periodEnd: "2150-12-31",
    })
    await postPair(
      s,
      "2150-06-01",
      { number: "221", amount: "600.00" },
      { number: "321", amount: "600.00" },
    )
    await withOrganization(orgA, userId, (db) =>
      closePeriod(db, s.ctx, {
        priorPeriodId: s.periodId,
        responsibleUserId: userId,
      }),
    )

    // In ONE org-bound tx: reopen, then read an orgB row. If the reopen leaked the
    // elevated app_admin (BYPASSRLS) role, the orgB period becomes visible — RLS defeated.
    const leaked = await withOrganization(orgA, userId, async (db) => {
      await reopenPeriod(db, s.ctx, {
        periodId: s.periodId,
        reopenedBy: userId,
      })
      return executeRows<{ id: string }>(
        db,
        sql`SELECT id FROM accounting_period WHERE id = ${other.periodId}::uuid`,
      )
    })
    expect(leaked).toHaveLength(0)
  })
})
