/**
 * Period lifecycle (§17, ČÚS 002). Closing a period blocks new postings (R12,
 * enforced by a DB trigger; reopening is a privileged cascade). Opening the next
 * period:
 *   1. creates the new účetní období (same regime + accounting currency);
 *   2. copies the chart of accounts forward (a fresh account row per account,
 *      keyed by the stable `number` — D8);
 *   3. posts the opening balances against 701 (počáteční účet rozvažný) as ONE
 *      is_opening posting — for every balance-sheet account (ASSET / LIABILITY /
 *      EQUITY) with a nonzero prior closing balance, an opening line reproduces
 *      that balance on its natural side with a 701 contra. P&L accounts (5xx/6xx)
 *      start each period at zero and never carry forward (ČÚS 002).
 *
 * The opening posting is tagged is_opening: the read-model trigger feeds
 * opening_balance (not turnover) from it, while it still appears in the deník.
 * All amounts are computed in SQL (no JS float). Balance-sheet only — the
 * balance trigger rejects an opening posting that touches a P&L account.
 */

import { sql } from "drizzle-orm"
import { lockPeriodInTx } from "@workspace/db"
import { rows } from "./sql"
import type { RowExecutor } from "./sql"
import { resolveAccountIds } from "./accounts"
import { captureDocument, createEvent } from "./capture"
import { createChart, createPeriod } from "./setup"
import { postDoubleEntry } from "./posting/double-entry"
import { generateOutput } from "./output/index"
import {
  assessPeriodCloseReadinessWithContext,
  PeriodCloseBlockedError,
} from "./close-readiness"
import type { DoubleEntryLineInput, FxRateKind, OrgCtx, Regime } from "./types"

/** Mark a fully checked period closed. The guarded roll-forward is the only caller. */
async function markPeriodClosed(
  db: RowExecutor,
  periodId: string,
): Promise<void> {
  const updated = await rows<{ id: string }>(
    db,
    sql`UPDATE accounting_period
           SET status = 'CLOSED', updated_at = now()
         WHERE id = ${periodId}::uuid
           AND status = 'OPEN'
        RETURNING id`,
  )
  if (!updated[0]) {
    throw new Error("accounting: period could not be marked closed")
  }
}

export interface CloseResultInput {
  periodId: string
  summaryRecordId: string
  accountingEventId: string
  postingDate: string
  responsibleUserId: string
  /** Účet zisků a ztrát; defaults to "710". */
  plCloseAccountNumber?: string
  /** Výsledek hospodaření account; defaults to "431". */
  resultAccountNumber?: string
}

/**
 * Year-end result close (ČÚS 002): close every P&L account (5xx náklady / 6xx
 * výnosy) to 710, then transfer 710's net (výsledek hospodaření) to 431. This is
 * the step that makes the rozvaha foot: without it the prior-year result sits on
 * P&L accounts that never carry forward, so the next period's opening balance
 * sheet would be short by exactly the result. The guarded roll-forward runs this
 * while the prior period is still OPEN.
 *
 * One compound posting: each revenue → MD account / D 710, each expense → MD 710
 * / D account, then MD 710 / D 431 (profit) or MD 431 / D 710 (loss). Balanced by
 * construction (710 is the hub; 431 absorbs the net). Returns null when the
 * period has no P&L movement.
 */
