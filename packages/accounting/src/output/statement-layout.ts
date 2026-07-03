/**
 * Statutory statement LAYOUT (Decree 500/2002 Sb., přílohy 1–2) — the formatted
 * rozvaha (aktiva / pasiva) + výkaz zisku a ztráty (druhové členění), built by
 * rolling the account-level statement-line codes (from buildZaverka:
 * balance_sheet_line / income_statement_line) up their dotted hierarchy into the
 * příloha's aggregate lines. Where buildZaverka gives per-account numbers +
 * resolved line codes, this gives the filing-shaped, subtotalled výkaz.
 *
 * Roll-up: a leaf code "B.II.1" contributes to "B", "B.II", and "B.II.1"; every
 * prefix is summed (in SQL, R13). Aktiva = ASSET accounts (debit-positive);
 * pasiva = LIABILITY+EQUITY (credit-positive); VZZ = EXPENSE/REVENUE by their
 * income-statement line, each as a positive magnitude (líne codes are single-
 * sided in the druhové výkaz). The výsledek is výnosy − náklady.
 *
 *   rozsah:  FULL        — every level (plný rozsah, §3a for audited/large)
 *            ABBREVIATED — letter + roman only (zkrácený, micro/small §3a): the
 *                          roll-up keeps depth ≤ 2 (e.g. "B", "B.II"), dropping
 *                          the numbered detail lines.
 *   unit:    CZK         — whole koruny
 *            THOUSANDS   — v celých tisících Kč (výkazy are filed in thousands)
 *
 * Rounding to the presentation unit is the LAST step, in SQL. Cross-check:
 * aktiva_total = pasiva_total (bilanční rovnost) holds only AFTER závěrka (the
 * výsledek is carried to equity 431); PRE-close aktiva_total − pasiva_total equals
 * the still-open P&L result (= výsledek). výsledek always foots the VZZ.
 */

import { sql, type SQL } from "drizzle-orm"
import { rows, one } from "../sql"
import type { RowExecutor } from "../sql"
import type { Decimal } from "../types"

export type StatementRozsah = "FULL" | "ABBREVIATED"
export type StatementUnit = "CZK" | "THOUSANDS"

/** Round a money SQL expression to the presentation unit (v tisících Kč / celé Kč). */
function roundToUnit(expr: SQL, unit: StatementUnit): SQL {
  return unit === "THOUSANDS"
    ? sql`round((${expr}) / 1000)`
    : sql`round((${expr}), 2)`
}

export interface LayoutLine {
  /** the příloha line code (e.g. "B", "B.II", "B.II.1"). */
  code: string
  /** nesting depth (1 = letter, 2 = roman, …). */
  depth: number
  /** rolled-up amount in the presentation unit. */
  amount: Decimal
}

export interface StatementLayout {
  type: "STATEMENT_LAYOUT"
  rozsah: StatementRozsah
  unit: StatementUnit
  aktiva: LayoutLine[]
  aktiva_total: Decimal
  pasiva: LayoutLine[]
  pasiva_total: Decimal
  vzz: LayoutLine[]
  naklady: Decimal
  vynosy: Decimal
  vysledek: Decimal
}

/**
 * Roll one statement's account lines up their dotted code hierarchy and round to
 * the presentation unit. `part` selects the source set:
 *   AKTIVA — ASSET accounts, amount = closing_balance, line = balance_sheet_line
 *   PASIVA — LIABILITY+EQUITY, amount = −closing_balance, line = balance_sheet_line
 *   VZZ    — EXPENSE (closing_balance) + REVENUE (−closing_balance), income_statement_line
 */
