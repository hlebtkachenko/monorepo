/**
 * Books (UC-2), period-scoped. v2 books are CONSUMERS of the trigger-maintained
 * read-model (account_period_balance / monetary_period_summary) plus indexed
 * line-scans of the postings — they are NOT recomputed views (read-heavy SaaS,
 * READ-MODEL-DESIGN.md). Each query is organization-scoped (FORCE RLS) and
 * period-scoped.
 *
 *   deník (journal)      = chronological line-scan (incl. 701 opening postings)
 *   hlavní kniha (GL)    = account_period_balance: počáteční stav | obraty | konečný stav
 *   obratová předvaha    = account_period_balance directly
 *   peněžní deník        = monetary line-scan + monetary_period_summary totals
 */

import { sql } from "drizzle-orm"
import { rows } from "./sql"
import type { ReadExecutor, RowExecutor } from "./sql"
import type {
  AccountNature,
  Decimal,
  DebitCredit,
  MonetaryDirection,
  MonetaryLocation,
} from "./types"

export interface JournalRow {
  posting_id: string
  posting_date: string
  is_opening: boolean
  is_closing: boolean
  summary_designation: string
  summary_type: string
  accounting_event_id: string
  event_description: string | null
  counterparty_name: string | null
  line_id: string
  account_id: string
  account_number: string
  account_name: string
  side: DebitCredit
  amount: Decimal
  /** [Tier 4] The inbox_item this posting landed from — non-null ⇒ "Created by Agent". */
  inbox_id: string | null
}

/** deník — DOUBLE_ENTRY postings of the period in chronological order (§13). */
export function journal(
  db: RowExecutor,
  periodId: string,
): Promise<JournalRow[]> {
  return rows<JournalRow>(
    db,
    sql`SELECT p.id  AS posting_id, p.posting_date, p.is_opening, p.is_closing,
               s.designation AS summary_designation, s.type AS summary_type,
               p.accounting_event_id,
               e.description AS event_description,
               cp.name AS counterparty_name,
               l.id  AS line_id, l.account_id, a.number AS account_number,
               a.name AS account_name, l.side, l.amount,
               p.inbox_id::text AS inbox_id
          FROM posting_double_entry_line l
          JOIN posting          p ON l.posting_id = p.id
          JOIN summary_record   s ON p.summary_record_id = s.id
          JOIN account          a ON l.account_id = a.id
          LEFT JOIN accounting_event e ON p.accounting_event_id = e.id
          LEFT JOIN counterparty    cp ON e.counterparty_id = cp.id
         WHERE p.period_id = ${periodId}::uuid
         ORDER BY p.posting_date, p.id, l.id`,
  )
}

export interface LedgerAccountRow {
  account_id: string
  account_number: string
  account_name: string
  nature: AccountNature
  normal_balance: DebitCredit | null
  opening_balance: Decimal
  turnover_debit: Decimal
  turnover_credit: Decimal
  closing_balance: Decimal
}

/**
 * hlavní kniha / obratová předvaha — per-account počáteční stav | obraty MD/Dal |
 * konečný stav, straight from the read-model. Ordered by account number.
 */
export function generalLedger(
  db: RowExecutor,
  periodId: string,
): Promise<LedgerAccountRow[]> {
  return rows<LedgerAccountRow>(
    db,
    sql`SELECT b.account_id, a.number AS account_number, a.name AS account_name,
               a.nature, a.normal_balance,
               b.opening_balance, b.turnover_debit, b.turnover_credit, b.closing_balance
          FROM account_period_balance b
          JOIN account a ON b.account_id = a.id
         WHERE b.period_id = ${periodId}::uuid
         ORDER BY a.number`,
  )
}

export interface AccountBalanceRow {
  account_id: string
  account_number: string
  opening_balance: Decimal
  turnover_debit: Decimal
  turnover_credit: Decimal
  closing_balance: Decimal
}

/**
 * A single GL account's balance from the read-model, by account NUMBER + period —
 * počáteční stav | obraty MD/Dal | konečný stav. The single-account subset of
 * generalLedger; returns null when the account has no balance row in the period
 * (never posted). A Finance `financial_account`'s balance is exactly this, looked
 * up by its `gl_account_number` (the 1:1-analytic invariant guarantees one row).
 */
export async function accountBalance(
  db: ReadExecutor,
  params: { accountNumber: string; periodId: string },
): Promise<AccountBalanceRow | null> {
  const result = await rows<AccountBalanceRow>(
    db,
    sql`SELECT b.account_id, a.number AS account_number,
               b.opening_balance, b.turnover_debit, b.turnover_credit, b.closing_balance
          FROM account_period_balance b
          JOIN account a ON b.account_id = a.id
         WHERE b.period_id = ${params.periodId}::uuid
           AND a.number = ${params.accountNumber}`,
  )
  return result[0] ?? null
}

export interface MonetaryJournalRow {
  posting_id: string
  posting_date: string
  summary_designation: string
  line_id: string
  category_id: string | null
  location: MonetaryLocation
  direction: MonetaryDirection
  is_tax_relevant: boolean
  is_clearing: boolean
  tax_base: Decimal | null
  amount: Decimal
}

/** peněžní deník — classified cash-book rows of the period (§13b / §7b). */
export function monetaryJournal(
  db: RowExecutor,
  periodId: string,
): Promise<MonetaryJournalRow[]> {
  return rows<MonetaryJournalRow>(
    db,
    sql`SELECT p.id AS posting_id, p.posting_date, s.designation AS summary_designation,
               l.id AS line_id, l.category_id, l.location, l.direction,
               l.is_tax_relevant, l.is_clearing, l.tax_base, l.amount
          FROM posting_monetary_line l
          JOIN posting        p ON l.posting_id = p.id
          JOIN summary_record s ON p.summary_record_id = s.id
         WHERE p.period_id = ${periodId}::uuid
         ORDER BY p.posting_date, p.id, l.id`,
  )
}

export interface MonetarySummaryRow {
  category_id: string | null
  direction: MonetaryDirection
  is_tax_relevant: boolean
  is_clearing: boolean
  location: MonetaryLocation
  total_amount: Decimal
  total_tax_base: Decimal
}

/** monetary_period_summary totals (feeds přehledy / DPFO). */
export function monetarySummary(
  db: RowExecutor,
  periodId: string,
): Promise<MonetarySummaryRow[]> {
  return rows<MonetarySummaryRow>(
    db,
    sql`SELECT category_id, direction, is_tax_relevant, is_clearing, location,
               total_amount, total_tax_base
          FROM monetary_period_summary
         WHERE period_id = ${periodId}::uuid
         ORDER BY direction, category_id NULLS LAST`,
  )
}