export async function closeResult(
  db: RowExecutor,
  ctx: OrgCtx,
  input: CloseResultInput,
): Promise<{ postingId: string | null }> {
  const plClose = input.plCloseAccountNumber ?? "710"
  const resultAccount = input.resultAccountNumber ?? "431"

  const pl = await rows<{ number: string; nature: string; amt: string }>(
    db,
    sql`SELECT a.number, a.nature, abs(b.closing_balance)::text AS amt
          FROM account_period_balance b
          JOIN account a ON b.account_id = a.id
         WHERE b.period_id = ${input.periodId}::uuid
           AND a.nature IN ('EXPENSE', 'REVENUE')
           AND b.closing_balance <> 0
         ORDER BY a.number`,
  )
  if (pl.length === 0) return { postingId: null }

  // net result = výnosy − náklady (sign + magnitude computed in SQL).
  const result = await rows<{ sgn: number; amt: string }>(
    db,
    sql`SELECT sign(r)::int AS sgn, abs(r)::text AS amt FROM (
           SELECT COALESCE(SUM(CASE WHEN a.nature = 'REVENUE' THEN -b.closing_balance ELSE 0 END), 0)
                - COALESCE(SUM(CASE WHEN a.nature = 'EXPENSE' THEN  b.closing_balance ELSE 0 END), 0) AS r
             FROM account_period_balance b
             JOIN account a ON b.account_id = a.id
            WHERE b.period_id = ${input.periodId}::uuid
              AND a.nature IN ('EXPENSE', 'REVENUE')
         ) t`,
  )
  const net = result[0] as { sgn: number; amt: string }

  const ids = await resolveAccountIds(db, input.periodId, [
    plClose,
    resultAccount,
    ...pl.map((r) => r.number),
  ])
  const closeId = ids.get(plClose) as string

  const lines: DoubleEntryLineInput[] = []
  for (const row of pl) {
    const accountId = ids.get(row.number) as string
    if (row.nature === "REVENUE") {
      // credit-balance account → debit it to zero; contra credits 710
      lines.push({ accountId, side: "DEBIT", amount: row.amt })
      lines.push({ accountId: closeId, side: "CREDIT", amount: row.amt })
    } else {
      // expense debit-balance → credit it to zero; contra debits 710
      lines.push({ accountId, side: "CREDIT", amount: row.amt })
      lines.push({ accountId: closeId, side: "DEBIT", amount: row.amt })
    }
  }
  if (net.sgn !== 0) {
    const resultId = ids.get(resultAccount) as string
    // profit (výnosy > náklady): 710 carries a credit → MD 710 / D 431.
    // loss: MD 431 / D 710.
    if (net.sgn > 0) {
      lines.push({ accountId: closeId, side: "DEBIT", amount: net.amt })
      lines.push({ accountId: resultId, side: "CREDIT", amount: net.amt })
    } else {
      lines.push({ accountId: resultId, side: "DEBIT", amount: net.amt })
      lines.push({ accountId: closeId, side: "CREDIT", amount: net.amt })
    }
  }

  const posting = await postDoubleEntry(db, ctx, {
    periodId: input.periodId,
    summaryRecordId: input.summaryRecordId,
    accountingEventId: input.accountingEventId,
    postingDate: input.postingDate,
    responsibleUserId: input.responsibleUserId,
    lines,
  })
  return { postingId: posting.postingId }
}

/**
 * Copy a chart of accounts forward into a new period. Synthetics are inserted
 * before their analytics (ordered by number length) so parent_id remaps through
 * the old→new id map. Returns the new chart id + a number→new account id map.
 */
export async function copyChartForward(
  db: RowExecutor,
  ctx: OrgCtx,
  fromPeriodId: string,
  toPeriodId: string,
): Promise<{ chartId: string; accountIdByNumber: Map<string, string> }> {
  const chartId = await createChart(db, ctx, { periodId: toPeriodId })
  const src = await rows<{
    id: string
    parent_id: string | null
    number: string
    name: string
    nature: string
    normal_balance: string | null
    tracks_open_items: boolean
    specializes_directive_code: string | null
  }>(
    db,
    sql`SELECT id, parent_id, number, name, nature, normal_balance, tracks_open_items, specializes_directive_code
          FROM account
         WHERE period_id = ${fromPeriodId}::uuid
         ORDER BY length(replace(number, '.', '')), number`,
  )

  const oldToNew = new Map<string, string>()
  const byNumber = new Map<string, string>()
  for (const a of src) {
    const newParent = a.parent_id ? (oldToNew.get(a.parent_id) ?? null) : null
    const inserted = await rows<{ id: string }>(
      db,
      sql`INSERT INTO account
            (organization_id, chart_id, period_id, parent_id, number, name, nature, normal_balance, tracks_open_items, specializes_directive_code)
          VALUES
            (${ctx.organizationId}::uuid, ${chartId}::uuid, ${toPeriodId}::uuid, ${newParent}, ${a.number}, ${a.name},
             ${a.nature}, ${a.normal_balance}, ${a.tracks_open_items}, ${a.specializes_directive_code})
          RETURNING id`,
    )
    const newId = (inserted[0] as { id: string }).id
    oldToNew.set(a.id, newId)
    byNumber.set(a.number, newId)
  }
  return { chartId, accountIdByNumber: byNumber }
}

export interface OpenNextPeriodInput {
  priorPeriodId: string
  periodStart: string
  periodEnd: string
  /** number_series (EVENT) for the internal opening case. */
  eventSeriesId: string
  /** number_series (DOCUMENT) for the internal opening doklad. */
  documentSeriesId: string
  responsibleUserId: string
  /** Defaults to the prior period's accounting currency. */
  accountingCurrency?: string
  /** Defaults to the prior period's fx_rate_policy. */
  fxRatePolicy?: FxRateKind | null
  /** počáteční účet rozvažný; defaults to "701". */
  openingAccountNumber?: string
  /** Opening posting date; defaults to the new period start. */
  postingDate?: string
}

export interface OpenNextPeriodResult {
  newPeriodId: string
  newChartId: string
  /** null when the prior period had no nonzero balance-sheet balances to carry. */
  openingPostingId: string | null
}

