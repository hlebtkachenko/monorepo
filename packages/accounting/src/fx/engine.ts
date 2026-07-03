/**
 * FX engine (the deferred half of EPIC-1 option C). Storage (the frozen
 * accounting-currency amounts on partial_record + the settlement rate columns)
 * landed in migrations 0035/0036; this is the posting engine on top of it.
 *
 * Three capabilities (the year-1 set Hleb signed off):
 *   (a) capture-time rate freeze — in capture.ts (base × fx_rate, VAT base ×
 *       vat_fx_rate); DPH is always declared in CZK.
 *   (b) cross-currency settlement → realized kurzový rozdíl to 563 (loss) / 663
 *       (gain), ČÚS 006 — `postFxSettlement` below.
 *   (c) §4/12 rozvahový-den revaluation of open FX receivables/payables → 563/663
 *       — `revalueOpenItemFx` below.
 *
 * The per-period rate POLICY (DAILY denní / FIXED pevný, §24) is read from
 * accounting_period.fx_rate_policy; because the applied rate is frozen per
 * transaction, the policy is advisory at this layer (`periodFxPolicy`). All
 * money math is in SQL; TS only inspects a value's SIGN (a string test, never
 * arithmetic) to choose the gain vs loss account.
 *
 * NOTE (advisor-review target): the open_item amounts are nominal účetní měna at
 * the BOOKING rate (so Σ per partner ties to the synthetic). `postFxSettlement`
 * clears the saldo at booking value and books the cash at the settlement value,
 * with 563/663 as the balancing kurzový rozdíl. Revaluation books the unrealized
 * difference to the ledger saldo account WITHOUT touching the nominal open_item.
 */

import { sql } from "drizzle-orm"
import { one } from "../sql"
import type { RowExecutor } from "../sql"
import { resolveAccountIds } from "../accounts"
import { postDoubleEntry } from "../posting/double-entry"
import { settleOpenItem } from "../saldokonto"
import type {
  Decimal,
  DoubleEntryLineInput,
  FxRateKind,
  OpenItemDirection,
  OrgCtx,
  PostedPosting,
} from "../types"

/** Read the period's §24 rate policy (DAILY default when unset). */
export async function periodFxPolicy(
  db: RowExecutor,
  periodId: string,
): Promise<FxRateKind> {
  const r = await one<{ fx_rate_policy: FxRateKind | null }>(
    db,
    sql`SELECT fx_rate_policy FROM accounting_period WHERE id = ${periodId}::uuid`,
  )
  return r.fx_rate_policy ?? "DAILY"
}

/** sign + abs of (a − b), computed in SQL (no JS money arithmetic). */
async function difference(
  db: RowExecutor,
  a: Decimal,
  b: Decimal,
): Promise<{ sign: number; abs: Decimal }> {
  const r = await one<{ sgn: string; abs: string }>(
    db,
    sql`SELECT sign(${a}::numeric - ${b}::numeric)::int::text AS sgn,
               abs(${a}::numeric - ${b}::numeric)::text       AS abs`,
  )
  return { sign: Number(r.sgn), abs: r.abs }
}

export interface FxSettlementInput {
  openItemId: string
  periodId: string
  summaryRecordId: string
  accountingEventId: string
  postingDate: string
  responsibleUserId: string
  direction: OpenItemDirection
  /** saldokonto account number (311 receivable / 321 payable). */
  saldoAccountNumber: string
  /** money-position account number (221 bank / 211 cash). */
  cashAccountNumber: string
  /** Foreign amount × BOOKING rate — the účetní-měna value that clears the saldo. */
  bookedValue: Decimal
  /** Foreign amount × SETTLEMENT rate — the actual cash účetní-měna value. */
  cashValue: Decimal
  settlementFxRate: Decimal
  /** Defaults: 663 kurzový zisk / 563 kurzová ztráta. */
  gainAccountNumber?: string
  lossAccountNumber?: string
}

/**
 * Post a cross-currency settlement and realize the kurzový rozdíl (ČÚS 006).
 * Clears the saldo at booking value, books cash at settlement value, and plugs
 * the difference to 663 (gain) / 563 (loss). Records the open_item_settlement
 * (booking-value amount + the settlement-rate cash value) so the párování ledger
 * clears exactly. One balanced posting.
 */
