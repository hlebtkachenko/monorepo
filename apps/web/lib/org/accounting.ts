import "server-only"

import { getTranslations } from "next-intl/server"

import { withOrganization, withOrgReadonly } from "@workspace/db"
import type { OrganizationBoundDb } from "@workspace/db"
import {
  createAccount,
  createChart,
  findChartId,
  listAccounts,
  listChartTemplateAccounts,
  listChartTemplates,
  listDirectiveYear,
  resolveFrameworkYear,
  seedChartFromDirectives,
  seedChartFromTemplate,
  type ChartAccountRow,
  type ChartTemplateAccountRow,
  type ChartTemplateRow,
  type DirectiveYearRow,
} from "@workspace/accounting"

/**
 * Chart-of-accounts app-edge for the rebuilt org tree.
 *
 * Owned by the new tree (`apps/web/lib/org/`) — imports only `@workspace/*`, never the frozen
 * old tree. Reads run under `withOrgReadonly` (org FORCE-RLS + READ ONLY); writes under
 * `withOrganization`. Snake_case domain rows are camelCased into view models the UI consumes,
 * and each account view carries the DERIVED presentation columns (statement class + account
 * type) so the UI never re-derives them. All display strings are i18n keys — this layer holds
 * no user-facing text. The SELECTs + seeds live once in `@workspace/accounting`; this is only
 * the tenancy wrapper + presentation shape + the button action seam (no rendering here).
 */

// ─────────────────────────── derived presentation dimensions ───────────────────────────

/**
 * Which financial statement an account belongs to. Derived from `nature`; the UI localizes the
 * value via i18n (`accounting.chartOfAccounts.statementClass.<VALUE>`).
 */
export type StatementClass =
  | "BALANCE_SHEET" // ASSET / LIABILITY / EQUITY
  | "INCOME_STATEMENT" // EXPENSE / REVENUE
  | "CLOSING" // 701 / 702 / 710
  | "OFF_BALANCE" // 75x

/**
 * The account-type dimension (asset-side / liability-side / cost / revenue). Derived from
 * `nature`; null for closing/off-balance accounts. The UI localizes it via i18n
 * (`accounting.chartOfAccounts.accountType.<VALUE>`).
 */
export type AccountType = "ACTIVE" | "PASSIVE" | "EXPENSE" | "REVENUE" | null

/** Derive the statement class from the stored account nature. */
export function statementClass(
  nature: ChartAccountRow["nature"],
): StatementClass {
  switch (nature) {
    case "ASSET":
    case "LIABILITY":
    case "EQUITY":
      return "BALANCE_SHEET"
    case "EXPENSE":
    case "REVENUE":
      return "INCOME_STATEMENT"
    case "CLOSING":
      return "CLOSING"
    case "OFF_BALANCE":
      return "OFF_BALANCE"
  }
}

/** Derive the account type from the stored account nature. */
export function accountType(nature: ChartAccountRow["nature"]): AccountType {
  switch (nature) {
    case "ASSET":
      return "ACTIVE"
    case "LIABILITY":
    case "EQUITY":
      return "PASSIVE"
    case "EXPENSE":
      return "EXPENSE"
    case "REVENUE":
      return "REVENUE"
    default:
      return null
  }
}

// ─────────────────────────────────── view models ───────────────────────────────────

/** @public — app-edge seam the chart-of-accounts UI wires to (UI lands in a follow-up). One row of the chart-of-accounts table as the UI consumes it. */
export interface ChartAccountView {
  id: string
  /** '31' | '311' | '311.001' */
  number: string
  name: string
  nature: ChartAccountRow["nature"]
  /** derived — which statement (balance sheet / income statement / closing / off-balance). */
  statementClass: StatementClass
  /** derived — active / passive / expense / revenue. */
  accountType: AccountType
  /** DEBIT | CREDIT | null (sign-flip accounts 431 / 481 / FX). */
  normalBalance: ChartAccountRow["normal_balance"]
  /** open-items tracking (saldokonto) — one of the two editable flags. */
  tracksOpenItems: boolean
  /** tax relevance (Daňový) — the other editable flag; null for balance/closing accounts. */
  taxRelevant: boolean | null
  parentId: string | null
  class: number
  groupCode: string | null
  syntheticCode: string
  isSynthetic: boolean
  specializesDirectiveCode: string | null
}