/** Open the next period and post opening balances against 701 (R12, ČÚS 002). */
export async function openNextPeriod(
  db: RowExecutor,
  ctx: OrgCtx,
  input: OpenNextPeriodInput,
): Promise<OpenNextPeriodResult> {
  const prior = await rows<{
    regime_code: Regime
    accounting_currency: string
    fx_rate_policy: FxRateKind | null
  }>(
    db,
    sql`SELECT regime_code, accounting_currency, fx_rate_policy
          FROM accounting_period WHERE id = ${input.priorPeriodId}::uuid`,
  )
  const p = prior[0]
  if (!p)
    throw new Error(`accounting: prior period ${input.priorPeriodId} not found`)

  const newPeriodId = await createPeriod(db, ctx, {
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    regimeCode: p.regime_code,
    accountingCurrency: input.accountingCurrency ?? p.accounting_currency,
    fxRatePolicy: input.fxRatePolicy ?? p.fx_rate_policy,
  })

  const { chartId } = await copyChartForward(
    db,
    ctx,
    input.priorPeriodId,
    newPeriodId,
  )

  // Opening balances are a DOUBLE_ENTRY concern only (cash regimes have no chart).
  if (p.regime_code !== "DOUBLE_ENTRY") {
    return { newPeriodId, newChartId: chartId, openingPostingId: null }
  }

  // Prior closing balances of balance-sheet accounts (sign + abs computed in SQL).
  const balances = await rows<{ number: string; sgn: number; amt: string }>(
    db,
    sql`SELECT a.number,
               sign(b.closing_balance)::int AS sgn,
               abs(b.closing_balance)::text AS amt
          FROM account_period_balance b
          JOIN account a ON b.account_id = a.id
         WHERE b.period_id = ${input.priorPeriodId}::uuid
           AND a.nature IN ('ASSET', 'LIABILITY', 'EQUITY')
           AND b.closing_balance <> 0
         ORDER BY a.number`,
  )
  if (balances.length === 0) {
    return { newPeriodId, newChartId: chartId, openingPostingId: null }
  }

  const openingNumber = input.openingAccountNumber ?? "701"
  const postingDate = input.postingDate ?? input.periodStart

  // Resolve the new-period account_id for 701 and every carried account by number.
  const accountRows = await rows<{ number: string; id: string }>(
    db,
    sql`SELECT number, id FROM account WHERE period_id = ${newPeriodId}::uuid`,
  )
  const idByNumber = new Map(accountRows.map((r) => [r.number, r.id]))
  const opening = idByNumber.get(openingNumber)
  if (!opening) {
    throw new Error(
      `accounting: opening account "${openingNumber}" missing from the new chart — cannot carry balances forward`,
    )
  }

  // Internal opening doklad (type INTERNAL): one case + one voucher, no partials,
  // so R6 stays satisfied (no individual_record obligation is created).
  const event = await createEvent(db, ctx, {
    periodId: newPeriodId,
    seriesId: input.eventSeriesId,
    description: "Počáteční stavy rozvahových účtů",
    occurredAt: postingDate,
    responsibleUserId: input.responsibleUserId,
  })
  const doc = await captureDocument(db, ctx, {
    periodId: newPeriodId,
    seriesId: input.documentSeriesId,
    type: "INTERNAL",
    issuedAt: postingDate,
    lines: [],
  })

  const lines: DoubleEntryLineInput[] = []
  for (const b of balances) {
    const accountId = idByNumber.get(b.number) as string
    // debit-balance account (asset, sgn > 0): MD account / D 701.
    // credit-balance account (liability/equity, sgn < 0): MD 701 / D account.
    if (b.sgn > 0) {
      lines.push({ accountId, side: "DEBIT", amount: b.amt })
      lines.push({ accountId: opening, side: "CREDIT", amount: b.amt })
    } else {
      lines.push({ accountId: opening, side: "DEBIT", amount: b.amt })
      lines.push({ accountId, side: "CREDIT", amount: b.amt })
    }
  }

  const posting = await postDoubleEntry(db, ctx, {
    periodId: newPeriodId,
    summaryRecordId: doc.summaryRecordId,
    accountingEventId: event.eventId,
    postingDate,
    responsibleUserId: input.responsibleUserId,
    isOpening: true,
    lines,
  })

  return {
    newPeriodId,
    newChartId: chartId,
    openingPostingId: posting.postingId,
  }
}

// ---------------------------------------------------------------------------
// rollForwardPeriod — end-to-end period close + open next
// ---------------------------------------------------------------------------

export interface RollForwardInput {
  priorPeriodId: string
  responsibleUserId: string
}

export interface RollForwardResult {
  newPeriodId: string
  newChartId: string | null
  openingPostingId: string | null
  closeResultPostingId: string | null
  periodOutputId: string
}

