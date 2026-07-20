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
import { lockPeriodInTx, withAdminBypass } from "@workspace/db"
import { rows } from "./sql"
import type { RowExecutor } from "./sql"
import { resolveAccountIds } from "./accounts"
import { captureDocument, createEvent } from "./capture"
import { createChart, createPeriod } from "./setup"
import { postDoubleEntry } from "./posting/double-entry"
import { reverse } from "./corrections"
import { reconcileReadModel } from "./invariants"
import { generateOutput } from "./output/index"
import {
  assessPeriodCloseReadinessWithContext,
  PeriodCloseBlockedError,
} from "./close-readiness"
import type { DoubleEntryLineInput, FxRateKind, OrgCtx, Regime } from "./types"

/**
 * Uzávěrkové účty (ČÚS 002) shared by the year-end close and its reopen inverse, so
 * both agree on the exact account numbers: 701 počáteční účet rozvažný (opening carry),
 * 702 konečný účet rozvažný (balance-close), 710 účet zisků a ztrát (result-close),
 * 431 výsledek hospodaření ve schvalování (result).
 */
const UZAVERKA_ACCOUNT = {
  opening: "701",
  balanceClose: "702",
  resultClose: "710",
  result: "431",
} as const

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
  const plClose = input.plCloseAccountNumber ?? UZAVERKA_ACCOUNT.resultClose
  const resultAccount = input.resultAccountNumber ?? UZAVERKA_ACCOUNT.result

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
 * `closePeriod` posts the 701 exactly once as part of the carryover. That 701 post
 * is the `postOpeningBalances` primitive, invoked only from that carryover.
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

export interface PostOpeningBalancesInput {
  /** The just-closed period whose konečné stavy seed the carry. */
  priorPeriodId: string
  /** The period the 701 opening posts INTO (its chart must already exist). */
  targetPeriodId: string
  /** number_series (EVENT) for the internal opening case. */
  eventSeriesId: string
  /** number_series (DOCUMENT) for the internal opening doklad. */
  documentSeriesId: string
  responsibleUserId: string
  /** počáteční účet rozvažný; defaults to "701". */
  openingAccountNumber?: string
  /** Opening posting date (deník order + period membership). */
  postingDate: string
}

/**
 * Post the 701 opening balances (počáteční účet rozvažný) INTO a target period:
 * for every balance-sheet account (ASSET / LIABILITY / EQUITY) with a nonzero
 * prior closing balance, carry that balance onto its natural side with a 701
 * contra, as ONE is_opening posting. `closePeriod` calls this exactly once during
 * its carryover — after finding-or-creating the successor — to seed that period's
 * opening balances (the single production caller). The read-model trigger feeds
 * opening_balance (not turnover) from an is_opening line; the balance trigger
 * rejects an opening posting touching a P&L account. Returns null when there is
 * nothing to carry.
 */
