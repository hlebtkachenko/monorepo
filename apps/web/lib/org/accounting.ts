import "server-only"

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
  resolveOsnovaYear,
  seedChartFromDirectives,
  seedChartFromTemplate,
  type ChartAccountRow,
  type ChartTemplateAccountRow,
  type ChartTemplateRow,
  type DirectiveYearRow,
} from "@workspace/accounting"

/**
 * Chart of accounts (Účtový rozvrh) app-edge for the rebuilt org tree.
 *
 * Owned by the new tree (`apps/web/lib/org/`) — imports only `@workspace/*`, never the frozen
 * old tree. Reads run under `withOrgReadonly` (org FORCE-RLS + READ ONLY); writes under
 * `withOrganization`. Snake_case domain rows are camelCased into view models the UI consumes,
 * and each account view carries the DERIVED presentation columns the reference platforms show
 * (druh / typ) so the UI never re-derives them. The SELECTs + seeds live once in
 * `@workspace/accounting`; this is only the tenancy wrapper + presentation shape + the button
 * action seam (the UI table wires to these — no rendering here).
 */

// ─────────────────────────── derived presentation dimensions ───────────────────────────

/** Druh účtu — the statement class every Czech platform shows (Rozvahový / Výsledkový / …). */
export type AccountDruh =
  | "ROZVAHOVY" // balance sheet (ASSET / LIABILITY / EQUITY)
  | "VYSLEDKOVY" // P&L (EXPENSE / REVENUE)
  | "ZAVERKOVY" // closing (701/702/710)
  | "PODROZVAHOVY" // off-balance (75x)

/** Typ účtu — Aktivní / Pasivní / Nákladový / Výnosový (null for closing/off-balance). */
export type AccountTyp = "AKTIVNI" | "PASIVNI" | "NAKLADOVY" | "VYNOSOVY" | null

/** Derive Druh from the stored account nature. */
export function accountDruh(nature: ChartAccountRow["nature"]): AccountDruh {
  switch (nature) {
    case "ASSET":
    case "LIABILITY":
    case "EQUITY":
      return "ROZVAHOVY"
    case "EXPENSE":
    case "REVENUE":
      return "VYSLEDKOVY"
    case "CLOSING":
      return "ZAVERKOVY"
    case "OFF_BALANCE":
      return "PODROZVAHOVY"
  }
}

/** Derive Typ from the stored account nature. */
export function accountTyp(nature: ChartAccountRow["nature"]): AccountTyp {
  switch (nature) {
    case "ASSET":
      return "AKTIVNI"
    case "LIABILITY":
    case "EQUITY":
      return "PASIVNI"
    case "EXPENSE":
      return "NAKLADOVY"
    case "REVENUE":
      return "VYNOSOVY"
    default:
      return null
  }
}

// ─────────────────────────────────── view models ───────────────────────────────────

