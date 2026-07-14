/**
 * Cross-cutting invariants queried at the service layer. The DB enforces the
 * hard ones inline (R4 balance trigger, R6 output-completeness gate, §16
 * post-to-parent block); these helpers expose the same checks for previews and
 * for the periodic drift job.
 *
 *   R6  every účetní případ of a period is posted before output (§8/3) — the
 *       case→posting link (the v1 per-dílčí hole is closed: completeness is on
 *       individual_record → posting, same as the period_output gate trigger).
 *   R5/§16  Σ(analytical closing_balance) = synthetic closing_balance — a
 *       synthetic with children takes no direct posting, so the analytics ARE
 *       the synthetic balance; this surfaces any direct balance on a parent.
 *   drift  read-model closing_balance = Σ(journal lines) per account (the
 *       app_reconcile_account_period safety net) + any unbalanced posting.
 *   R11 bidirectional trace: account → posting → doklad → případ, and case →
 *       its postings.
 */

import { sql } from "drizzle-orm"
import { rows } from "./sql"
import type { RowExecutor } from "./sql"
import type { Decimal, DebitCredit } from "./types"

export interface UnpostedCase {
  individual_record_id: string
  accounting_event_id: string
  summary_record_id: string
  event_designation: string
}

/**
 * R6 gate (preview). Returns the period's individual_records (cases on a doklad)
 * with no matching posting (same event + same doklad in this period). The period
 * is fully posted iff this returns [] — exactly what the period_output trigger
 * enforces at finalization.
 */
export function unpostedCases(
  db: RowExecutor,
  periodId: string,
): Promise<UnpostedCase[]> {
  return rows<UnpostedCase>(
    db,
    sql`SELECT i.id AS individual_record_id, i.accounting_event_id, i.summary_record_id,
               e.designation AS event_designation
          FROM individual_record i
          JOIN summary_record  s ON s.id = i.summary_record_id
          JOIN accounting_event e ON e.id = i.accounting_event_id
         WHERE s.period_id = ${periodId}::uuid
           AND NOT EXISTS (
             SELECT 1 FROM posting p
              WHERE p.accounting_event_id = i.accounting_event_id
                AND p.summary_record_id  = i.summary_record_id
                AND p.period_id          = ${periodId}::uuid)
         ORDER BY i.id`,
  )
}

export interface UnlinkedInvoiceLine {
  posting_id: string
  line_id: string
  summary_record_id: string
  summary_designation: string
}

/**
 * Partial-link completeness (the derive-vertical invariant). Every double-entry
 * line of a NON-GENERATED invoice posting must carry its source partial_record_id
 * (§6/2 line → dílčí link) — this is what `bookDocument` stamps and what the old
 * hand-built posting path left NULL. Generated postings legitimately post lines
 * with a null partial_record_id (opening 701, depreciation, inventory difference,
 * correction/storno — all keyed by their own header column), so they are excluded
 * by the scope predicate. Empty = every invoice-derived line is linked to its
 * partial; a non-empty result is a wiring regression the CI drift job flags.
 */
export function unlinkedInvoiceLines(
  db: RowExecutor,
  periodId: string,
): Promise<UnlinkedInvoiceLine[]> {
  return rows<UnlinkedInvoiceLine>(
    db,
    sql`SELECT p.id AS posting_id, l.id AS line_id,
               s.id AS summary_record_id, s.designation AS summary_designation
          FROM posting_double_entry_line l
          JOIN posting        p ON l.posting_id = p.id
          JOIN summary_record s ON p.summary_record_id = s.id
         WHERE p.period_id = ${periodId}::uuid
           AND s.type IN ('RECEIVED_INVOICE', 'ISSUED_INVOICE')
           AND p.corrects_posting_id  IS NULL
           AND p.depreciation_plan_id IS NULL
           AND p.inventory_count_id   IS NULL
           AND p.is_opening = false
           AND l.partial_record_id IS NULL
         ORDER BY p.id, l.id`,
  )
}

export interface AnalyticalReconcile {
  synthetic_code: string
  analytical_sum: Decimal
  synthetic_direct: Decimal
  reconciles: boolean
}

