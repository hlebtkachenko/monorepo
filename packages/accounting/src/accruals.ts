/**
 * Časové rozlišení (accruals / deferrals) — Decree 500/2002 Sb. §13, ČÚS 017 +
 * 019. The matching principle (§3/1 ZoÚ): a cost/revenue is recognised in the
 * period it economically belongs to, not the period it is paid/received. Four
 * bridge accounts:
 *
 *   381 Náklady příštích období   — PAID now, cost belongs to a FUTURE period
 *                                   (prepaid: pojistné, nájem předem, event costs).
 *   382 Komplexní náklady příštích období (not modelled separately here).
 *   383 Výdaje příštích období    — cost belongs NOW, invoiced/paid LATER (accrued).
 *   384 Výnosy příštích období    — RECEIVED now, revenue belongs to a FUTURE period.
 *   385 Příjmy příštích období    — revenue belongs NOW, received LATER (accrued).
 *
 * Each operation is a plain balanced double-entry posting; the caller supplies the
 * voucher (summary_record) + case (accounting_event) as everywhere else. Accounts
 * resolve by NUMBER in the posting period (D8). The pro-rata split by days is
 * computed in SQL (R13 — no JS money arithmetic).
 */

import { sql } from "drizzle-orm"
import { one } from "./sql"
import type { RowExecutor } from "./sql"
import { resolveAccountIds } from "./accounts"
import { postDoubleEntry } from "./posting/double-entry"
import type { Decimal, OrgCtx, PostedPosting } from "./types"

export type AccrualKind =
  | "DEFER_EXPENSE" // prepaid cost → 381 (recognise later)
  | "RELEASE_DEFERRED_EXPENSE" // 381 → expense (in the target period)
  | "DEFER_REVENUE" // received-in-advance → 384 (recognise later)
  | "RELEASE_DEFERRED_REVENUE" // 384 → revenue (in the target period)
  | "ACCRUE_EXPENSE" // cost belongs now, pay later → 383
  | "SETTLE_ACCRUED_EXPENSE" // 383 → cash/payable
  | "ACCRUE_REVENUE" // revenue belongs now, receive later → 385
  | "SETTLE_ACCRUED_REVENUE" // cash → 385

/** Debit/credit account NUMBERs for each accrual movement (the bridge account + its counter). */
const MOVEMENT: Record<
  AccrualKind,
  { debit: string | null; credit: string | null; bridge: string }
> = {
  // debit/credit === null means "the caller supplies it" (the P&L or cash/payable leg)
  DEFER_EXPENSE: { debit: "BRIDGE", credit: null, bridge: "381" }, // MD 381 / D <source: 321|221>
  RELEASE_DEFERRED_EXPENSE: { debit: null, credit: "BRIDGE", bridge: "381" }, // MD <expense> / D 381
  DEFER_REVENUE: { debit: null, credit: "BRIDGE", bridge: "384" }, // MD <cash/revenue> / D 384
  RELEASE_DEFERRED_REVENUE: { debit: "BRIDGE", credit: null, bridge: "384" }, // MD 384 / D <revenue>
  ACCRUE_EXPENSE: { debit: null, credit: "BRIDGE", bridge: "383" }, // MD <expense> / D 383
  SETTLE_ACCRUED_EXPENSE: { debit: "BRIDGE", credit: null, bridge: "383" }, // MD 383 / D <cash/payable>
  ACCRUE_REVENUE: { debit: "BRIDGE", credit: null, bridge: "385" }, // MD 385 / D <revenue>
  SETTLE_ACCRUED_REVENUE: { debit: null, credit: "BRIDGE", bridge: "385" }, // MD <cash> / D 385
}

export interface AccrualInput {
  kind: AccrualKind
  periodId: string
  summaryRecordId: string
  accountingEventId: string
  postingDate: string
  responsibleUserId: string
  amount: Decimal
  /** The non-bridge account number (the P&L / cash / payable leg). */
  counterAccountNumber: string
  /** Override the bridge account (e.g. an analytic 381.001); defaults to the statutory one. */
  bridgeAccountNumber?: string
}

/**
 * Post one časové-rozlišení movement. The bridge account (381/383/384/385) and
 * the caller's counter account are placed on the correct sides per the kind.
 */
export async function postAccrual(
  db: RowExecutor,
  ctx: OrgCtx,
  input: AccrualInput,
): Promise<PostedPosting> {
  const m = MOVEMENT[input.kind]
  const bridge = input.bridgeAccountNumber ?? m.bridge
  const debitNumber = m.debit === "BRIDGE" ? bridge : input.counterAccountNumber
  const creditNumber =
    m.credit === "BRIDGE" ? bridge : input.counterAccountNumber
  const ids = await resolveAccountIds(db, input.periodId, [
    debitNumber,
    creditNumber,
  ])
  return postDoubleEntry(db, ctx, {
    periodId: input.periodId,
    summaryRecordId: input.summaryRecordId,
    accountingEventId: input.accountingEventId,
    postingDate: input.postingDate,
    responsibleUserId: input.responsibleUserId,
    lines: [
      { accountId: ids.get(debitNumber)!, side: "DEBIT", amount: input.amount },
      {
        accountId: ids.get(creditNumber)!,
        side: "CREDIT",
        amount: input.amount,
      },
    ],
  })
}

/**
 * Split a total across the current period vs a future period by CALENDAR DAYS of
 * the service window (§3/1 matching). Returns the two exact decimal parts
 * (computed in SQL; the future part is total − current, so they always sum to the
 * total — no rounding leak). Use for "insurance 12 měsíců zaplaceno předem",
 * "nájem", "event costs paid in year N for an event in year N+1".
 */
export async function prorataByDays(
  db: RowExecutor,
  input: {
    total: Decimal
    /** service window */
    serviceStart: string
    serviceEnd: string
    /** the accounting period whose share we want "now" */
    periodStart: string
    periodEnd: string
  },
): Promise<{
  currentPart: Decimal
  futurePart: Decimal
  currentDays: number
  totalDays: number
}> {
  const r = await one<{
    current_part: string
    future_part: string
    current_days: string
    total_days: string
  }>(
    db,
    sql`
      WITH w AS (
        SELECT
          (LEAST(${input.serviceEnd}::date, ${input.periodEnd}::date)
            - GREATEST(${input.serviceStart}::date, ${input.periodStart}::date) + 1) AS overlap_days,
          (${input.serviceEnd}::date - ${input.serviceStart}::date + 1)             AS total_days
      )
      SELECT
        GREATEST(overlap_days, 0)                                                    AS current_days,
        total_days                                                                   AS total_days,
        round(${input.total}::numeric * GREATEST(overlap_days,0) / total_days, 2)    AS current_part,
        (${input.total}::numeric
          - round(${input.total}::numeric * GREATEST(overlap_days,0) / total_days, 2)) AS future_part
      FROM w`,
  )
  return {
    currentPart: r.current_part,
    futurePart: r.future_part,
    currentDays: Number(r.current_days),
    totalDays: Number(r.total_days),
  }
}
