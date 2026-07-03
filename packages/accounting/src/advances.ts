/**
 * Zálohy s daní (advances with VAT) — §37a ZDPH + ČÚS 017. Two-step flow on the
 * ISSUED side (we are the supplier receiving an advance and issuing a daňový
 * doklad k přijaté záloze):
 *
 *   1. postAdvanceReceived — přijetí zálohy + odvod DPH ze zálohy:
 *        MD 221 / D 324           (gross advance received)
 *        MD 324 / D 343           (output VAT from the advance — §37a/1)
 *      end state: 324 = net advance, 343 = advance output VAT.
 *
 *   2. settleAdvanceOnFinalInvoice — vyúčtovací daňový doklad for the WHOLE
 *      supply, netting the already-taxed advance so VAT is declared once (§37a/3):
 *        MD 311 (B+V − a − v)  + MD 324 (a)  /  D 604 (B) + D 343 (V − v)
 *      where B/V = total base/VAT of the supply, a/v = the advance base/VAT. The
 *      final invoice recognises the full revenue B, collects the remaining
 *      receivable, clears the advance (324 → 0), and adds only the REMAINING VAT
 *      (V − v) so total output VAT across the two steps is exactly V.
 *
 * All derived amounts (gross, remainders) are computed in SQL (R13). Accounts
 * resolve by NUMBER (D8). Caller supplies the voucher + case; runs inside a
 * withOrganization transaction.
 *
 * Scope (v1): the ISSUED / received-advance direction (zálohové faktury vydané),
 * the dominant §37a case surfaced during real-data stress testing. The paid-advance
 * (314) mirror + the multi-advance partial settlement are follow-ups.
 */

import { sql } from "drizzle-orm"
import { one } from "./sql"
import type { RowExecutor } from "./sql"
import { resolveAccountIds } from "./accounts"
import { postDoubleEntry } from "./posting/double-entry"
import type { Decimal, OrgCtx, PostedPosting } from "./types"

interface AdvanceBase {
  periodId: string
  summaryRecordId: string
  accountingEventId: string
  postingDate: string
  responsibleUserId: string
}

/**
 * Post the receipt of an advance + the §37a output VAT (daňový doklad k přijaté
 * záloze): MD 221 / D 324 (gross) and MD 324 / D 343 (VAT).
 */
export async function postAdvanceReceived(
  db: RowExecutor,
  ctx: OrgCtx,
  input: AdvanceBase & {
    /** advance net (základ). */
    base: Decimal
    /** advance VAT (daň z přijaté zálohy). */
    vat: Decimal
    cashAccountNumber?: string // 221 bank / 211 pokladna
    advanceAccountNumber?: string // 324 přijaté zálohy
    vatAccountNumber?: string // 343
  },
): Promise<PostedPosting> {
  const cash = input.cashAccountNumber ?? "221"
  const advance = input.advanceAccountNumber ?? "324"
  const vatAcc = input.vatAccountNumber ?? "343"
  const ids = await resolveAccountIds(db, input.periodId, [
    cash,
    advance,
    vatAcc,
  ])
  const { gross } = await one<{ gross: Decimal }>(
    db,
    sql`SELECT (${input.base}::numeric + ${input.vat}::numeric)::numeric(19,4) AS gross`,
  )
  return postDoubleEntry(db, ctx, {
    periodId: input.periodId,
    summaryRecordId: input.summaryRecordId,
    accountingEventId: input.accountingEventId,
    postingDate: input.postingDate,
    responsibleUserId: input.responsibleUserId,
    lines: [
      // receipt: MD 221 / D 324 (gross)
      { accountId: ids.get(cash)!, side: "DEBIT", amount: gross },
      { accountId: ids.get(advance)!, side: "CREDIT", amount: gross },
      // §37a output VAT: MD 324 / D 343 (VAT)
      { accountId: ids.get(advance)!, side: "DEBIT", amount: input.vat },
      { accountId: ids.get(vatAcc)!, side: "CREDIT", amount: input.vat },
    ],
  })
}

/**
 * Post the final vyúčtovací daňový doklad for the whole supply, netting the
 * already-taxed advance (§37a/3). Declares the full revenue B, clears the advance
 * (324), and adds only the remaining VAT (V − v).
 */
export async function settleAdvanceOnFinalInvoice(
  db: RowExecutor,
  ctx: OrgCtx,
  input: AdvanceBase & {
    /** total supply base (základ celého plnění). */
    totalBase: Decimal
    /** total supply VAT (daň celého plnění). */
    totalVat: Decimal
    /** advance base already invoiced via the daňový doklad k záloze. */
    advanceBase: Decimal
    /** advance VAT already declared. */
    advanceVat: Decimal
    receivableAccountNumber?: string // 311
    revenueAccountNumber?: string // 604 zboží / 602 služby
    advanceAccountNumber?: string // 324
    vatAccountNumber?: string // 343
  },
): Promise<PostedPosting> {
  const receivable = input.receivableAccountNumber ?? "311"
  const revenue = input.revenueAccountNumber ?? "604"
  const advance = input.advanceAccountNumber ?? "324"
  const vatAcc = input.vatAccountNumber ?? "343"
  const ids = await resolveAccountIds(db, input.periodId, [
    receivable,
    revenue,
    advance,
    vatAcc,
  ])

  const amt = await one<{
    receivable_remaining: Decimal
    vat_remaining: Decimal
  }>(
    db,
    sql`SELECT
          ((${input.totalBase}::numeric + ${input.totalVat}::numeric)
            - (${input.advanceBase}::numeric + ${input.advanceVat}::numeric))::numeric(19,4) AS receivable_remaining,
          (${input.totalVat}::numeric - ${input.advanceVat}::numeric)::numeric(19,4)          AS vat_remaining`,
  )

  return postDoubleEntry(db, ctx, {
    periodId: input.periodId,
    summaryRecordId: input.summaryRecordId,
    accountingEventId: input.accountingEventId,
    postingDate: input.postingDate,
    responsibleUserId: input.responsibleUserId,
    lines: [
      // remaining receivable to collect + the advance applied
      {
        accountId: ids.get(receivable)!,
        side: "DEBIT",
        amount: amt.receivable_remaining,
      },
      {
        accountId: ids.get(advance)!,
        side: "DEBIT",
        amount: input.advanceBase,
      },
      // full revenue + only the remaining output VAT
      { accountId: ids.get(revenue)!, side: "CREDIT", amount: input.totalBase },
      {
        accountId: ids.get(vatAcc)!,
        side: "CREDIT",
        amount: amt.vat_remaining,
      },
    ],
  })
}
