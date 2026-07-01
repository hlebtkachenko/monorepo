/**
 * Auto-driven depreciation (UC-4). Where supporting.ts posts ONE monthly účetní
 * odpis from an explicit amount, this module DRIVES the whole run from the plan +
 * the asset card:
 *
 *   runDepreciationForPeriod — reads the plan (monthly_amount, residual), the
 *     asset (acquisition_cost + improvement), and the already-accumulated účetní
 *     odpis (Σ prior depreciation postings for the plan), then posts one MD 551 /
 *     D 08x posting per month across the period, capping the final month to the
 *     remaining depreciable base so the plan never over-depreciates. The monthly
 *     schedule (which months, how much each) is computed in SQL (R13) — the TS
 *     side only loops and posts.
 *
 *   bookVsTaxForAsset — the §23/3 bridge that DPPO needs: the účetní odpis posted
 *     in the period vs the DAŇOVÝ odpis for the same year (from the tax_depreciation
 *     card via depreciation.ts), returning the add-back / deduction to feed buildDppo.
 *     This closes the "auto-feed book-vs-tax to DPPO" loop without a hand-computed
 *     figure.
 *
 * Law frame: ČÚS 013 + Vyhláška §56 (účetní odpisy), ZDP §26–§32 (daňové odpisy),
 * §23/3 (účetní-vs-daňové adjustment). Run inside a withOrganization transaction.
 */

import { sql } from "drizzle-orm"
import { one, rows } from "./sql"
import type { RowExecutor } from "./sql"
import { resolveAccountIds } from "./accounts"
import { postDoubleEntry } from "./posting/double-entry"
import {
  straightLineTaxDepreciation,
  acceleratedTaxDepreciation,
  bookVsTaxAdjustment,
  type DepreciationGroup,
} from "./depreciation"
import type { Decimal, OrgCtx, PostedPosting } from "./types"

export interface RunDepreciationInput {
  depreciationPlanId: string
  periodId: string
  /** internal voucher + case the generated postings hang off (R6-safe). */
  summaryRecordId: string
  accountingEventId: string
  responsibleUserId: string
  /** first month to post (any day in the month); defaults to the plan start_date. */
  fromMonth?: string
  /** last month to post (any day in the month); defaults to the period end. */
  throughMonth?: string
}

export interface RunDepreciationResult {
  postings: PostedPosting[]
  monthsPosted: number
  totalPosted: Decimal
}

/**
 * Auto-post the monthly účetní odpisy for a plan across a period. Returns one
 * PostedPosting per month actually posted (a fully-depreciated plan posts none).
 */
export async function runDepreciationForPeriod(
  db: RowExecutor,
  ctx: OrgCtx,
  input: RunDepreciationInput,
): Promise<RunDepreciationResult> {
  const plan = await one<{
    asset_id: string
    start_date: string
    expense_account_number: string
    accumulated_account_number: string
  }>(
    db,
    sql`SELECT asset_id, start_date, expense_account_number, accumulated_account_number
          FROM depreciation_plan WHERE id = ${input.depreciationPlanId}::uuid`,
  )
  const period = await one<{ period_start: string; period_end: string }>(
    db,
    sql`SELECT period_start, period_end FROM accounting_period WHERE id = ${input.periodId}::uuid`,
  )
  const from = input.fromMonth ?? plan.start_date
  const through = input.throughMonth ?? period.period_end

  // The monthly schedule, computed in SQL: month-end dates + the (capped) amount
  // for each, stopping once the remaining depreciable base is exhausted.
  const schedule = await rows<{ month_end: string; amount: Decimal }>(
    db,
    sql`
      WITH p AS (
        SELECT dp.monthly_amount,
               dp.residual_value,
               (a.acquisition_cost + a.improvement_total) AS cost,
               COALESCE((
                 SELECT SUM(l.amount)
                   FROM posting_double_entry_line l
                   JOIN posting po ON po.id = l.posting_id AND po.organization_id = l.organization_id
                  WHERE po.depreciation_plan_id = dp.id AND l.side = 'DEBIT'
               ), 0) AS accumulated
          FROM depreciation_plan dp
          JOIN asset a ON a.id = dp.asset_id AND a.organization_id = dp.organization_id
         WHERE dp.id = ${input.depreciationPlanId}::uuid
      ),
      base AS (
        SELECT monthly_amount, (cost - residual_value - accumulated) AS remaining FROM p
      ),
      months AS (
        SELECT (generate_series(date_trunc('month', ${from}::date),
                                date_trunc('month', ${through}::date),
                                interval '1 month') + interval '1 month - 1 day')::date AS month_end
      ),
      sched AS (
        SELECT m.month_end,
               row_number() OVER (ORDER BY m.month_end) AS n,
               base.monthly_amount,
               base.remaining
          FROM months m CROSS JOIN base
      )
      SELECT month_end,
             GREATEST(LEAST(monthly_amount, remaining - monthly_amount * (n - 1)), 0)::numeric(19,4) AS amount
        FROM sched
       WHERE remaining - monthly_amount * (n - 1) > 0
       ORDER BY month_end`,
  )

  const ids = await resolveAccountIds(db, input.periodId, [
    plan.expense_account_number,
    plan.accumulated_account_number,
  ])
  const expenseId = ids.get(plan.expense_account_number) as string
  const accumulatedId = ids.get(plan.accumulated_account_number) as string

  const postings: PostedPosting[] = []
  for (const row of schedule) {
    if (Number(row.amount) <= 0) continue
    postings.push(
      await postDoubleEntry(db, ctx, {
        periodId: input.periodId,
        summaryRecordId: input.summaryRecordId,
        accountingEventId: input.accountingEventId,
        postingDate: row.month_end,
        responsibleUserId: input.responsibleUserId,
        depreciationPlanId: input.depreciationPlanId,
        lines: [
          { accountId: expenseId, side: "DEBIT", amount: row.amount },
          { accountId: accumulatedId, side: "CREDIT", amount: row.amount },
        ],
      }),
    )
  }

  // Total = Σ debit lines of exactly the postings this run created (SQL, R13).
  const total = postings.length
    ? (
        await one<{ total: Decimal }>(
          db,
          sql`SELECT COALESCE(SUM(amount), 0)::numeric(19,4) AS total
                FROM posting_double_entry_line
               WHERE side = 'DEBIT'
                 AND posting_id IN (${sql.join(
                   postings.map((p) => sql`${p.postingId}::uuid`),
                   sql`, `,
                 )})`,
        )
      ).total
    : "0.0000"

  return {
    postings,
    monthsPosted: postings.length,
    totalPosted: total,
  }
}