export async function postFxSettlement(
  db: RowExecutor,
  ctx: OrgCtx,
  input: FxSettlementInput,
): Promise<{ posting: PostedPosting; settlementId: string }> {
  const gainNo = input.gainAccountNumber ?? "663"
  const lossNo = input.lossAccountNumber ?? "563"
  const ids = await resolveAccountIds(db, input.periodId, [
    input.saldoAccountNumber,
    input.cashAccountNumber,
    gainNo,
    lossNo,
  ])
  const saldo = ids.get(input.saldoAccountNumber) as string
  const cash = ids.get(input.cashAccountNumber) as string

  const { sign, abs } = await difference(db, input.cashValue, input.bookedValue)
  // gain when a receivable is worth more / a payable costs less at settlement.
  const isGain =
    (input.direction === "RECEIVABLE" && sign > 0) ||
    (input.direction === "PAYABLE" && sign < 0)

  const lines: DoubleEntryLineInput[] =
    input.direction === "RECEIVABLE"
      ? [
          { accountId: cash, side: "DEBIT", amount: input.cashValue },
          { accountId: saldo, side: "CREDIT", amount: input.bookedValue },
        ]
      : [
          { accountId: saldo, side: "DEBIT", amount: input.bookedValue },
          { accountId: cash, side: "CREDIT", amount: input.cashValue },
        ]

  if (sign !== 0) {
    lines.push(
      isGain
        ? { accountId: ids.get(gainNo) as string, side: "CREDIT", amount: abs }
        : { accountId: ids.get(lossNo) as string, side: "DEBIT", amount: abs },
    )
  }

  const posting = await postDoubleEntry(db, ctx, {
    periodId: input.periodId,
    summaryRecordId: input.summaryRecordId,
    accountingEventId: input.accountingEventId,
    postingDate: input.postingDate,
    responsibleUserId: input.responsibleUserId,
    lines,
  })

  const settlementId = await settleOpenItem(db, ctx, {
    openItemId: input.openItemId,
    settlingPostingId: posting.postingId,
    amount: input.bookedValue,
    settlementDate: input.postingDate,
    settlementFxRate: input.settlementFxRate,
    amountInAccountingCurrency: input.cashValue,
  })

  return { posting, settlementId }
}

export interface FxRevaluationInput {
  openItemId: string
  periodId: string
  summaryRecordId: string
  accountingEventId: string
  /** typically the period_end (rozvahový den). */
  postingDate: string
  responsibleUserId: string
  direction: OpenItemDirection
  /** saldokonto account number (311 / 321). */
  saldoAccountNumber: string
  /** Remaining obligation revalued to the balance-sheet-day rate (účetní měna). */
  balanceSheetDayValue: Decimal
  gainAccountNumber?: string
  lossAccountNumber?: string
}

/**
 * §4/12 balance-sheet-day revaluation of an open FX receivable/payable. Books the
 * UNREALIZED difference between the balance-sheet-day value and the currently
 * booked remaining value to the ledger saldo account vs 563/663. Does NOT settle
 * or mutate the nominal open_item (the párování ledger stays nominal; the ledger
 * carries the revaluation, §4/12 + ČÚS 006). Returns null when there is no
 * difference.
 */
export async function revalueOpenItemFx(
  db: RowExecutor,
  ctx: OrgCtx,
  input: FxRevaluationInput,
): Promise<PostedPosting | null> {
  const gainNo = input.gainAccountNumber ?? "663"
  const lossNo = input.lossAccountNumber ?? "563"

  const booked = await one<{ remaining_amount: Decimal }>(
    db,
    sql`SELECT remaining_amount FROM open_item WHERE id = ${input.openItemId}::uuid`,
  )
  const { sign, abs } = await difference(
    db,
    input.balanceSheetDayValue,
    booked.remaining_amount,
  )
  if (sign === 0) return null

  const ids = await resolveAccountIds(db, input.periodId, [
    input.saldoAccountNumber,
    gainNo,
    lossNo,
  ])
  const saldo = ids.get(input.saldoAccountNumber) as string
  // a receivable worth more, or a payable worth less, at the BSD rate = gain.
  const isGain =
    (input.direction === "RECEIVABLE" && sign > 0) ||
    (input.direction === "PAYABLE" && sign < 0)

  // receivable gain: MD 311 / D 663; loss: MD 563 / D 311.
  // payable   gain: MD 321 / D 663; loss: MD 563 / D 321.
  const lines: DoubleEntryLineInput[] = isGain
    ? [
        { accountId: saldo, side: "DEBIT", amount: abs },
        { accountId: ids.get(gainNo) as string, side: "CREDIT", amount: abs },
      ]
    : [
        { accountId: ids.get(lossNo) as string, side: "DEBIT", amount: abs },
        { accountId: saldo, side: "CREDIT", amount: abs },
      ]

  return postDoubleEntry(db, ctx, {
    periodId: input.periodId,
    summaryRecordId: input.summaryRecordId,
    accountingEventId: input.accountingEventId,
    postingDate: input.postingDate,
    responsibleUserId: input.responsibleUserId,
    lines,
  })
}