export async function postOpeningBalances(
  db: RowExecutor,
  ctx: OrgCtx,
  input: PostOpeningBalancesInput,
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

  const openingNumber = input.openingAccountNumber ?? UZAVERKA_ACCOUNT.opening

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
  const closingNumber =
    input.closingAccountNumber ?? UZAVERKA_ACCOUNT.balanceClose

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
 *   6. carryover: find-or-create the successor (keyed by its start = day after this
 *      end, invariant regardless of fiscal-year length), then post the 701 opening
 *      ONCE — refused if the target already carries live opening balances
 *      (double-open guard).
 * Monetary regimes (single-entry / daňová evidence) skip 2/3 and the 701: they
 * gate, output, close, and find-or-create a bare next period (no chart, no opening
 * posting).
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

  // 6. Carryover. Monetary regimes have no chart / opening balances — find-or-create
  // a bare next period and stop. Keyed by START ONLY (the day after this period's
  // end is invariant regardless of the successor's fiscal-year length), so an
  // early-opened N+1 with an irregular / short end is matched, never duplicated.
  if (p.regime_code !== "DOUBLE_ENTRY") {
    const existingMonetary = await rows<{ id: string }>(
      db,
      sql`SELECT id
            FROM accounting_period
           WHERE organization_id = ${ctx.organizationId}::uuid
             AND period_start = ${bounds.periodStart}::date
           ORDER BY created_at, id
           LIMIT 1`,
    )
    const newPeriodId =
      existingMonetary[0]?.id ??
      (await createPeriod(db, ctx, {
        periodStart: bounds.periodStart,
        periodEnd: bounds.periodEnd,
        regimeCode: p.regime_code,
        accountingCurrency: p.accounting_currency,
        fxRatePolicy: p.fx_rate_policy,
      }))
    return {
      closeResultPostingId,
      closingPostingId,
      openingPostingId: null,
      newPeriodId,
      newChartId: null,
      periodOutputId: output.periodOutputId,
    }
  }

  // Double-entry carryover: target an already-open next period if one exists (the
  // "open N+1 early" path), else create it (chart copied forward, no 701). The
  // successor is keyed by its START ONLY — the day after this period's end, an
  // invariant regardless of the successor's fiscal-year length — so an early-opened
  // N+1 with an irregular / short end is still matched (never duplicated into an
  // overlapping period). The 701 opening is posted exactly once, only here.
  const existing = await rows<{ id: string }>(
    db,
    sql`SELECT id
          FROM accounting_period
         WHERE organization_id = ${ctx.organizationId}::uuid
           AND period_start = ${bounds.periodStart}::date
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

// ---------------------------------------------------------------------------
// reopenPeriod — storno the year-end close of a CLOSED period (READ-MODEL-DESIGN
// §3 reopen cascade). The single riskiest accounting operation: it reverses a
// sealed year's books. Append-only (STORNO, never DELETE) inside ONE transaction.
// ---------------------------------------------------------------------------

/** Why a reopen was refused. Each maps to a hard precondition of the cascade. */
export type PeriodReopenBlockReason =
  | "PERIOD_NOT_VISIBLE"
  | "PERIOD_NOT_CLOSED"
  | "LATER_PERIOD_CLOSED"
  | "RESULT_DISTRIBUTED"

/** Typed refusal of a reopen precondition (never a partial reopen — the tx rolls back). */
export class PeriodReopenBlockedError extends Error {
  constructor(
    public readonly reason: PeriodReopenBlockReason,
    message: string,
  ) {
    super(message)
    this.name = "PeriodReopenBlockedError"
  }
}

export interface ReopenPeriodInput {
  /** The CLOSED period N to reopen. */
  periodId: string
  /** R10-attributable operator id (goes on every storno + the reopen log). */
  reopenedBy: string
  /** Optional free-text justification, stored on the reopen log. */
  reason?: string
}

export interface ReopenPeriodResult {
  /** Storno of the 710 result-close in N; null when N had no result close. */
  resultStornoId: string | null
  /** Storno of the 702 balance-close in N; null when N had no balance close. */
  balanceStornoId: string | null
  /** Storno of the 701 opening carried into N+1; null when nothing was carried. */
  openingStornoId: string | null
  /** The append-only period_reopen_log audit row. */
  reopenLogId: string
}

/**
 * Reopen a CLOSED účetní období by stornoing its year-end close (READ-MODEL-DESIGN
 * §3), inside the single transaction the caller opens (a withOrganization tx). This
 * reverses the three close generations append-only — a storno is a new linked
 * posting (corrects_posting_id + REVERSAL, negated lines), never a delete — so the
 * INSERT-only read-model maintain triggers self-correct.
 *
 * Preconditions (each throws PeriodReopenBlockedError, rolling the whole tx back):
 *   - N is visible to this org and CLOSED;
 *   - N is the LATEST closed period — no later period is still CLOSED (reopen a
 *     successor first, reverse-chronologically), because N+1's opening balances are
 *     derived from N's now-mutable konečné stavy;
 *   - the výsledek hospodaření on 431 was NOT yet distributed in a later period
 *     (a post-close normal posting touching 431 in N+1..) — reopening after profit
 *     distribution would corrupt equity.
 *
 * All guards + lookups run FIRST under the caller's org-bound app_user role (FORCE
 * RLS) — the elevation is entered only for the write cascade. That cascade runs inside
 * `withAdminBypass` (SET LOCAL ROLE app_admin, restored in its finally, outer tx aborted
 * if the restore fails) so the CLOSED→OPEN flip clears the reopen gate (migration 0035
 * app_block_period_reopen restricts it to app_admin/app_owner) WITHOUT leaking BYPASSRLS
 * into the rest of the caller's transaction. Every elevated write re-asserts
 * organization_id defense-in-depth.
 *
 * Mutation cascade (inside withAdminBypass, one tx):
 *   1. flip N CLOSED→OPEN FIRST — the period-writable guard (0035) blocks ANY posting
 *      into a CLOSED period regardless of role, so N must be OPEN before its stornos;
 *   2. storno the 701 opening carried into the successor (reversal tagged is_opening →
 *      opening_balance nets to 0, so N can be re-closed; the double-open guard reads
 *      Σ|opening|). Skipped explicitly when no live carry exists;
 *   3. storno the 702 balance-close in N (reversal tagged is_closing → read-model-
 *      neutral, restores deník faithfulness);
 *   4. storno the 710 result-close in N (a normal posting → real turnover, restores
 *      5xx/6xx/431 to their pre-close state; without it a re-close double-books);
 *   5. mark the účetní závěrka period_output voided via an append-only reversal marker
 *      (reverses_output_id — the row can't be deleted);
 *   6. write the R10-attributable period_reopen_log.
 *
 * After the elevation returns (back under app_user RLS, same tx): prove the opening
 * split netted to zero on the successor (mirror of the close double-open guard) and
 * reconcile the read-model of BOTH N and the successor — the storno INSERTs must have
 * self-corrected it. Any drift aborts the whole tx.
 */
export async function reopenPeriod(
  db: RowExecutor,
  ctx: OrgCtx,
  input: ReopenPeriodInput,
): Promise<ReopenPeriodResult> {
  // === Guards + lookups — all under the caller's org-bound app_user role (FORCE RLS),
  //     BEFORE elevating. org-scoping is the tenant boundary here; the elevation below
  //     is entered only for the write cascade. ================================
  // 1. N must be visible to this org and CLOSED.
  const [period] = await rows<{
    period_start: string
    period_end: string
    status: string
  }>(
    db,
    sql`SELECT period_start::text AS period_start, period_end::text AS period_end, status
          FROM accounting_period
         WHERE id = ${input.periodId}::uuid
           AND organization_id = ${ctx.organizationId}::uuid`,
  )
  if (!period) {
    throw new PeriodReopenBlockedError(
      "PERIOD_NOT_VISIBLE",
      `accounting: period ${input.periodId} is not visible for this organization`,
    )
  }
  if (period.status !== "CLOSED") {
    throw new PeriodReopenBlockedError(
      "PERIOD_NOT_CLOSED",
      `accounting: period ${input.periodId} is ${period.status}, not CLOSED — nothing to reopen`,
    )
  }

  // 2. N must be the LATEST closed period — never reopen N while a successor is sealed.
  const [laterClosed] = await rows<{ id: string }>(
    db,
    sql`SELECT id
          FROM accounting_period
         WHERE organization_id = ${ctx.organizationId}::uuid
           AND period_start > ${period.period_start}::date
           AND status = 'CLOSED'
         ORDER BY period_start
         LIMIT 1`,
  )
  if (laterClosed) {
    throw new PeriodReopenBlockedError(
      "LATER_PERIOD_CLOSED",
      `accounting: cannot reopen ${input.periodId} while a later period (${laterClosed.id}) is still CLOSED — reopen successors first (reverse-chronologically)`,
    )
  }

  // 3. The 431 result must NOT have been distributed in any later period. Excluded:
  //    the 701 opening (is_opening) + 702 close (is_closing), which touch 431 in the
  //    successor mechanically; every REVERSAL storno itself (correction_type =
  //    'REVERSAL'); and — the fix for the reverse-chronological deadlock — an
  //    ALREADY-REVERSED original whose REVERSAL storno exists (a successor's own
  //    result-close reversed during its earlier reopen), mirroring
  //    findLiveClosePosting's live-generation filter. Any remaining live posting on
  //    431 after N is a genuine VH-distribution reopening would corrupt — a plain
  //    posting (431→428) OR a doplňkový SUPPLEMENTARY correction on 431. The
  //    predicate keys on correction_type (IS DISTINCT FROM 'REVERSAL'), NOT on
  //    corrects_posting_id IS NULL, so a SUPPLEMENTARY — which carries a
  //    corrects_posting_id — is no longer wrongly skipped.
  const [distribution] = await rows<{ n: number }>(
    db,
    sql`SELECT count(*)::int AS n
          FROM posting p
          JOIN posting_double_entry_line l ON l.posting_id = p.id
          JOIN account a ON a.id = l.account_id
          JOIN accounting_period per ON per.id = p.period_id
         WHERE per.organization_id = ${ctx.organizationId}::uuid
           AND per.period_start > ${period.period_start}::date
           AND a.number = ${UZAVERKA_ACCOUNT.result}
           AND p.is_opening = false
           AND p.is_closing = false
           AND p.correction_type IS DISTINCT FROM 'REVERSAL'
           AND NOT EXISTS (
             SELECT 1 FROM posting r
              WHERE r.corrects_posting_id = p.id
                AND r.correction_type = 'REVERSAL')`,
  )
  if (distribution && distribution.n > 0) {
    throw new PeriodReopenBlockedError(
      "RESULT_DISTRIBUTED",
      `accounting: the výsledek hospodaření on ${UZAVERKA_ACCOUNT.result} was already distributed in a later period (${distribution.n} posting(s)) — reopening after profit distribution would corrupt equity`,
    )
  }

  // Successor resolution (robust): the successor is the period that ACTUALLY holds the
  // live 701 carry from this close — the live (not-yet-reversed) is_opening posting in
  // the nearest period strictly after N. Resolved from stored dates (period_start >
  // N.period_end), NOT recomputed bounds, so irregular / short fiscal years resolve
  // correctly. `null` = nothing was carried (empty balance sheet / monetary regime) →
  // the 701 storno is skipped explicitly, never silently mis-targeted.
  const [openingCarry] = await rows<{
    id: string
    posting_date: string
    period_id: string
  }>(
    db,
    sql`SELECT p.id, p.posting_date::text AS posting_date, p.period_id
          FROM posting p
          JOIN accounting_period per ON per.id = p.period_id
         WHERE per.organization_id = ${ctx.organizationId}::uuid
           AND per.period_start > ${period.period_end}::date
           AND p.is_opening = true
           AND p.corrects_posting_id IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM posting r
              WHERE r.corrects_posting_id = p.id
                AND r.correction_type = 'REVERSAL')
         ORDER BY per.period_start, p.posting_date, p.id
         LIMIT 1`,
  )
  const successorId = openingCarry?.period_id ?? null

  // The live 702 balance-close in N (is_closing). findLiveClosePosting throws on >1.
  const balancePosting = await findLiveClosePosting(
    db,
    sql`p.period_id = ${input.periodId}::uuid AND p.is_closing = true`,
    "702 balance-close",
  )

  // The live 710 result-close in N — a normal posting (not opening/closing) touching
  // 710. Routed through findLiveClosePosting so a manual/duplicate 710 posting throws
  // (found > 1) instead of an arbitrary pick that would storno the wrong posting.
  const resultPosting = await findLiveClosePosting(
    db,
    sql`p.period_id = ${input.periodId}::uuid
        AND p.is_opening = false
        AND p.is_closing = false
        AND EXISTS (
          SELECT 1 FROM posting_double_entry_line l
            JOIN account a ON a.id = l.account_id
           WHERE l.posting_id = p.id AND a.number = ${UZAVERKA_ACCOUNT.resultClose})`,
    "710 result-close",
  )

  // The live účetní závěrka output of N to void (append-only reversal marker below).
  const [voidedOutput] = await rows<{ id: string; type: string }>(
    db,
    sql`SELECT po.id, po.type::text AS type
          FROM period_output po
         WHERE po.period_id = ${input.periodId}::uuid
           AND po.reverses_output_id IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM period_output r WHERE r.reverses_output_id = po.id)
         ORDER BY po.generated_at DESC, po.id DESC
         LIMIT 1`,
  )

  // === Mutation cascade — elevated to app_admin ONLY here. withAdminBypass composes on
  //     the caller's tx as a SAVEPOINT, sets the role, and restores it in finally
  //     (aborting the outer tx if the restore fails) so BYPASSRLS is scoped to exactly
  //     these writes. The org-bound `db` handle runs elevated because SET LOCAL ROLE is a
  //     transaction property; every write re-asserts organization_id defense-in-depth. =
  const mutated = await withAdminBypass(async () => {
    // Serialize against a concurrent close/reopen of either period.
    await lockPeriodInTx(db, ctx.organizationId, input.periodId)
    if (successorId) {
      await lockPeriodInTx(db, ctx.organizationId, successorId)
    }

    // 1. Flip N OPEN FIRST so its stornos pass the period-writable guard. The
    //    organization_id predicate is defense-in-depth against a reordered path.
    const flipped = await rows<{ id: string }>(
      db,
      sql`UPDATE accounting_period
             SET status = 'OPEN', updated_at = now()
           WHERE id = ${input.periodId}::uuid
             AND organization_id = ${ctx.organizationId}::uuid
             AND status = 'CLOSED'
          RETURNING id`,
    )
    if (!flipped[0]) {
      throw new Error(
        `accounting: period ${input.periodId} could not be reopened (status changed concurrently)`,
      )
    }

    // 2. Storno the 701 opening carried into the successor (reversal is_opening →
    //    opening_balance nets to 0). Skipped explicitly when nothing was carried.
    let openingStornoId: string | null = null
    if (openingCarry) {
      const storno = await reverse(db, ctx, {
        originalPostingId: openingCarry.id,
        postingDate: openingCarry.posting_date,
        responsibleUserId: input.reopenedBy,
      })
      openingStornoId = storno.postingId
    }

    // 3. Storno the 702 balance-close in N (reversal is_closing → read-model-neutral).
    let balanceStornoId: string | null = null
    if (balancePosting) {
      const storno = await reverse(db, ctx, {
        originalPostingId: balancePosting.id,
        postingDate: balancePosting.posting_date,
        responsibleUserId: input.reopenedBy,
      })
      balanceStornoId = storno.postingId
    }

    // 4. Storno the 710 result-close in N (real turnover → restores 5xx/6xx/431).
    let resultStornoId: string | null = null
    if (resultPosting) {
      const storno = await reverse(db, ctx, {
        originalPostingId: resultPosting.id,
        postingDate: resultPosting.posting_date,
        responsibleUserId: input.reopenedBy,
      })
      resultStornoId = storno.postingId
    }

    // 5. Void the účetní závěrka output with an append-only reversal marker — the
    //    sealed output can't be deleted, so insert a same-type row carrying
    //    reverses_output_id. organization_id is set explicitly (defense-in-depth).
    if (voidedOutput) {
      await db.execute(
        sql`INSERT INTO period_output (organization_id, period_id, type, generated_by, reverses_output_id)
            VALUES (${ctx.organizationId}::uuid, ${input.periodId}::uuid,
                    ${voidedOutput.type}::period_output_type, ${input.reopenedBy}::uuid, ${voidedOutput.id}::uuid)`,
      )
    }

    // 6. R10-attributable audit record (organization_id set explicitly).
    const [logRow] = await rows<{ id: string }>(
      db,
      sql`INSERT INTO period_reopen_log
            (organization_id, period_id, reopened_by, reason,
             result_storno_posting_id, balance_storno_posting_id, opening_storno_posting_id)
          VALUES
            (${ctx.organizationId}::uuid, ${input.periodId}::uuid, ${input.reopenedBy}::uuid, ${input.reason ?? null},
             ${resultStornoId}, ${balanceStornoId}, ${openingStornoId})
          RETURNING id`,
    )
    if (!logRow) {
      throw new Error("accounting: period_reopen_log insert returned no row")
    }

    return {
      resultStornoId,
      balanceStornoId,
      openingStornoId,
      reopenLogId: logRow.id,
    }
  }, db)

  // === Post-mutation invariant proofs — back under app_user RLS, same tx. ========
  // Prove the opening split netted to zero on the successor: the 701 storno must return
  // Σ|opening_balance| to 0 so N can be re-closed (mirror of the close double-open
  // guard). A nonzero sum means the reversal did not net out.
  if (successorId) {
    const [openState] = await rows<{ has_live_openings: boolean }>(
      db,
      sql`SELECT COALESCE(SUM(abs(opening_balance)), 0) <> 0 AS has_live_openings
            FROM account_period_balance
           WHERE period_id = ${successorId}::uuid`,
    )
    if (openState?.has_live_openings) {
      throw new Error(
        `accounting: successor period ${successorId} still carries opening balances after the 701 storno (double-open invariant violated) — reopen aborted`,
      )
    }
  }

  // Reconcile the read-model of N (and the successor) — the storno INSERTs must have
  // self-corrected it. Any drift means a storno did not net out; abort.
  const driftN = await reconcileReadModel(db, input.periodId)
  if (driftN.length > 0) {
    throw new Error(
      `accounting: read-model drift in reopened period ${input.periodId} after storno cascade (${driftN.length} account(s)) — reopen aborted`,
    )
  }
  if (successorId) {
    const driftNext = await reconcileReadModel(db, successorId)
    if (driftNext.length > 0) {
      throw new Error(
        `accounting: read-model drift in successor period ${successorId} after 701 storno (${driftNext.length} account(s)) — reopen aborted`,
      )
    }
  }

  return {
    resultStornoId: mutated.resultStornoId,
    balanceStornoId: mutated.balanceStornoId,
    openingStornoId: mutated.openingStornoId,
    reopenLogId: mutated.reopenLogId,
  }
}

/**
 * Find the single LIVE (original, not-yet-reversed) close-generation posting that
 * matches `predicate`, or null. Throws on ambiguity (>1) — a close generation is
 * posted exactly once, so more than one live match is a corruption signal, not a
 * silent "pick the first". Reused for the 702 balance-close and the 710 result-close.
 */
async function findLiveClosePosting(
  db: RowExecutor,
  predicate: ReturnType<typeof sql>,
  label: string,
): Promise<{ id: string; posting_date: string } | null> {
  const found = await rows<{ id: string; posting_date: string }>(
    db,
    sql`SELECT p.id, p.posting_date::text AS posting_date
          FROM posting p
         WHERE ${predicate}
           AND p.corrects_posting_id IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM posting r
              WHERE r.corrects_posting_id = p.id
                AND r.correction_type = 'REVERSAL')`,
  )
  if (found.length > 1) {
    throw new Error(
      `accounting: expected at most one live ${label} posting, found ${found.length} — refusing to reopen`,
    )
  }
  return found[0] ?? null
}