export interface BookVsTaxResult {
  /** účetní odpis posted for the asset's plan in the period. */
  bookDepreciation: Decimal
  /** daňový odpis for the tax year (from the tax_depreciation card). */
  taxDepreciation: Decimal
  /** §23/3 add-back (účetní > daňový) to feed buildDppo.nonDeductibleExpenses. */
  addBack: Decimal
  /** §23/3 deduction (daňový > účetní) — a deduction from the base. */
  deduct: Decimal
}

/**
 * Compute the §23/3 účetní-vs-daňové odpis adjustment for one asset in a period.
 * bookDepreciation = Σ posted účetní odpis for the asset's ACTIVE plan in the
 * period; taxDepreciation = this year's daňový odpis from the tax_depreciation
 * card (odpisová skupina + method + vstupní cena + accumulated so far).
 */
export async function bookVsTaxForAsset(
  db: RowExecutor,
  ctx: OrgCtx,
  input: { assetId: string; periodId: string; taxYear: number },
): Promise<BookVsTaxResult> {
  const book = await one<{ book: Decimal }>(
    db,
    sql`
      SELECT COALESCE(SUM(l.amount), 0)::numeric(19,4) AS book
        FROM posting_double_entry_line l
        JOIN posting po ON po.id = l.posting_id AND po.organization_id = l.organization_id
        JOIN depreciation_plan dp ON dp.id = po.depreciation_plan_id
       WHERE dp.asset_id = ${input.assetId}::uuid
         AND po.period_id = ${input.periodId}::uuid
         AND po.organization_id = ${ctx.organizationId}::uuid
         AND l.side = 'DEBIT'`,
  )

  const card = await one<{
    depreciation_group_code: number
    method: string
    tax_base: Decimal
    tax_improvement_total: Decimal
    accumulated_amount: Decimal
    start_year: number
    is_suspended: boolean
  }>(
    db,
    sql`SELECT depreciation_group_code, method, tax_base, tax_improvement_total,
               accumulated_amount, start_year, is_suspended
          FROM tax_depreciation WHERE asset_id = ${input.assetId}::uuid`,
  )

  const group = card.depreciation_group_code as DepreciationGroup
  const cost = (
    Number(card.tax_base) + Number(card.tax_improvement_total)
  ).toFixed(2)
  const yearIndex = input.taxYear - card.start_year + 1
  const taxDepreciation = card.is_suspended
    ? "0.00"
    : card.method === "ACCELERATED"
      ? acceleratedTaxDepreciation(
          cost,
          group,
          yearIndex,
          card.accumulated_amount,
        )
      : straightLineTaxDepreciation(cost, group, yearIndex)

  const adj = bookVsTaxAdjustment(book.book, taxDepreciation)
  return {
    bookDepreciation: book.book,
    taxDepreciation,
    addBack: adj.addBack,
    deduct: adj.deduct,
  }
}