function toChartAccountView(r: ChartAccountRow): ChartAccountView {
  return {
    id: r.id,
    number: r.number,
    name: r.name,
    nature: r.nature,
    statementClass: statementClass(r.nature),
    accountType: accountType(r.nature),
    normalBalance: r.normal_balance,
    tracksOpenItems: r.tracks_open_items,
    taxRelevant: r.tax_relevant,
    parentId: r.parent_id,
    class: r.class,
    groupCode: r.group_code,
    syntheticCode: r.synthetic_code,
    isSynthetic: r.is_synthetic,
    specializesDirectiveCode: r.specializes_directive_code,
  }
}

/** @public — app-edge seam the framework (Účetní osnova) subpage wires to (UI lands in a follow-up). One row of the year-based framework chart as the read-only subpage consumes it. */
export interface FrameworkAccountView {
  year: number
  code: string
  /** localized via i18n (`accounting.chartOfAccounts.osnovaNames.<code>`) for the active locale. */
  name: string
  nature: DirectiveYearRow["nature"]
  statementClass: StatementClass
  accountType: AccountType
  normalBalance: DirectiveYearRow["normal_balance"]
  tracksOpenItems: boolean
  taxRelevant: boolean | null
  balanceSheetLine: string | null
  incomeStatementLine: string | null
}

function toFrameworkView(
  r: DirectiveYearRow,
  name: string,
): FrameworkAccountView {
  return {
    year: r.year,
    code: r.code,
    name,
    nature: r.nature,
    statementClass: statementClass(r.nature),
    accountType: accountType(r.nature),
    normalBalance: r.normal_balance,
    tracksOpenItems: r.tracks_open_items,
    taxRelevant: r.tax_relevant,
    balanceSheetLine: r.balance_sheet_line,
    incomeStatementLine: r.income_statement_line,
  }
}

/** @public — app-edge seam the template picker wires to (UI lands in a follow-up). A prebuilt chart-of-accounts template (a picker option). */
export interface ChartTemplateView {
  id: string
  year: number
  code: string
  name: string
  isDefault: boolean
}

function toTemplateView(r: ChartTemplateRow): ChartTemplateView {
  return {
    id: r.id,
    year: r.year,
    code: r.code,
    name: r.name,
    isDefault: r.is_default,
  }
}

/** @public — app-edge seam the template preview wires to (UI lands in a follow-up). One account inside a prebuilt template (preview before forking). */
export interface ChartTemplateAccountView {
  number: string
  name: string
  nature: ChartTemplateAccountRow["nature"]
  statementClass: StatementClass
  accountType: AccountType
  tracksOpenItems: boolean
  taxRelevant: boolean | null
  isAllowance: boolean
}

function toTemplateAccountView(
  r: ChartTemplateAccountRow,
  name: string,
): ChartTemplateAccountView {
  return {
    number: r.number,
    name,
    nature: r.nature,
    statementClass: statementClass(r.nature),
    accountType: accountType(r.nature),
    tracksOpenItems: r.tracks_open_items,
    taxRelevant: r.tax_relevant,
    isAllowance: r.is_allowance,
  }
}

// ─────────────────────────────────── reads (table data) ───────────────────────────────────

/**
 * @public — table-data read the chart-of-accounts page wires to (UI lands in a follow-up).
 *
 * The period's chart of accounts, sorted by account number. `periodId` is the active period the
 * page resolved via `getActivePeriod`; a period with no chart yet (a fresh org) returns [] and
 * the page offers the "start from framework / template" buttons.
 */
export async function getChartAccounts(
  organizationId: string,
  userId: string,
  periodId: string,
): Promise<ChartAccountView[]> {
  const rows = await withOrgReadonly(organizationId, userId, (db) =>
    listAccounts(db, { periodId }),
  )
  return rows.map(toChartAccountView)
}

