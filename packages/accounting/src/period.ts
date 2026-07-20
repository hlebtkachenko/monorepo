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
    tax_relevant: boolean | null
    specializes_directive_code: string | null
  }>(
    db,
    sql`SELECT id, parent_id, number, name, nature, normal_balance, tracks_open_items, tax_relevant, specializes_directive_code
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
            (organization_id, chart_id, period_id, parent_id, number, name, nature, normal_balance, tracks_open_items, tax_relevant, specializes_directive_code)
          VALUES
            (${ctx.organizationId}::uuid, ${chartId}::uuid, ${toPeriodId}::uuid, ${newParent}, ${a.number}, ${a.name},
             ${a.nature}, ${a.normal_balance}, ${a.tracks_open_items}, ${a.tax_relevant}, ${a.specializes_directive_code})
          RETURNING id`,
    )
    const newId = (inserted[0] as { id: string }).id
    oldToNew.set(a.id, newId)
    byNumber.set(a.number, newId)
  }
  return { chartId, accountIdByNumber: byNumber }
}

export interface OpenPeriodInput {
  /** The period to copy chart + regime / currency / fx forward from. */
  priorPeriodId: string
  periodStart: string
  periodEnd: string
  /** Defaults to the prior period's accounting currency. */
  accountingCurrency?: string
  /** Defaults to the prior period's fx_rate_policy. */
  fxRatePolicy?: FxRateKind | null
}

export interface OpenPeriodResult {
  newPeriodId: string
  newChartId: string
  /** Regime copied from the prior period — lets a caller gate double-entry-only follow-ups (e.g. the 701 post). */
  regimeCode: Regime
}

/**
 * Open a new účetní období DECOUPLED from closing the prior one: create the period
 * (same regime + accounting currency + fx_rate_policy as the prior) and copy its
 * chart of accounts forward. It does NOT post opening balances (701): a period N+1
 * may be opened while N is still OPEN, so its opening balances are not yet final —
 * `closePeriod` posts the 701 exactly once as part of the carryover. (Historically
 * `openNextPeriod` did open + 701 in one shot; it now = `openPeriod` + the 701 post.)
 */
export async function openPeriod(
  db: RowExecutor,
  ctx: OrgCtx,
  input: OpenPeriodInput,
): Promise<OpenPeriodResult> {
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

  return { newPeriodId, newChartId: chartId, regimeCode: p.regime_code }
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

/**
 * Post the 701 opening balances (počáteční účet rozvažný) INTO a target period:
 * for every balance-sheet account (ASSET / LIABILITY / EQUITY) with a nonzero
 * prior closing balance, carry that balance onto its natural side with a 701
 * contra, as ONE is_opening posting. Extracted so openNextPeriod (open + carry in
 * one shot) and closePeriod (carry into a possibly pre-opened next period) share a
 * single sign convention. The read-model trigger feeds opening_balance (not
 * turnover) from an is_opening line; the balance trigger rejects an opening
 * posting touching a P&L account. Returns null when there is nothing to carry.
 */
async function postOpeningBalances(
  db: RowExecutor,
  ctx: OrgCtx,
  input: {
    priorPeriodId: string
    targetPeriodId: string
    eventSeriesId: string
    documentSeriesId: string
    responsibleUserId: string
    openingAccountNumber?: string
    postingDate: string
  },
): Promise<string | null> {
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
  if (balances.length === 0) return null

  const openingNumber = input.openingAccountNumber ?? "701"

  // Resolve the target-period account_id for 701 and every carried account by number.
  const accountRows = await rows<{ number: string; id: string }>(
    db,
    sql`SELECT number, id FROM account WHERE period_id = ${input.targetPeriodId}::uuid`,
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
    periodId: input.targetPeriodId,
    seriesId: input.eventSeriesId,
    description: "Počáteční stavy rozvahových účtů",
    occurredAt: input.postingDate,
    responsibleUserId: input.responsibleUserId,
  })
  const doc = await captureDocument(db, ctx, {
    periodId: input.targetPeriodId,
    seriesId: input.documentSeriesId,
    type: "INTERNAL",
    issuedAt: input.postingDate,
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
    periodId: input.targetPeriodId,
    summaryRecordId: doc.summaryRecordId,
    accountingEventId: event.eventId,
    postingDate: input.postingDate,
    responsibleUserId: input.responsibleUserId,
    isOpening: true,
    lines,
  })

  return posting.postingId
}