async function rollUp(
  db: RowExecutor,
  periodId: string,
  part: "AKTIVA" | "PASIVA" | "VZZ",
  rozsah: StatementRozsah,
  unit: StatementUnit,
): Promise<LayoutLine[]> {
  const natureFilter =
    part === "AKTIVA"
      ? sql`a.nature = 'ASSET'`
      : part === "PASIVA"
        ? sql`a.nature IN ('LIABILITY', 'EQUITY')`
        : sql`a.nature IN ('EXPENSE', 'REVENUE')`
  const amount =
    part === "AKTIVA"
      ? sql`b.closing_balance`
      : part === "PASIVA"
        ? sql`-b.closing_balance`
        : sql`CASE WHEN a.nature = 'EXPENSE' THEN b.closing_balance ELSE -b.closing_balance END`
  const lineCode =
    part === "VZZ"
      ? sql`COALESCE(da.income_statement_line, ag.income_statement_line)`
      : sql`COALESCE(
             CASE WHEN da.balance_sheet_line_when_debit IS NOT NULL AND da.balance_sheet_line_when_credit IS NOT NULL
                  THEN CASE WHEN b.closing_balance >= 0 THEN da.balance_sheet_line_when_debit ELSE da.balance_sheet_line_when_credit END
                  ELSE da.balance_sheet_line END,
             CASE WHEN ag.balance_sheet_line_when_debit IS NOT NULL AND ag.balance_sheet_line_when_credit IS NOT NULL
                  THEN CASE WHEN b.closing_balance >= 0 THEN ag.balance_sheet_line_when_debit ELSE ag.balance_sheet_line_when_credit END
                  ELSE ag.balance_sheet_line END)`
  const round = sql`${roundToUnit(sql`SUM(amount)`, unit)}::numeric(19,4)`
  const maxDepth = rozsah === "ABBREVIATED" ? 2 : 99

  return rows<LayoutLine>(
    db,
    sql`
      WITH leaf AS (
        SELECT (${lineCode}) AS code, (${amount})::numeric AS amount
          FROM account_period_balance b
          JOIN account a ON b.account_id = a.id
          LEFT JOIN directive_account da ON da.code = a.specializes_directive_code
          LEFT JOIN account_group    ag ON ag.code = a.group_code
         WHERE b.period_id = ${periodId}::uuid
           AND a.nature <> 'CLOSING'
           AND ${natureFilter}
      ),
      expanded AS (
        -- every dotted prefix of a leaf code contributes to its own aggregate line
        SELECT array_to_string((string_to_array(code, '.'))[1:g], '.') AS code,
               array_length(string_to_array(code, '.'), 1) AS leaf_depth,
               g AS depth,
               amount
          FROM leaf,
               LATERAL generate_series(1, array_length(string_to_array(code, '.'), 1)) g
         WHERE code IS NOT NULL AND code <> ''
      )
      SELECT code, depth, ${round} AS amount
        FROM expanded
       WHERE depth <= ${maxDepth}
       GROUP BY code, depth
      HAVING round(SUM(amount), 2) <> 0
       ORDER BY code`,
  )
}

async function partTotal(
  db: RowExecutor,
  periodId: string,
  part: "AKTIVA" | "PASIVA",
  unit: StatementUnit,
): Promise<Decimal> {
  const natureFilter =
    part === "AKTIVA"
      ? sql`a.nature = 'ASSET'`
      : sql`a.nature IN ('LIABILITY', 'EQUITY')`
  const amount =
    part === "AKTIVA" ? sql`b.closing_balance` : sql`-b.closing_balance`
  const round = sql`${roundToUnit(sql`COALESCE(SUM(${amount}), 0)`, unit)}::numeric(19,4)`
  const r = await one<{ total: Decimal }>(
    db,
    sql`SELECT ${round} AS total
          FROM account_period_balance b
          JOIN account a ON b.account_id = a.id
         WHERE b.period_id = ${periodId}::uuid AND a.nature <> 'CLOSING' AND ${natureFilter}`,
  )
  return r.total
}

/** Build the formatted rozvaha + VZZ layout for a period. */
export async function buildStatementLayout(
  db: RowExecutor,
  periodId: string,
  opts: { rozsah?: StatementRozsah; unit?: StatementUnit } = {},
): Promise<StatementLayout> {
  const rozsah = opts.rozsah ?? "FULL"
  const unit = opts.unit ?? "THOUSANDS"

  const [aktiva, pasiva, vzz, aktiva_total, pasiva_total, totals] =
    await Promise.all([
      rollUp(db, periodId, "AKTIVA", rozsah, unit),
      rollUp(db, periodId, "PASIVA", rozsah, unit),
      rollUp(db, periodId, "VZZ", rozsah, unit),
      partTotal(db, periodId, "AKTIVA", unit),
      partTotal(db, periodId, "PASIVA", unit),
      one<{ naklady: Decimal; vynosy: Decimal; vysledek: Decimal }>(
        db,
        sql`
          WITH acct AS (
            SELECT a.nature, b.closing_balance AS z
              FROM account_period_balance b
              JOIN account a ON b.account_id = a.id
             WHERE b.period_id = ${periodId}::uuid AND a.nature <> 'CLOSING'
          )
          SELECT
            ${roundToUnit(sql`COALESCE(SUM(z) FILTER (WHERE nature = 'EXPENSE'), 0)`, unit)}::numeric(19,4) AS naklady,
            ${roundToUnit(sql`COALESCE(SUM(-z) FILTER (WHERE nature = 'REVENUE'), 0)`, unit)}::numeric(19,4) AS vynosy,
            ${roundToUnit(sql`COALESCE(SUM(-z) FILTER (WHERE nature = 'REVENUE'), 0) - COALESCE(SUM(z) FILTER (WHERE nature = 'EXPENSE'), 0)`, unit)}::numeric(19,4) AS vysledek
            FROM acct`,
      ),
    ])

  return {
    type: "STATEMENT_LAYOUT",
    rozsah,
    unit,
    aktiva,
    aktiva_total,
    pasiva,
    pasiva_total,
    vzz,
    naklady: totals.naklady,
    vynosy: totals.vynosy,
    vysledek: totals.vysledek,
  }
}
