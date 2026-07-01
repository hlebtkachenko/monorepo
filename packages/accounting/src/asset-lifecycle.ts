/**
 * Fixed-asset lifecycle postings — Decree 500/2002 Sb. §7, ČÚS 013. The card +
 * depreciation PLAN live in setup.ts / supporting.ts; this module posts the
 * money legs of the lifecycle:
 *
 *   acquisition (pořízení)   — costs accumulate on 042 (DHM) / 041 (DNM):
 *                              MD 042 / D 321  (invoice, incl. incidental costs
 *                              doprava/montáž per §47 Decree — part of acq. cost).
 *   commissioning (zařazení) — MD 022|021|013 / D 042  (uvedení do užívání; starts
 *                              depreciation the following month).
 *   depreciation             — MD 551 / D 08x  (supporting.ts generateDepreciation).
 *   disposal (vyřazení)      — derecognise: write the accumulated depreciation and
 *                              the remaining book value (ZC) off against the cost:
 *                              MD 08x (accumulated) + MD 541 (ZC) / D 02x (cost).
 *                              On a SALE, also MD 311 / D 641 (+343) for proceeds.
 *
 * All amounts exact decimals resolved by account NUMBER (D8); ZC = cost −
 * accumulated is computed in SQL (R13). Caller supplies the voucher + case.
 */

import { sql } from "drizzle-orm"
import { one } from "./sql"
import type { RowExecutor } from "./sql"
import { resolveAccountIds } from "./accounts"
import { postDoubleEntry } from "./posting/double-entry"
import type {
  Decimal,
  DoubleEntryLineInput,
  OrgCtx,
  PostedPosting,
} from "./types"

interface LifecycleBase {
  periodId: string
  summaryRecordId: string
  accountingEventId: string
  postingDate: string
  responsibleUserId: string
}

/** Accumulate an acquisition cost on the pořízení account (MD 042 / D payable). */
export async function acquireAsset(
  db: RowExecutor,
  ctx: OrgCtx,
  input: LifecycleBase & {
    amount: Decimal
    acquisitionAccountNumber?: string // 042 DHM / 041 DNM
    counterAccountNumber?: string // 321 supplier / 211 cash
  },
): Promise<PostedPosting> {
  const acq = input.acquisitionAccountNumber ?? "042"
  const counter = input.counterAccountNumber ?? "321"
  const ids = await resolveAccountIds(db, input.periodId, [acq, counter])
  return postDoubleEntry(db, ctx, {
    ...postingHeader(input),
    lines: [
      { accountId: ids.get(acq)!, side: "DEBIT", amount: input.amount },
      { accountId: ids.get(counter)!, side: "CREDIT", amount: input.amount },
    ],
  })
}

/** Commission (zařadit do užívání): move accumulated cost 042 → 022 (MD 022 / D 042). */
export async function commissionAsset(
  db: RowExecutor,
  ctx: OrgCtx,
  input: LifecycleBase & {
    amount: Decimal
    assetAccountNumber?: string // 022 movité / 021 stavby / 013 software
    acquisitionAccountNumber?: string // 042 / 041
  },
): Promise<PostedPosting> {
  const asset = input.assetAccountNumber ?? "022"
  const acq = input.acquisitionAccountNumber ?? "042"
  const ids = await resolveAccountIds(db, input.periodId, [asset, acq])
  return postDoubleEntry(db, ctx, {
    ...postingHeader(input),
    lines: [
      { accountId: ids.get(asset)!, side: "DEBIT", amount: input.amount },
      { accountId: ids.get(acq)!, side: "CREDIT", amount: input.amount },
    ],
  })
}

/**
 * Dispose of an asset. Derecognises cost and accumulated depreciation, expenses
 * the remaining book value (ZC = cost − accumulated) to 541, and — for a sale —
 * books the proceeds to 641 (+ output VAT to 343) against a receivable.
 * ZC is computed in SQL so it is exact and never negative-plugs.
 */
export async function disposeAsset(
  db: RowExecutor,
  ctx: OrgCtx,
  input: LifecycleBase & {
    cost: Decimal
    accumulated: Decimal
    assetAccountNumber?: string // 022
    accumulatedAccountNumber?: string // 082
    residualExpenseAccountNumber?: string // 541 ZC prodaného DM
    /** Sale proceeds (net) + optional VAT → 641/343 against a receivable/cash. */
    sale?: {
      proceedsNet: Decimal
      vat?: Decimal
      receivableAccountNumber?: string // 311 / 211
      revenueAccountNumber?: string // 641
      vatAccountNumber?: string // 343
    }
  },
): Promise<PostedPosting> {
  const asset = input.assetAccountNumber ?? "022"
  const accum = input.accumulatedAccountNumber ?? "082"
  const zcExpense = input.residualExpenseAccountNumber ?? "541"
  const numbers = [asset, accum, zcExpense]
  if (input.sale) {
    numbers.push(
      input.sale.receivableAccountNumber ?? "311",
      input.sale.revenueAccountNumber ?? "641",
    )
    if (input.sale.vat && Number(input.sale.vat) !== 0) {
      numbers.push(input.sale.vatAccountNumber ?? "343")
    }
  }
  const ids = await resolveAccountIds(db, input.periodId, numbers)

  // ZC = cost − accumulated, computed in SQL (never a JS subtraction of money)
  const { zc } = await one<{ zc: string }>(
    db,
    sql`SELECT (${input.cost}::numeric - ${input.accumulated}::numeric)::numeric(19,4) AS zc`,
  )

  const lines: DoubleEntryLineInput[] = [
    // derecognise: remove cost (credit 022) against accumulated (debit 082) + ZC (debit 541)
    { accountId: ids.get(accum)!, side: "DEBIT", amount: input.accumulated },
    { accountId: ids.get(zcExpense)!, side: "DEBIT", amount: zc },
    { accountId: ids.get(asset)!, side: "CREDIT", amount: input.cost },
  ]
  if (input.sale) {
    const recv = input.sale.receivableAccountNumber ?? "311"
    const rev = input.sale.revenueAccountNumber ?? "641"
    const gross = input.sale.vat
      ? (
          await one<{ g: string }>(
            db,
            sql`SELECT (${input.sale.proceedsNet}::numeric + ${input.sale.vat}::numeric)::numeric(19,4) AS g`,
          )
        ).g
      : input.sale.proceedsNet
    lines.push(
      { accountId: ids.get(recv)!, side: "DEBIT", amount: gross },
      {
        accountId: ids.get(rev)!,
        side: "CREDIT",
        amount: input.sale.proceedsNet,
      },
    )
    if (input.sale.vat && Number(input.sale.vat) !== 0) {
      const vatAcc = input.sale.vatAccountNumber ?? "343"
      lines.push({
        accountId: ids.get(vatAcc)!,
        side: "CREDIT",
        amount: input.sale.vat,
      })
    }
  }

  return postDoubleEntry(db, ctx, { ...postingHeader(input), lines })
}

function postingHeader(
  input: LifecycleBase,
): LifecycleBase & { postingKind?: undefined } {
  return {
    periodId: input.periodId,
    summaryRecordId: input.summaryRecordId,
    accountingEventId: input.accountingEventId,
    postingDate: input.postingDate,
    responsibleUserId: input.responsibleUserId,
  }
}