/** Open the next period and post opening balances against 701 (R12, ČÚS 002). */
export async function openNextPeriod(
  db: RowExecutor,
  ctx: OrgCtx,
  input: OpenNextPeriodInput,
): Promise<OpenNextPeriodResult> {
  const { newPeriodId, newChartId, regimeCode } = await openPeriod(db, ctx, {
    priorPeriodId: input.priorPeriodId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    accountingCurrency: input.accountingCurrency,
    fxRatePolicy: input.fxRatePolicy,
  })

  // Opening balances are a DOUBLE_ENTRY concern only (cash regimes have no chart).
  if (regimeCode !== "DOUBLE_ENTRY") {
    return { newPeriodId, newChartId, openingPostingId: null }
  }

  const openingPostingId = await postOpeningBalances(db, ctx, {
    priorPeriodId: input.priorPeriodId,
    targetPeriodId: newPeriodId,
    eventSeriesId: input.eventSeriesId,
    documentSeriesId: input.documentSeriesId,
    responsibleUserId: input.responsibleUserId,
    openingAccountNumber: input.openingAccountNumber,
    postingDate: input.postingDate ?? input.periodStart,
  })

  return { newPeriodId, newChartId, openingPostingId }
}

// ---------------------------------------------------------------------------
// closePeriod — end-to-end year-end close (result + 702 + output + carryover)
// rollForwardPeriod — thin backward-compatible wrapper over closePeriod
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
 * 702 balance-close (Konečný účet rozvažný, ČÚS 002): after the result close has
 * moved the P&L result onto 431, close EVERY balance-sheet account (ASSET /
 * LIABILITY / EQUITY, including 431) with a nonzero konečný stav to 702 as ONE
 * compound is_closing posting — a debit-balance account is CREDITED (702 DEBIT), a
 * credit-balance account is DEBITED (702 CREDIT). is_closing keeps this posting
 * read-model-neutral (migration 0071): closing_balance stays the carryover /
 * rozvaha source of truth, and 702 is a faithful deník + verification artifact.
 *
 * KÚR balance-equation check: the net of 702's OWN lines (Σ DEBIT − Σ CREDIT on
 * account 702) equals Σ(balance-sheet closing_balances) = assets − (liabilities +
 * equity), which must be zero. The posting is internally balanced by construction
 * (each account is offset by a 702 line), so its whole-posting sum is trivially
 * zero and proves nothing — only 702's own net proves the equation. It is asserted
 * exactly in SQL from the persisted lines; a nonzero net means the books do not
 * foot and aborts the transaction. Returns null when there is nothing to close.
 */
async function closeBalanceSheetTo702(
  db: RowExecutor,
  ctx: OrgCtx,
  input: {
    periodId: string
    closingDate: string
    eventSeriesId: string
    documentSeriesId: string
    responsibleUserId: string
    closingAccountNumber?: string
  },
): Promise<string | null> {
  const closingNumber = input.closingAccountNumber ?? "702"

  // Balance-sheet konečné stavy (sign + abs computed in SQL, mirror of the 701
  // opening query) — 431 already carries the result after the result close.
  const balances = await rows<{ number: string; sgn: number; amt: string }>(
    db,
    sql`SELECT a.number,
               sign(b.closing_balance)::int AS sgn,
               abs(b.closing_balance)::text AS amt
          FROM account_period_balance b
          JOIN account a ON b.account_id = a.id
         WHERE b.period_id = ${input.periodId}::uuid
           AND a.nature IN ('ASSET', 'LIABILITY', 'EQUITY')
           AND b.closing_balance <> 0
         ORDER BY a.number`,
  )
  if (balances.length === 0) return null

  const ids = await resolveAccountIds(db, input.periodId, [
    closingNumber,
    ...balances.map((r) => r.number),
  ])
  const closingId = ids.get(closingNumber) as string

  // Internal uzávěrkový doklad (type INTERNAL): one case + one voucher, no
  // partials, so R6 stays satisfied (mirror of the 701 opening doklad).
  const event = await createEvent(db, ctx, {
    periodId: input.periodId,
    seriesId: input.eventSeriesId,
    description: "Uzavření rozvahových účtů (702)",
    occurredAt: input.closingDate,
    responsibleUserId: input.responsibleUserId,
  })
  const doc = await captureDocument(db, ctx, {
    periodId: input.periodId,
    seriesId: input.documentSeriesId,
    type: "INTERNAL",
    issuedAt: input.closingDate,
    lines: [],
  })

  const lines: DoubleEntryLineInput[] = []
  for (const b of balances) {
    const accountId = ids.get(b.number) as string
    // debit-balance account (asset, sgn > 0): CREDIT it to zero / MD 702.
    // credit-balance account (liability/equity, sgn < 0): DEBIT it to zero / D 702.
    if (b.sgn > 0) {
      lines.push({ accountId, side: "CREDIT", amount: b.amt })
      lines.push({ accountId: closingId, side: "DEBIT", amount: b.amt })
    } else {
      lines.push({ accountId, side: "DEBIT", amount: b.amt })
      lines.push({ accountId: closingId, side: "CREDIT", amount: b.amt })
    }
  }

  const posting = await postDoubleEntry(db, ctx, {
    periodId: input.periodId,
    summaryRecordId: doc.summaryRecordId,
    accountingEventId: event.eventId,
    postingDate: input.closingDate,
    responsibleUserId: input.responsibleUserId,
    isClosing: true,
    lines,
  })

  // KÚR zero-check — assert 702's own net (not the whole posting) is exactly zero.
  const [kur] = await rows<{ balanced: boolean; net: string }>(
    db,
    sql`SELECT COALESCE(SUM(CASE WHEN side = 'DEBIT' THEN amount ELSE -amount END), 0) = 0 AS balanced,
               COALESCE(SUM(CASE WHEN side = 'DEBIT' THEN amount ELSE -amount END), 0)::text AS net
          FROM posting_double_entry_line
         WHERE posting_id = ${posting.postingId}::uuid
           AND account_id = ${closingId}::uuid`,
  )
  if (!kur || !kur.balanced) {
    throw new Error(
      `accounting: 702 balance-close does not foot — konečný účet rozvažný net = ${kur?.net ?? "unknown"} (assets ≠ liabilities + equity; KÚR balance-equation check, ČÚS 002)`,
    )
  }

  return posting.postingId
}