/**
 * R5 / §16 reconcile for a period. For each synthetic_code with analytical
 * children, the sum of the children's closing balances and any balance posted
 * directly to the synthetic account; `reconciles` is true when nothing bypasses
 * the analytics (synthetic_direct = 0 — best practice posts only to analytics,
 * and the §16 trigger blocks direct posting to a parent-with-children).
 */
export function reconcileAnalytics(
  db: RowExecutor,
  periodId: string,
): Promise<AnalyticalReconcile[]> {
  return rows<AnalyticalReconcile>(
    db,
    sql`
      WITH bal AS (
        SELECT a.id, a.synthetic_code, a.is_synthetic, a.parent_id, b.closing_balance
          FROM account a
          JOIN account_period_balance b ON b.account_id = a.id AND b.period_id = ${periodId}::uuid
         WHERE a.period_id = ${periodId}::uuid
      ),
      analytical AS (
        SELECT synthetic_code, SUM(closing_balance) AS analytical_sum
          FROM bal WHERE parent_id IS NOT NULL
         GROUP BY synthetic_code
      ),
      direct AS (
        SELECT synthetic_code, SUM(closing_balance) AS synthetic_direct
          FROM bal WHERE parent_id IS NULL
         GROUP BY synthetic_code
      )
      SELECT a.synthetic_code,
             a.analytical_sum,
             COALESCE(d.synthetic_direct, 0) AS synthetic_direct,
             (COALESCE(d.synthetic_direct, 0) = 0) AS reconciles
        FROM analytical a
        LEFT JOIN direct d ON d.synthetic_code = a.synthetic_code
       ORDER BY a.synthetic_code`,
  )
}

export interface ReadModelDrift {
  account_id: string
  read_model_closing: Decimal
  journal_sum: Decimal
}

/** Read-model drift check — wraps app_reconcile_account_period. Empty = no drift. */
export function reconcileReadModel(
  db: RowExecutor,
  periodId: string,
): Promise<ReadModelDrift[]> {
  return rows<ReadModelDrift>(
    db,
    sql`SELECT account_id, read_model_closing, journal_sum
          FROM app_reconcile_account_period(${periodId}::uuid)`,
  )
}

export interface UnbalancedPosting {
  posting_id: string
  sum_debit: Decimal
  sum_credit: Decimal
}

/** Defense-in-depth — wraps app_find_unbalanced_postings. Empty = all balance. */
export function findUnbalancedPostings(
  db: RowExecutor,
  periodId: string,
): Promise<UnbalancedPosting[]> {
  return rows<UnbalancedPosting>(
    db,
    sql`SELECT posting_id, sum_debit, sum_credit
          FROM app_find_unbalanced_postings(${periodId}::uuid)`,
  )
}

export interface AccountTraceRow {
  posting_id: string
  line_id: string
  side: DebitCredit
  amount: Decimal
  posting_date: string
  summary_record_id: string
  summary_designation: string
  accounting_event_id: string
  event_designation: string
}

/** R11 forward trace: from an account, the contributing postings → doklad → případ. */
export function traceAccount(
  db: RowExecutor,
  accountId: string,
): Promise<AccountTraceRow[]> {
  return rows<AccountTraceRow>(
    db,
    sql`SELECT p.id AS posting_id, l.id AS line_id, l.side, l.amount,
               p.posting_date, s.id AS summary_record_id, s.designation AS summary_designation,
               e.id AS accounting_event_id, e.designation AS event_designation
          FROM posting_double_entry_line l
          JOIN posting        p ON l.posting_id = p.id
          JOIN summary_record s ON p.summary_record_id = s.id
          JOIN accounting_event e ON p.accounting_event_id = e.id
         WHERE l.account_id = ${accountId}::uuid
         ORDER BY p.posting_date, p.id`,
  )
}

export interface CasePostingRow {
  posting_id: string
  posting_date: string
  regime_code: string
  summary_designation: string
}

/** R11 reverse trace: from a case (accounting_event), every posting that records it. */
export function traceEvent(
  db: RowExecutor,
  accountingEventId: string,
): Promise<CasePostingRow[]> {
  return rows<CasePostingRow>(
    db,
    sql`SELECT p.id AS posting_id, p.posting_date, p.regime_code, s.designation AS summary_designation
          FROM posting p
          JOIN summary_record s ON p.summary_record_id = s.id
         WHERE p.accounting_event_id = ${accountingEventId}::uuid
         ORDER BY p.posting_date, p.id`,
  )
}