/** Next period starts the day after the prior end and keeps the same fiscal-year cadence. */
function nextPeriodBounds(priorEnd: string): {
  periodStart: string
  periodEnd: string
} {
  const startDate = new Date(`${priorEnd}T00:00:00Z`)
  startDate.setUTCDate(startDate.getUTCDate() + 1)
  const periodStart = startDate.toISOString().slice(0, 10)
  const endDate = new Date(startDate)
  endDate.setUTCFullYear(endDate.getUTCFullYear() + 1)
  endDate.setUTCDate(endDate.getUTCDate() - 1)
  return { periodStart, periodEnd: endDate.toISOString().slice(0, 10) }
}

/**
 * Roll a period forward: (double-entry) post the year-end result close
 * (5xx/6xx → 710 → 431) via an internal uzávěrkový doklad, close the period,
 * then open the next one with the chart copied forward + 701 opening balances.
 *
 * Monetary regimes (single-entry / daňová evidence) have no double-entry result
 * close and no chart to copy — they just close and open a bare next period; the
 * peněžní deník continues via the read model.
 */
export async function rollForwardPeriod(
  db: RowExecutor,
  ctx: OrgCtx,
  input: RollForwardInput,
): Promise<RollForwardResult> {
  const visible = await rows<{ id: string }>(
    db,
    sql`SELECT id
          FROM accounting_period
         WHERE id = ${input.priorPeriodId}::uuid
           AND organization_id = ${ctx.organizationId}::uuid`,
  )
  if (!visible[0]) {
    const missing = await assessPeriodCloseReadinessWithContext(
      db,
      ctx,
      input.priorPeriodId,
    )
    throw new PeriodCloseBlockedError(missing.readiness)
  }

  await lockPeriodInTx(db, ctx.organizationId, input.priorPeriodId)
  const assessment = await assessPeriodCloseReadinessWithContext(
    db,
    ctx,
    input.priorPeriodId,
  )
  if (!assessment.readiness.ready) {
    throw new PeriodCloseBlockedError(assessment.readiness)
  }

  const p = assessment.period
  const eventSeriesId = assessment.numberSeries.eventSeriesId
  const documentSeriesId = assessment.numberSeries.documentSeriesId
  if (!p || !eventSeriesId || !documentSeriesId) {
    throw new Error("accounting: ready close assessment is missing context")
  }
  const bounds = nextPeriodBounds(p.period_end)
  const closingDate = p.period_end

  let closeResultPostingId: string | null = null
  if (p.regime_code === "DOUBLE_ENTRY") {
    // Double-entry year-end result close (§17, ČÚS 002): 5xx/6xx → 710 → 431.
    const ev = await createEvent(db, ctx, {
      periodId: input.priorPeriodId,
      seriesId: eventSeriesId,
      description: "Uzávěrkové operace",
      occurredAt: closingDate,
      responsibleUserId: input.responsibleUserId,
    })
    const doc = await captureDocument(db, ctx, {
      periodId: input.priorPeriodId,
      seriesId: documentSeriesId,
      type: "INTERNAL",
      issuedAt: closingDate,
      lines: [],
    })
    const closed = await closeResult(db, ctx, {
      periodId: input.priorPeriodId,
      summaryRecordId: doc.summaryRecordId,
      accountingEventId: ev.eventId,
      postingDate: closingDate,
      responsibleUserId: input.responsibleUserId,
    })
    closeResultPostingId = closed.postingId

    const afterPosting = await assessPeriodCloseReadinessWithContext(
      db,
      ctx,
      input.priorPeriodId,
    )
    if (!afterPosting.readiness.ready) {
      throw new PeriodCloseBlockedError(afterPosting.readiness)
    }
  }

  const output = await generateOutput(db, ctx, {
    periodId: input.priorPeriodId,
    generatedBy: input.responsibleUserId,
  })
  await markPeriodClosed(db, input.priorPeriodId)

  if (p.regime_code !== "DOUBLE_ENTRY") {
    const newPeriodId = await createPeriod(db, ctx, {
      periodStart: bounds.periodStart,
      periodEnd: bounds.periodEnd,
      regimeCode: p.regime_code,
      accountingCurrency: p.accounting_currency,
      fxRatePolicy: p.fx_rate_policy,
    })
    return {
      newPeriodId,
      newChartId: null,
      openingPostingId: null,
      closeResultPostingId,
      periodOutputId: output.periodOutputId,
    }
  }

  const opened = await openNextPeriod(db, ctx, {
    priorPeriodId: input.priorPeriodId,
    periodStart: bounds.periodStart,
    periodEnd: bounds.periodEnd,
    eventSeriesId,
    documentSeriesId,
    responsibleUserId: input.responsibleUserId,
  })

  return {
    newPeriodId: opened.newPeriodId,
    newChartId: opened.newChartId,
    openingPostingId: opened.openingPostingId,
    closeResultPostingId,
    periodOutputId: output.periodOutputId,
  }
}
