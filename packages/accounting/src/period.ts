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
import { rows } from "./sql"
import type { RowExecutor } from "./sql"
import { captureDocument, createEvent } from "./capture"
import { createChart, createPeriod } from "./setup"
import { postDoubleEntry } from "./posting/double-entry"
import type { DoubleEntryLineInput, FxRateKind, OrgCtx, Regime } from "./types"

/** Close a period (§17). After this, R12's trigger rejects new postings into it. */
export async function closePeriod(
  db: RowExecutor,
  periodId: string,
): Promise<void> {
  await db.execute(
    sql`UPDATE accounting_period SET status = 'CLOSED', updated_at = now() WHERE id = ${periodId}::uuid`,
  )
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
