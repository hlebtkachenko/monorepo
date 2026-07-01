/**
 * Účetní závěrka (DOUBLE_ENTRY §18). R9-derived from the read-model
 * (account_period_balance closing balances), never hand-entered: rozvaha (aktiva
 * / pasiva) + výkaz zisku a ztráty (náklady / výnosy / výsledek). Technical close
 * accounts (nature CLOSING, e.g. 701/702/710) are excluded. Each account's
 * statement line resolves through the cascade
 *   account.specializes_directive_code → directive_account → account_group
 * with the sign-split (481 / 341-345 / mixed groups map to different rozvaha rows
 * by balance sign). All sums in SQL (decimal, no JS float). Statutory layout is
 * deferred — numbers + the resolved line code only.
 */

import { sql } from "drizzle-orm"
import { one, rows } from "../sql"
import type { RowExecutor } from "../sql"
import type { Decimal } from "../types"

export interface ZaverkaTotals {
  aktiva: Decimal
  pasiva: Decimal
  naklady: Decimal
  vynosy: Decimal
  vysledek: Decimal
}

export interface StatementLineRow {
  account_number: string
  nature: string
  closing_balance: Decimal
  balance_sheet_line: string | null
  income_statement_line: string | null
}

export interface Zaverka extends ZaverkaTotals {
  type: "FINANCIAL_STATEMENTS"
  lines: StatementLineRow[]
}

export async function buildZaverka(
  db: RowExecutor,
  periodId: string,
): Promise<Zaverka> {
  const totals = await one<ZaverkaTotals>(
    db,
    sql`
      WITH acct AS (
        SELECT a.nature, b.closing_balance AS z
          FROM account_period_balance b
          JOIN account a ON b.account_id = a.id
         WHERE b.period_id = ${periodId}::uuid
           AND a.nature <> 'CLOSING'
      )
      -- ::numeric(19,4) so an empty aggregate formats as '0.0000', not '0'
      SELECT
        COALESCE(SUM(z)  FILTER (WHERE nature = 'ASSET'), 0)::numeric(19,4)                  AS aktiva,
        COALESCE(SUM(-z) FILTER (WHERE nature IN ('LIABILITY', 'EQUITY')), 0)::numeric(19,4) AS pasiva,
        COALESCE(SUM(z)  FILTER (WHERE nature = 'EXPENSE'), 0)::numeric(19,4)                AS naklady,
        COALESCE(SUM(-z) FILTER (WHERE nature = 'REVENUE'), 0)::numeric(19,4)                AS vynosy,
        (COALESCE(SUM(-z) FILTER (WHERE nature = 'REVENUE'), 0)
          - COALESCE(SUM(z) FILTER (WHERE nature = 'EXPENSE'), 0))::numeric(19,4)            AS vysledek
      FROM acct`,
  )

  const lines = await rows<StatementLineRow>(
    db,
    sql`
      SELECT a.number AS account_number, a.nature, b.closing_balance,
             -- balance_sheet_line: directive over group, sign-split by closing sign
             COALESCE(
               CASE WHEN da.balance_sheet_line_when_debit IS NOT NULL AND da.balance_sheet_line_when_credit IS NOT NULL
                    THEN CASE WHEN b.closing_balance >= 0 THEN da.balance_sheet_line_when_debit ELSE da.balance_sheet_line_when_credit END
                    ELSE da.balance_sheet_line END,
               CASE WHEN ag.balance_sheet_line_when_debit IS NOT NULL AND ag.balance_sheet_line_when_credit IS NOT NULL
                    THEN CASE WHEN b.closing_balance >= 0 THEN ag.balance_sheet_line_when_debit ELSE ag.balance_sheet_line_when_credit END
                    ELSE ag.balance_sheet_line END
             ) AS balance_sheet_line,
             COALESCE(da.income_statement_line, ag.income_statement_line) AS income_statement_line
        FROM account_period_balance b
        JOIN account a ON b.account_id = a.id
        LEFT JOIN directive_account da ON da.code = a.specializes_directive_code
        LEFT JOIN account_group    ag ON ag.code = a.group_code
       WHERE b.period_id = ${periodId}::uuid
         AND a.nature <> 'CLOSING'
       ORDER BY a.number`,
  )

  return { type: "FINANCIAL_STATEMENTS", ...totals, lines }
}