/** @public — read the framework subpage wires to (UI lands in a follow-up). The read-only framework chart (Účetní osnova) for a year — the subpage + the "fill from framework" source. */
export async function getFramework(
  organizationId: string,
  userId: string,
  year: number,
): Promise<FrameworkAccountView[]> {
  const [rows, t] = await Promise.all([
    withOrgReadonly(organizationId, userId, (db) =>
      listDirectiveYear(db, year),
    ),
    getTranslations("accounting.chartOfAccounts.osnovaNames"),
  ])
  return rows.map((r) => {
    const key = r.code as Parameters<typeof t>[0]
    return toFrameworkView(r, t.has(key) ? t(key) : r.name_cs)
  })
}

/** @public — read the template picker wires to (UI lands in a follow-up). The prebuilt chart templates offered for a year (the picker). */
export async function getChartTemplates(
  organizationId: string,
  userId: string,
  year: number,
): Promise<ChartTemplateView[]> {
  const rows = await withOrgReadonly(organizationId, userId, (db) =>
    listChartTemplates(db, year),
  )
  return rows.map(toTemplateView)
}

/** @public — read the template preview wires to (UI lands in a follow-up). The accounts of one prebuilt template (preview before forking). */
export async function getChartTemplateAccounts(
  organizationId: string,
  userId: string,
  templateId: string,
): Promise<ChartTemplateAccountView[]> {
  const [rows, t] = await Promise.all([
    withOrgReadonly(organizationId, userId, (db) =>
      listChartTemplateAccounts(db, templateId),
    ),
    getTranslations("accounting.chartOfAccounts.templateNames"),
  ])
  return rows.map((r) => {
    const key = r.number as Parameters<typeof t>[0]
    return toTemplateAccountView(r, t.has(key) ? t(key) : r.name)
  })
}

// ─────────────────────────── column descriptors (how the table renders) ───────────────────────────

/**
 * How a chart-of-accounts column renders. The UI table maps `key` → cell + `kind` → widget and
 * resolves `labelKey` through i18n (English + Czech messages live in `packages/i18n`). No literal
 * header text lives here — everything user-facing is a message key.
 */
export interface ChartAccountColumn {
  key:
    | "number"
    | "name"
    | "statementClass"
    | "accountType"
    | "normalBalance"
    | "tracksOpenItems"
    | "taxRelevant"
  /** i18n message key the header resolves. */
  labelKey: string
  kind: "code" | "text" | "enum" | "boolean"
  align: "start" | "end"
  /** true = the value is GENERATED / derived, read-only in an editor. */
  derived: boolean
  /** true = editable on the account (only name / open-items / tax-relevant are). */
  editable: boolean
}

/**
 * The column set for the chart-of-accounts table (order = display order). The UI wires each cell
 * to `ChartAccountView[key]`; enum cells (`statementClass` / `accountType` / `normalBalance`)
 * localize the code, boolean cells (`tracksOpenItems` / `taxRelevant`) render a checkbox/badge.
 * Only `name`, `tracksOpenItems` and `taxRelevant` are editable — everything else is GENERATED or
 * derived. Bilingual header + value labels are catalogued in `.context/ui-column-names.md`.
 */
export const CHART_ACCOUNT_COLUMNS: readonly ChartAccountColumn[] = [
  {
    key: "number",
    labelKey: "accounting.chartOfAccounts.columns.number",
    kind: "code",
    align: "start",
    derived: false,
    editable: false,
  },
  {
    key: "name",
    labelKey: "accounting.chartOfAccounts.columns.name",
    kind: "text",
    align: "start",
    derived: false,
    editable: true,
  },
  {
    key: "statementClass",
    labelKey: "accounting.chartOfAccounts.columns.statementClass",
    kind: "enum",
    align: "start",
    derived: true,
    editable: false,
  },
  {
    key: "accountType",
    labelKey: "accounting.chartOfAccounts.columns.accountType",
    kind: "enum",
    align: "start",
    derived: true,
    editable: false,
  },
  {
    key: "normalBalance",
    labelKey: "accounting.chartOfAccounts.columns.normalBalance",
    kind: "enum",
    align: "start",
    derived: true,
    editable: false,
  },
  {
    key: "tracksOpenItems",
    labelKey: "accounting.chartOfAccounts.columns.tracksOpenItems",
    kind: "boolean",
    align: "end",
    derived: false,
    editable: true,
  },
  {
    key: "taxRelevant",
    labelKey: "accounting.chartOfAccounts.columns.taxRelevant",
    kind: "boolean",
    align: "end",
    derived: false,
    editable: true,
  },
] as const