/** One row of the Účtový rozvrh table as the UI consumes it. */
export interface ChartAccountView {
  id: string
  /** '31' | '311' | '311.001' */
  number: string
  name: string
  nature: ChartAccountRow["nature"]
  /** derived — balance / P&L / closing / off-balance. */
  druh: AccountDruh
  /** derived — active / passive / expense / revenue. */
  typ: AccountTyp
  /** DEBIT | CREDIT | null (sign-flip accounts 431/481/FX). */
  normalBalance: ChartAccountRow["normal_balance"]
  /** saldokonto — one of the two editable flags. */
  tracksOpenItems: boolean
  /** Daňový — the other editable flag; null for balance/closing účty. */
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
    druh: accountDruh(r.nature),
    typ: accountTyp(r.nature),
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

/** One row of the Účetní osnova (framework) as the read-only subpage consumes it. */
export interface OsnovaAccountView {
  year: number
  code: string
  name: string
  nameEn: string | null
  nature: DirectiveYearRow["nature"]
  druh: AccountDruh
  typ: AccountTyp
  normalBalance: DirectiveYearRow["normal_balance"]
  tracksOpenItems: boolean
  taxRelevant: boolean | null
  balanceSheetLine: string | null
  incomeStatementLine: string | null
}

function toOsnovaView(r: DirectiveYearRow): OsnovaAccountView {
  return {
    year: r.year,
    code: r.code,
    name: r.name_cs,
    nameEn: r.name_en,
    nature: r.nature,
    druh: accountDruh(r.nature),
    typ: accountTyp(r.nature),
    normalBalance: r.normal_balance,
    tracksOpenItems: r.tracks_open_items,
    taxRelevant: r.tax_relevant,
    balanceSheetLine: r.balance_sheet_line,
    incomeStatementLine: r.income_statement_line,
  }
}

/** A prebuilt house rozvrh template (the picker option). */
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

/** One account inside a prebuilt template (preview before forking). */
export interface ChartTemplateAccountView {
  number: string
  name: string
  nature: ChartTemplateAccountRow["nature"]
  druh: AccountDruh
  typ: AccountTyp
  tracksOpenItems: boolean
  taxRelevant: boolean | null
  isAllowance: boolean
}

function toTemplateAccountView(
  r: ChartTemplateAccountRow,
): ChartTemplateAccountView {
  return {
    number: r.number,
    name: r.name,
    nature: r.nature,
    druh: accountDruh(r.nature),
    typ: accountTyp(r.nature),
    tracksOpenItems: r.tracks_open_items,
    taxRelevant: r.tax_relevant,
    isAllowance: r.is_allowance,
  }
}

// ─────────────────────────────────── reads (table data) ───────────────────────────────────

/**
 * The period's Účtový rozvrh, sorted by číslo účtu. `periodId` is the active period the page
 * resolved via `getActivePeriod`; a period with no chart yet (a fresh org) returns []
 * and the page offers the "start from osnova / template" buttons.
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

/** The read-only Účetní osnova (framework) for a year — the subpage + the "fill from osnova" source. */
export async function getOsnova(
  organizationId: string,
  userId: string,
  year: number,
): Promise<OsnovaAccountView[]> {
  const rows = await withOrgReadonly(organizationId, userId, (db) =>
    listDirectiveYear(db, year),
  )
  return rows.map(toOsnovaView)
}

/** The prebuilt house rozvrh templates offered for a year (the picker). */
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

/** The účty of one prebuilt template (preview before forking). */
export async function getChartTemplateAccounts(
  organizationId: string,
  userId: string,
  templateId: string,
): Promise<ChartTemplateAccountView[]> {
  const rows = await withOrgReadonly(organizationId, userId, (db) =>
    listChartTemplateAccounts(db, templateId),
  )
  return rows.map(toTemplateAccountView)
}

// ─────────────────────────── column descriptors (how the table renders) ───────────────────────────

/** How a chart-of-accounts column renders. The UI table maps `key` → cell + `kind` → widget. */
export interface ChartAccountColumn {
  key:
    | "number"
    | "name"
    | "druh"
    | "typ"
    | "normalBalance"
    | "tracksOpenItems"
    | "taxRelevant"
  /** i18n message key the header resolves (cs/en live in packages/i18n). */
  headerKey: string
  /** literal cs/en fallback headers (until the i18n keys land). */
  header: { cs: string; en: string }
  kind: "code" | "text" | "enum" | "boolean"
  align: "start" | "end"
  /** true = the value is GENERATED / derived, read-only in an editor. */
  derived: boolean
  /** true = editable on the account (only name / saldo / daňový are). */
  editable: boolean
}

/**
 * The column set for the Účtový rozvrh table (order = display order). The UI wires each cell to
 * `ChartAccountView[key]`; enum cells (`druh` / `typ` / `normalBalance`) localize the code, boolean
 * cells (`tracksOpenItems` / `taxRelevant`) render a checkbox/badge. Only `name`, `tracksOpenItems`
 * and `taxRelevant` are editable — everything else is GENERATED or derived.
 */
export const CHART_ACCOUNT_COLUMNS: readonly ChartAccountColumn[] = [
  {
    key: "number",
    headerKey: "accounting.chart.col.number",
    header: { cs: "Účet", en: "Account" },
    kind: "code",
    align: "start",
    derived: false,
    editable: false,
  },
  {
    key: "name",
    headerKey: "accounting.chart.col.name",
    header: { cs: "Název", en: "Name" },
    kind: "text",
    align: "start",
    derived: false,
    editable: true,
  },
  {
    key: "druh",
    headerKey: "accounting.chart.col.druh",
    header: { cs: "Druh", en: "Kind" },
    kind: "enum",
    align: "start",
    derived: true,
    editable: false,
  },
  {
    key: "typ",
    headerKey: "accounting.chart.col.typ",
    header: { cs: "Typ", en: "Type" },
    kind: "enum",
    align: "start",
    derived: true,
    editable: false,
  },
  {
    key: "normalBalance",
    headerKey: "accounting.chart.col.normalBalance",
    header: { cs: "Strana", en: "Side" },
    kind: "enum",
    align: "start",
    derived: true,
    editable: false,
  },
  {
    key: "tracksOpenItems",
    headerKey: "accounting.chart.col.saldo",
    header: { cs: "Saldo", en: "Open items" },
    kind: "boolean",
    align: "end",
    derived: false,
    editable: true,
  },
  {
    key: "taxRelevant",
    headerKey: "accounting.chart.col.danovy",
    header: { cs: "Daňový", en: "Tax-relevant" },
    kind: "boolean",
    align: "end",
    derived: false,
    editable: true,
  },
] as const

// ─────────────────────────── actions (button seam — no UI here) ───────────────────────────

/**
 * Start a period's chart from the Účetní osnova (the "Naplnit z osnovy" button, #3). Resolves the
 * osnova year effective for `year` (falls back to the latest published prior year), creates the
 * chart if the period has none, then seeds. Throws if the chart already has účty (never
 * double-seeds). Returns the number of účty seeded.
 */
export async function startChartFromOsnova(
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
    const osnovaYear = (await resolveOsnovaYear(db, year)) ?? year
    return seedChartFromDirectives(
      db,
      { organizationId, workspaceId },
      { chartId, periodId, year: osnovaYear },
    )
  })
}

/**
 * Start a period's chart by forking a prebuilt house rozvrh template (the "Použít předlohu"
 * button, #4). Same empty-chart guard as {@link startChartFromOsnova}. Returns účty seeded.
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
 * Add one účet to the period's chart (the "Přidat účet" button). The chart must already exist
 * (start it from an osnova/template first). `nature` drives druh/typ; the caller passes the
 * saldo/daňový flags.
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
      "accounting: the period has no chart of accounts yet — start it from an osnova or template first",
    )
  }
  return chartId
}
