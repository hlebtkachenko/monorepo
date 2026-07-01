/**
 * Master-data setup for the v2 schema: accounting period, number series, chart
 * of accounts, accounts, the workspace-shared counterparty, peněžní-deník
 * categories, and the supporting register stubs (asset / depreciation plan /
 * inventory count). Thin inserts used by seeding and tests. All run through an
 * organization-bound transaction (RLS applies); the org IS the účetní jednotka
 * (no separate unit table in v2).
 */

import { sql } from "drizzle-orm"
import { one } from "./sql"
import type { RowExecutor } from "./sql"
import { allocateNumber } from "./number-series"
import type {
  AccountNature,
  AssetCategory,
  CategoryType,
  Decimal,
  DebitCredit,
  DepreciationMethod,
  FxRateKind,
  OrgCtx,
  PeriodStatus,
  Regime,
  SignatureRole,
} from "./types"

export async function createPeriod(
  db: RowExecutor,
  ctx: OrgCtx,
  input: {
    periodStart: string
    periodEnd: string
    regimeCode: Regime
    accountingCurrency: string
    status?: PeriodStatus
    accountingSizeCode?: string | null
    fxRatePolicy?: FxRateKind | null
  },
): Promise<string> {
  const r = await one<{ id: string }>(
    db,
    sql`INSERT INTO accounting_period
          (organization_id, period_start, period_end, status, regime_code, accounting_size_code, accounting_currency, fx_rate_policy)
        VALUES
          (${ctx.organizationId}::uuid, ${input.periodStart}::date, ${input.periodEnd}::date,
           ${input.status ?? "OPEN"}, ${input.regimeCode}, ${input.accountingSizeCode ?? null},
           ${input.accountingCurrency}, ${input.fxRatePolicy ?? null})
        RETURNING id`,
  )
  return r.id
}

export async function createNumberSeries(
  db: RowExecutor,
  ctx: OrgCtx,
  input: {
    entityType: "EVENT" | "DOCUMENT" | "ASSET" | "INVENTORY_COUNT"
    code: string
    pattern: string
    nextNumber?: number
  },
): Promise<string> {
  const r = await one<{ id: string }>(
    db,
    sql`INSERT INTO number_series (organization_id, entity_type, code, pattern, next_number)
        VALUES (${ctx.organizationId}::uuid, ${input.entityType}, ${input.code}, ${input.pattern}, ${input.nextNumber ?? 1})
        RETURNING id`,
  )
  return r.id
}

/** One účtový rozvrh per účetní období (§14/3). regime_code is GENERATED 'DOUBLE_ENTRY'. */
export async function createChart(
  db: RowExecutor,
  ctx: OrgCtx,
  input: { periodId: string },
): Promise<string> {
  const r = await one<{ id: string }>(
    db,
    sql`INSERT INTO chart_of_accounts (organization_id, period_id)
        VALUES (${ctx.organizationId}::uuid, ${input.periodId}::uuid)
        RETURNING id`,
  )
  return r.id
}

/**
 * Create one účet in a chart. The 4 structural levels (class / group_code /
 * synthetic_code / is_synthetic) are GENERATED from `number`. nature +
 * normal_balance are stored (not derived). tracks_open_items is the single
 * user-chosen flag (saldokonto, §16).
 */
export async function createAccount(
  db: RowExecutor,
  ctx: OrgCtx,
  input: {
    chartId: string
    periodId: string
    number: string
    name: string
    nature: AccountNature
    normalBalance?: DebitCredit | null
    parentId?: string | null
    tracksOpenItems?: boolean
    specializesDirectiveCode?: string | null
  },
): Promise<string> {
  const r = await one<{ id: string }>(
    db,
    sql`INSERT INTO account
          (organization_id, chart_id, period_id, parent_id, number, name, nature, normal_balance, tracks_open_items, specializes_directive_code)
        VALUES
          (${ctx.organizationId}::uuid, ${input.chartId}::uuid, ${input.periodId}::uuid, ${input.parentId ?? null},
           ${input.number}, ${input.name}, ${input.nature}, ${input.normalBalance ?? null},
           ${input.tracksOpenItems ?? false}, ${input.specializesDirectiveCode ?? null})
        RETURNING id`,
  )
  return r.id
}

/**
 * Create a counterparty (workspace-shared). Pass selfOfOrganizationId to mint
 * the org's own identity row. Keyed on workspace_id (the workspace-shared tier).
 */
export async function createCounterparty(
  db: RowExecutor,
  ctx: OrgCtx,
  input: {
    selfOfOrganizationId?: string | null
    /** obchodní jméno / jméno osoby (KH + SH display). */
    name?: string | null
    /** DIČ incl. country prefix, e.g. "CZ12345678" (§101d KH / §102 SH). */
    taxId?: string | null
    /** ISO 3166-1 alpha-2 member state ("CZ" domestic, "DE" EU, …). */
    countryCode?: string | null
  } = {},
): Promise<string> {
  const r = await one<{ id: string }>(
    db,
    sql`INSERT INTO counterparty (workspace_id, self_of_organization_id, name, tax_id, country_code)
        VALUES (${ctx.workspaceId}::uuid, ${input.selfOfOrganizationId ?? null},
                ${input.name ?? null}, ${input.taxId ?? null}, ${input.countryCode ?? null})
        RETURNING id`,
  )
  return r.id
}