// ─────────────────────────── actions (button seam — no UI here) ───────────────────────────

/**
 * @public — button-action seam the chart-of-accounts UI wires to (UI lands in a follow-up).
 *
 * Start a period's chart from the framework chart (the "fill from framework" button). Resolves
 * the framework year effective for `year` (falls back to the latest published prior year),
 * creates the chart if the period has none, then seeds. Throws if the chart already has accounts
 * (never double-seeds). Returns the number of accounts seeded.
 */
export async function startChartFromFramework(
  organizationId: string,
  workspaceId: string,
  userId: string,
  periodId: string,
  year: number,
): Promise<number> {
  return withOrganization(organizationId, userId, async (db) => {
    const chartId = await ensureEmptyChart(db, {
      organizationId,
      workspaceId,
      periodId,
    })
    const frameworkYear = (await resolveFrameworkYear(db, year)) ?? year
    return seedChartFromDirectives(
      db,
      { organizationId, workspaceId },
      { chartId, periodId, year: frameworkYear },
    )
  })
}

/**
 * @public — button-action seam the chart-of-accounts UI wires to (UI lands in a follow-up).
 *
 * Start a period's chart by forking a prebuilt template (the "use template" button). Same
 * empty-chart guard as {@link startChartFromFramework}. Returns the number of accounts seeded.
 */
export async function startChartFromTemplate(
  organizationId: string,
  workspaceId: string,
  userId: string,
  periodId: string,
  templateId: string,
): Promise<number> {
  return withOrganization(organizationId, userId, async (db) => {
    const chartId = await ensureEmptyChart(db, {
      organizationId,
      workspaceId,
      periodId,
    })
    return seedChartFromTemplate(
      db,
      { organizationId, workspaceId },
      { chartId, periodId, templateId },
    )
  })
}

/**
 * @public — button-action seam the chart-of-accounts UI wires to (UI lands in a follow-up).
 *
 * Add one account to the period's chart (the "add account" button). The chart must already exist
 * (start it from a framework/template first). `nature` drives the derived statement class + type;
 * the caller passes the open-items / tax-relevant flags.
 */
export async function addChartAccount(
  organizationId: string,
  workspaceId: string,
  userId: string,
  input: {
    periodId: string
    number: string
    name: string
    nature: ChartAccountRow["nature"]
    normalBalance?: ChartAccountRow["normal_balance"]
    tracksOpenItems?: boolean
    taxRelevant?: boolean | null
    parentId?: string | null
    specializesDirectiveCode?: string | null
  },
): Promise<string> {
  return withOrganization(organizationId, userId, async (db) => {
    const chartId = await requireChartId(db, input.periodId)
    return createAccount(
      db,
      { organizationId, workspaceId },
      { chartId, ...input },
    )
  })
}

// ─────────────────────────────────── internal ───────────────────────────────────

async function ensureEmptyChart(
  db: OrganizationBoundDb,
  ctx: { organizationId: string; workspaceId: string; periodId: string },
): Promise<string> {
  const chartId = await findChartId(db, ctx.periodId)
  if (chartId) {
    const existing = await listAccounts(db, { periodId: ctx.periodId })
    if (existing.length > 0) {
      throw new Error(
        "accounting: the period's chart of accounts is not empty — cannot re-seed it",
      )
    }
    return chartId // chart exists but empty — seed into it
  }
  return createChart(
    db,
    { organizationId: ctx.organizationId, workspaceId: ctx.workspaceId },
    { periodId: ctx.periodId },
  )
}

async function requireChartId(
  db: OrganizationBoundDb,
  periodId: string,
): Promise<string> {
  const chartId = await findChartId(db, periodId)
  if (!chartId) {
    throw new Error(
      "accounting: the period has no chart of accounts yet — start it from a framework or template first",
    )
  }
  return chartId
}