export interface ClosePeriodInput {
  priorPeriodId: string
  responsibleUserId: string
}

export interface ClosePeriodResult {
  /** 5xx/6xx → 710 → 431 result-close posting; null for a monetary regime. */
  closeResultPostingId: string | null
  /** 702 balance-close posting; null with no balance-sheet balance / monetary regime. */
  closingPostingId: string | null
  /** 701 opening posting carried into the next period; null for a monetary regime / empty carry. */
  openingPostingId: string | null
  newPeriodId: string
  newChartId: string | null
  periodOutputId: string
}

/**
 * Close an účetní období end to end, inside the single transaction the caller
 * opens (a withOrganization tx). Ordered steps (§17, ČÚS 002):
 *   1. readiness gate (assessPeriodCloseReadinessWithContext) — blocked ⇒ throw;
 *   2. result close 5xx/6xx → 710 → 431 (closeResult), zeroing the P&L onto 431;
 *   3. 702 balance-close of every balance-sheet account incl. 431, with the KÚR
 *      balance-equation check (read-model-neutral, is_closing);
 *   4. generate the účetní závěrka output; 5. mark the period CLOSED;
 *   6. carryover: find-or-create the next period (bounds = day after this end),
 *      then post the 701 opening ONCE — refused if the target already carries live
 *      opening balances (double-open guard).
 * Monetary regimes (single-entry / daňová evidence) skip 2/3 and the 701: they
 * gate, output, close, and open a bare next period (no chart, no opening posting).
 * Everything is one tx — any throw rolls the whole close back.
 */
