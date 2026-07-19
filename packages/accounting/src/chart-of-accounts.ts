/**
 * Chart-of-accounts (Účtový rozvrh) + framework (Účetní osnova) + prebuilt-template reads.
 *
 * The SINGLE domain source for the list surfaces — the web RSC pages and the /v1 controllers
 * both read here, so each SELECT (incl. the GENERATED structural columns) lives once, not
 * duplicated per caller. Snake_case DB-native rows; the app edge camelCases for presentation.
 *
 * Three distinct reads, kept deliberately separate (osnova ≠ rozvrh):
 *   - listAccounts        — the tenant's OWN Účtový rozvrh (org-scoped, per-period).
 *   - listDirectiveYear   — the year-based Účetní osnova (shared framework; synthetic-only).
 *   - listChartTemplates / listChartTemplateAccounts — the prebuilt house rozvrh a user forks.
 */

import { sql } from "drizzle-orm"
import type { SQL } from "drizzle-orm"
import { rows } from "./sql"
import type { ReadExecutor } from "./sql"
import type { AccountNature, DebitCredit } from "./types"

/**
 * One account row for the Účtová osnova list. Snake_case, DB-native (matching the books
 * read-model rows) — the app edge camelCases for presentation. The four structural columns
 * (class / group_code / synthetic_code / is_synthetic) are GENERATED from `number` /
 * `parent_id`; the user-chosen stored flags are `tracks_open_items` (saldokonto) + `tax_relevant`
 * (Daňový).
 */
export interface ChartAccountRow {
  id: string
  chart_id: string
  period_id: string
  number: string
  name: string
  nature: AccountNature
  normal_balance: DebitCredit | null
  tracks_open_items: boolean
  tax_relevant: boolean | null
  parent_id: string | null
  class: number
  group_code: string | null
  synthetic_code: string
  is_synthetic: boolean
  specializes_directive_code: string | null
}

/**
 * List a tenant chart's accounts. `periodId` scopes to one účetní období (the usual list
 * surface); `isSynthetic` / `number` are optional narrowing filters shared with the /v1
 * accounts controller. Sorted by period then číslo účtu.
 */
export function listAccounts(
  db: ReadExecutor,
  filter: { periodId?: string; isSynthetic?: boolean; number?: string } = {},
): Promise<ChartAccountRow[]> {
  const conds: SQL[] = []
  if (filter.periodId) conds.push(sql`period_id = ${filter.periodId}::uuid`)
  if (filter.isSynthetic !== undefined) {
    conds.push(sql`is_synthetic = ${filter.isSynthetic}`)
  }
  if (filter.number) conds.push(sql`number = ${filter.number}`)
  const where = conds.length ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``
  return rows<ChartAccountRow>(
    db,
    sql`SELECT id, chart_id, period_id, number, name, nature, normal_balance, tracks_open_items,
               tax_relevant, parent_id, class, group_code, synthetic_code, is_synthetic,
               specializes_directive_code
        FROM account
        ${where}
        ORDER BY period_id, number`,
  )
}

/** The chart id for a period, or null if the period has no chart of accounts yet. */
export async function findChartId(
  db: ReadExecutor,
  periodId: string,
): Promise<string | null> {
  const found = await rows<{ id: string }>(
    db,
    sql`SELECT id FROM chart_of_accounts WHERE period_id = ${periodId}::uuid LIMIT 1`,
  )
  return found[0]?.id ?? null
}

/**
 * One row of the year-based Účetní osnova (account directive). Joins the year overlay onto the
 * stable catalogue: names + nature + statement mapping come from directive_account, membership
 * + saldo/tax defaults from directive_account_year. Synthetic-only (3-digit code) — the osnova
 * NEVER carries analytics.
 */
export interface DirectiveYearRow {
  year: number
  code: string
  name_cs: string
  name_en: string | null
  group_code: string
  nature: AccountNature
  normal_balance: DebitCredit | null
  tracks_open_items: boolean
  tax_relevant: boolean | null
  balance_sheet_line: string | null
  income_statement_line: string | null
  deprecated: boolean
}

/**
 * The Účetní osnova for a year, sorted by code. Reference read (no tenant scope) — safe under
 * `withOrgReadonly` too. `includeDeprecated` defaults false (the fill-a-chart source excludes
 * retired účty like 011 Zřizovací výdaje).
 */
export function listDirectiveYear(
  db: ReadExecutor,
  year: number,
  filter: { includeDeprecated?: boolean } = {},
): Promise<DirectiveYearRow[]> {
  const notDeprecated = filter.includeDeprecated
    ? sql``
    : sql`AND day.deprecated = false`
  // Statement line = the cascade the rozvaha/VZZ builder uses: the per-synthetic directive
  // override, else the legally-guaranteed account_group fallback (§14 + Vyhláška 500/2002).
  return rows<DirectiveYearRow>(
    db,
    sql`SELECT day.year, da.code,
               COALESCE(day.name_cs, da.name_cs) AS name_cs, da.name_en, da.group_code,
               da.nature, da.normal_balance,
               day.tracks_open_items, day.tax_relevant,
               COALESCE(da.balance_sheet_line, ag.balance_sheet_line) AS balance_sheet_line,
               COALESCE(da.income_statement_line, ag.income_statement_line) AS income_statement_line,
               day.deprecated
        FROM directive_account_year day
        JOIN directive_account da ON da.code = day.code
        LEFT JOIN account_group ag ON ag.code = da.group_code
        WHERE day.year = ${year} ${notDeprecated}
        ORDER BY da.code`,
  )
}

/** One prebuilt Účtový rozvrh template (header). */
export interface ChartTemplateRow {
  id: string
  year: number
  code: string
  name: string
  source: string | null
  is_default: boolean
}

/** The prebuilt house rozvrh templates for a year, default first then name. */
export function listChartTemplates(
  db: ReadExecutor,
  year: number,
): Promise<ChartTemplateRow[]> {
  return rows<ChartTemplateRow>(
    db,
    sql`SELECT id, year, code, name, source, is_default
        FROM chart_template
        WHERE year = ${year}
        ORDER BY is_default DESC, name`,
  )
}

/** One account of a prebuilt rozvrh template. */
export interface ChartTemplateAccountRow {
  id: string
  number: string
  name: string
  nature: AccountNature
  normal_balance: DebitCredit | null
  tracks_open_items: boolean
  tax_relevant: boolean | null
  is_allowance: boolean
  parent_number: string | null
  specializes_directive_code: string | null
}

/** The účty of one prebuilt rozvrh template, sorted by number (synthetics before analytics). */
export function listChartTemplateAccounts(
  db: ReadExecutor,
  templateId: string,
): Promise<ChartTemplateAccountRow[]> {
  return rows<ChartTemplateAccountRow>(
    db,
    sql`SELECT id, number, name, nature, normal_balance, tracks_open_items, tax_relevant,
               is_allowance, parent_number, specializes_directive_code
        FROM chart_template_account
        WHERE template_id = ${templateId}::uuid
        ORDER BY length(replace(number, '.', '')), number`,
  )
}