export async function createCategory(
  db: RowExecutor,
  ctx: OrgCtx,
  input: { type: CategoryType; name: string },
): Promise<string> {
  const r = await one<{ id: string }>(
    db,
    sql`INSERT INTO category (organization_id, type, name)
        VALUES (${ctx.organizationId}::uuid, ${input.type}, ${input.name})
        RETURNING id`,
  )
  return r.id
}

/** Create a fixed-asset register card. Allocates a gapless inventární číslo (Označení). */
export async function createAsset(
  db: RowExecutor,
  ctx: OrgCtx,
  input: {
    seriesId: string
    name: string
    category: AssetCategory
    accountNumber: string
    commissioningDate: string
    acquisitionCost: Decimal
    directiveCode?: string | null
    acquisitionDate?: string | null
    location?: string | null
    responsibleUserId?: string | null
  },
): Promise<{ id: string; designation: string; sequenceNumber: number }> {
  const allocated = await allocateNumber(
    db,
    input.seriesId,
    input.commissioningDate,
  )
  const r = await one<{ id: string }>(
    db,
    sql`INSERT INTO asset
          (organization_id, number_series_id, sequence_number, designation, name, category, account_number,
           directive_code, acquisition_date, commissioning_date, acquisition_cost, location, responsible_user_id)
        VALUES
          (${ctx.organizationId}::uuid, ${input.seriesId}::uuid, ${allocated.sequenceNumber}, ${allocated.designation},
           ${input.name}, ${input.category}, ${input.accountNumber}, ${input.directiveCode ?? null},
           ${input.acquisitionDate ?? null}, ${input.commissioningDate}::date, ${input.acquisitionCost},
           ${input.location ?? null}, ${input.responsibleUserId ?? null})
        RETURNING id`,
  )
  return {
    id: r.id,
    designation: allocated.designation,
    sequenceNumber: allocated.sequenceNumber,
  }
}

/** Create an účetní odpisový plán (drives MD 551 / D 08x monthly). Accounts BY NUMBER (D8). */
export async function createDepreciationPlan(
  db: RowExecutor,
  ctx: OrgCtx,
  input: {
    assetId: string
    method: DepreciationMethod
    startDate: string
    monthlyAmount: Decimal
    expenseAccountNumber: string
    accumulatedAccountNumber: string
    usefulLifeMonths?: number | null
    residualValue?: Decimal
    supersedesPlanId?: string | null
  },
): Promise<string> {
  const r = await one<{ id: string }>(
    db,
    sql`INSERT INTO depreciation_plan
          (organization_id, asset_id, supersedes_plan_id, method, start_date, useful_life_months,
           residual_value, monthly_amount, expense_account_number, accumulated_account_number)
        VALUES
          (${ctx.organizationId}::uuid, ${input.assetId}::uuid, ${input.supersedesPlanId ?? null}, ${input.method},
           ${input.startDate}::date, ${input.usefulLifeMonths ?? null}, ${input.residualValue ?? "0"},
           ${input.monthlyAmount}, ${input.expenseAccountNumber}, ${input.accumulatedAccountNumber})
        RETURNING id`,
  )
  return r.id
}

/** Create an inventurní soupis (§29-30). Allocates a gapless soupis č. (Označení). */
export async function createInventoryCount(
  db: RowExecutor,
  ctx: OrgCtx,
  input: { seriesId: string; countDate: string; description?: string | null },
): Promise<{ id: string; designation: string; sequenceNumber: number }> {
  const allocated = await allocateNumber(db, input.seriesId, input.countDate)
  const r = await one<{ id: string }>(
    db,
    sql`INSERT INTO inventory_count (organization_id, number_series_id, sequence_number, designation, count_date, description)
        VALUES (${ctx.organizationId}::uuid, ${input.seriesId}::uuid, ${allocated.sequenceNumber}, ${allocated.designation},
                ${input.countDate}::date, ${input.description ?? null})
        RETURNING id`,
  )
  return {
    id: r.id,
    designation: allocated.designation,
    sequenceNumber: allocated.sequenceNumber,
  }
}

/** Record a podpisový záznam (§33a/4) on an event (FOR_EVENT) or a posting (FOR_POSTING). */
export async function recordSignature(
  db: RowExecutor,
  ctx: OrgCtx,
  input: {
    role: SignatureRole
    signerId: string
    signedAt: string
    eventId?: string | null
    postingId?: string | null
  },
): Promise<string> {
  const r = await one<{ id: string }>(
    db,
    sql`INSERT INTO signature (organization_id, role, signer_id, signed_at, event_id, posting_id)
        VALUES (${ctx.organizationId}::uuid, ${input.role}, ${input.signerId}::uuid, ${input.signedAt}::timestamptz,
                ${input.eventId ?? null}, ${input.postingId ?? null})
        RETURNING id`,
  )
  return r.id
}