export async function closePeriod(
  db: RowExecutor,
  ctx: OrgCtx,
  input: ClosePeriodInput,
): Promise<ClosePeriodResult> {
  // 1. Readiness gate: a period invisible to this org, or one that fails any
  // BLOCKER check, throws PeriodCloseBlockedError.
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
  let closingPostingId: string | null = null

  if (p.regime_code === "DOUBLE_ENTRY") {
    // 2. Result close (§17, ČÚS 002): 5xx/6xx → 710 → 431, via an internal doklad.
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

    // Re-check the read-model after the result-close postings, before the 702
    // seals the balance sheet (identical to the historical guarded roll-forward).
    const afterPosting = await assessPeriodCloseReadinessWithContext(
      db,
      ctx,
      input.priorPeriodId,
    )
    if (!afterPosting.readiness.ready) {
      throw new PeriodCloseBlockedError(afterPosting.readiness)
    }

    // 3. 702 balance-close + KÚR balance-equation check.
    closingPostingId = await closeBalanceSheetTo702(db, ctx, {
      periodId: input.priorPeriodId,
      closingDate,
      eventSeriesId,
      documentSeriesId,
      responsibleUserId: input.responsibleUserId,
    })
  }

  // 4. Účetní závěrka output (R6-gated) and 5. seal the period.
  const output = await generateOutput(db, ctx, {
    periodId: input.priorPeriodId,
    generatedBy: input.responsibleUserId,
  })
  await markPeriodClosed(db, input.priorPeriodId)

  // 6. Carryover. Monetary regimes have no chart / opening balances — open a bare
  // next period and stop.
  if (p.regime_code !== "DOUBLE_ENTRY") {
    const newPeriodId = await createPeriod(db, ctx, {
      periodStart: bounds.periodStart,
      periodEnd: bounds.periodEnd,
      regimeCode: p.regime_code,
      accountingCurrency: p.accounting_currency,
      fxRatePolicy: p.fx_rate_policy,
    })
    return {
      closeResultPostingId,
      closingPostingId,
      openingPostingId: null,
      newPeriodId,
      newChartId: null,
      periodOutputId: output.periodOutputId,
    }
  }

  // Double-entry carryover: target an already-open next period with these exact
  // bounds if one exists (the "open N+1 early" path), else create it (chart copied
  // forward, no 701). The 701 opening is posted exactly once, only here.
  const existing = await rows<{ id: string }>(
    db,
    sql`SELECT id
          FROM accounting_period
         WHERE organization_id = ${ctx.organizationId}::uuid
           AND period_start = ${bounds.periodStart}::date
           AND period_end = ${bounds.periodEnd}::date
         ORDER BY created_at, id
         LIMIT 1`,
  )
  let newPeriodId: string
  let newChartId: string | null
  if (existing[0]) {
    newPeriodId = existing[0].id
    const chart = await rows<{ id: string }>(
      db,
      sql`SELECT id FROM chart_of_accounts WHERE period_id = ${newPeriodId}::uuid`,
    )
    newChartId = chart[0]?.id ?? null
  } else {
    const opened = await openPeriod(db, ctx, {
      priorPeriodId: input.priorPeriodId,
      periodStart: bounds.periodStart,
      periodEnd: bounds.periodEnd,
    })
    newPeriodId = opened.newPeriodId
    newChartId = opened.newChartId
  }

  // Double-open guard (net-balance, not presence): refuse a second 701 into a
  // target that already holds live opening balances. A reopen stornos the 701 with
  // reversal is_opening lines that return every account's opening_balance to zero,
  // so a net-of-abs test — not "an is_opening posting exists", and not
  // Σ(opening_balance) which is always zero for any balanced 701 — still lets a
  // reopened period be re-closed while catching a live carry.
  const [openState] = await rows<{ has_live_openings: boolean }>(
    db,
    sql`SELECT COALESCE(SUM(abs(opening_balance)), 0) <> 0 AS has_live_openings
          FROM account_period_balance
         WHERE period_id = ${newPeriodId}::uuid`,
  )
  if (openState?.has_live_openings) {
    throw new Error(
      `accounting: next period ${newPeriodId} already carries opening balances — refusing to post a second 701 (double-open guard)`,
    )
  }

  const openingPostingId = await postOpeningBalances(db, ctx, {
    priorPeriodId: input.priorPeriodId,
    targetPeriodId: newPeriodId,
    eventSeriesId,
    documentSeriesId,
    responsibleUserId: input.responsibleUserId,
    postingDate: bounds.periodStart,
  })

  return {
    closeResultPostingId,
    closingPostingId,
    openingPostingId,
    newPeriodId,
    newChartId,
    periodOutputId: output.periodOutputId,
  }
}

/**
 * Roll a period forward = closePeriod, kept as a thin compatibility wrapper over
 * the fuller close (which now also posts the 702 balance-close). The historical
 * RollForwardResult shape is preserved by remapping closePeriod's result.
 */
export async function rollForwardPeriod(
  db: RowExecutor,
  ctx: OrgCtx,
  input: RollForwardInput,
): Promise<RollForwardResult> {
  const result = await closePeriod(db, ctx, {
    priorPeriodId: input.priorPeriodId,
    responsibleUserId: input.responsibleUserId,
  })
  return {
    newPeriodId: result.newPeriodId,
    newChartId: result.newChartId,
    openingPostingId: result.openingPostingId,
    closeResultPostingId: result.closeResultPostingId,
    periodOutputId: result.periodOutputId,
  }
}
