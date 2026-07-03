/**
 * Supporting postings (UC-4). A depreciation_plan generates monthly účetní
 * depreciation postings (MD 551 / D 08x); inventory differences (manko/přebytek)
 * generate adjustment postings. Both are DOUBLE_ENTRY postings carrying the
 * originating plan / inventory FK, so the audit trail links the posting to its
 * source. Accounts are resolved BY NUMBER (D8) for the active period (the plan
 * stores its 551 / 08x numbers; assets/plans are perennial, accounts per-period).
 *
 * The caller supplies an internal summary_record + accounting_event (type
 * INTERNAL) for the posting's FKs — those carry no individual_record, so R6 is
 * not blocked by a generated posting. Run inside a withOrganization transaction.
 */

import { sql } from "drizzle-orm"
import { one } from "./sql"
import type { RowExecutor } from "./sql"
import { resolveAccountIds } from "./accounts"
import { postDoubleEntry } from "./posting/double-entry"
import type { Decimal, DebitCredit, OrgCtx, PostedPosting } from "./types"

export interface DepreciationInput {
  depreciationPlanId: string
  periodId: string
  summaryRecordId: string
  accountingEventId: string
  postingDate: string
  responsibleUserId: string
  /** Override the plan's monthly_amount (e.g. a partial first month). */
  amount?: Decimal
}

/**
 * Generate one účetní depreciation posting from a plan: MD expense (551) / D
 * accumulated (08x), linked to the plan. The expense/accumulated account numbers
 * and the monthly amount come from the plan; the active period's account_ids are
 * resolved by number.
 */
export async function generateDepreciation(
  db: RowExecutor,
  ctx: OrgCtx,
  input: DepreciationInput,
): Promise<PostedPosting> {
  const plan = await one<{
    monthly_amount: Decimal
    expense_account_number: string
    accumulated_account_number: string
  }>(
    db,
    sql`SELECT monthly_amount, expense_account_number, accumulated_account_number
          FROM depreciation_plan WHERE id = ${input.depreciationPlanId}::uuid`,
  )
  const ids = await resolveAccountIds(db, input.periodId, [
    plan.expense_account_number,
    plan.accumulated_account_number,
  ])
  const amount = input.amount ?? plan.monthly_amount

  return postDoubleEntry(db, ctx, {
    periodId: input.periodId,
    summaryRecordId: input.summaryRecordId,
    accountingEventId: input.accountingEventId,
    postingDate: input.postingDate,
    responsibleUserId: input.responsibleUserId,
    depreciationPlanId: input.depreciationPlanId,
    lines: [
      {
        accountId: ids.get(plan.expense_account_number) as string,
        side: "DEBIT",
        amount,
      },
      {
        accountId: ids.get(plan.accumulated_account_number) as string,
        side: "CREDIT",
        amount,
      },
    ],
  })
}

export interface InventoryDifferenceInput {
  inventoryCountId: string
  periodId: string
  summaryRecordId: string
  accountingEventId: string
  postingDate: string
  responsibleUserId: string
  /** Balanced manko/přebytek lines, accounts BY NUMBER. */
  lines: Array<{ accountNumber: string; side: DebitCredit; amount: Decimal }>
}

/** Generate an inventory-difference (manko/přebytek) posting, linked to the inventory. */
export async function recordInventoryDifference(
  db: RowExecutor,
  ctx: OrgCtx,
  input: InventoryDifferenceInput,
): Promise<PostedPosting> {
  const ids = await resolveAccountIds(
    db,
    input.periodId,
    input.lines.map((l) => l.accountNumber),
  )
  return postDoubleEntry(db, ctx, {
    periodId: input.periodId,
    summaryRecordId: input.summaryRecordId,
    accountingEventId: input.accountingEventId,
    postingDate: input.postingDate,
    responsibleUserId: input.responsibleUserId,
    inventoryCountId: input.inventoryCountId,
    lines: input.lines.map((l) => ({
      accountId: ids.get(l.accountNumber) as string,
      side: l.side,
      amount: l.amount,
    })),
  })
}
