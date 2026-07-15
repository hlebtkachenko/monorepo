/**
 * Master-data setup for the v2 schema: accounting period, number series, chart
 * of accounts, accounts, the workspace-shared counterparty, peněžní-deník
 * categories, and the supporting register stubs (asset / depreciation plan /
 * inventory count). Thin inserts used by seeding and tests. All run through an
 * organization-bound transaction (RLS applies); the org IS the účetní jednotka
 * (no separate unit table in v2).
 */

import { sql } from "drizzle-orm"
import { one, rows } from "./sql"
import type { RowExecutor } from "./sql"
import { allocateNumber } from "./number-series"
import { DEFAULT_NUMBER_SERIES } from "./number-series-defaults"
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
  VatFilingPeriod,
  VatRegime,
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

/**
 * Register a VAT status range (§6/§6f/§97 ZDPH). One open row per org
 * (valid_to = null); the vat_status_no_overlap gist EXCLUDE bars overlaps.
 * filing_period applies to PAYER only (MONTHLY default for new payers, §99/§99a).
 */
export async function createVatStatus(
  db: RowExecutor,
  ctx: OrgCtx,
  input: {
    vatRegimeCode: VatRegime
    validFrom: string
    validTo?: string | null
    filingPeriod?: VatFilingPeriod | null
  },
): Promise<string> {
  if (input.vatRegimeCode !== "PAYER" && input.filingPeriod != null) {
    throw new Error("VAT filing period is only valid for VAT payers.")
  }
  const r = await one<{ id: string }>(
    db,
    sql`INSERT INTO vat_status (organization_id, vat_regime_code, valid_from, valid_to, filing_period)
        VALUES (${ctx.organizationId}::uuid, ${input.vatRegimeCode}, ${input.validFrom}::date,
                ${input.validTo ?? null}, ${input.filingPeriod ?? null})
        RETURNING id`,
  )
  return r.id
}

/**
 * Register an organization_tax_profile range with explicit relationship and
 * remittance facts. One open row per org (valid_to = null); the
 * organization_tax_profile_no_overlap gist EXCLUDE bars overlaps. Mirrors
 * createVatStatus: insert-only — the caller (changeTaxProfile) closes any
 * currently-open row before calling this.
 */
export async function createTaxProfile(
  db: RowExecutor,
  ctx: OrgCtx,
  input: {
    hasStandardEmployment: boolean
    hasDpp: boolean
    hasDpc: boolean
    socialInsuranceParticipation: boolean
    healthInsuranceParticipation: boolean
    payrollTaxAdvanceDue: boolean
    specialRateWithholdingDue: boolean
    validFrom: string
    validTo?: string | null
  },
): Promise<string> {
  const r = await one<{ id: string }>(
    db,
    sql`INSERT INTO organization_tax_profile
          (organization_id, has_employees, has_standard_employment, has_dpp, has_dpc,
           social_insurance_participation, health_insurance_participation,
           payroll_tax_advance_due, special_rate_withholding_due, valid_from, valid_to)
        VALUES (${ctx.organizationId}::uuid,
                ${input.hasStandardEmployment || input.hasDpp || input.hasDpc},
                ${input.hasStandardEmployment}, ${input.hasDpp}, ${input.hasDpc},
                ${input.socialInsuranceParticipation}, ${input.healthInsuranceParticipation},
                ${input.payrollTaxAdvanceDue}, ${input.specialRateWithholdingDue},
                ${input.validFrom}::date, ${input.validTo ?? null})
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

/**
 * Default číselné řady aligned to the capture layer's document kinds. Canonical
 * home for the scaffolding protocol (`scaffoldOrganization`) AND the Settings →
 * Number series "restore default series" backfill — both call sites must agree
 * on the same 8 series, so this list lives here rather than being duplicated.
 */
/**
 * Idempotently insert every default series missing for the org. Gapless
 * numbering is legally sensitive: this NEVER touches an existing row (no
 * `next_number` reset, no pattern change) — it only adds series the org does
 * not have yet. One INSERT…VALUES with `ON CONFLICT DO NOTHING` against the
 * `number_series_org_entity_code_unique` constraint; returns the count
 * actually inserted.
 */
export async function backfillDefaultNumberSeries(
  db: RowExecutor,
  ctx: OrgCtx,
): Promise<number> {
  const inserted = await rows<{ id: string }>(
    db,
    sql`INSERT INTO number_series (organization_id, entity_type, code, pattern, next_number)
        VALUES ${sql.join(
          DEFAULT_NUMBER_SERIES.map(
            (s) =>
              sql`(${ctx.organizationId}::uuid, ${s.entityType}, ${s.code}, ${s.pattern}, 1)`,
          ),
          sql`, `,
        )}
        ON CONFLICT (organization_id, entity_type, code) DO NOTHING
        RETURNING id`,
  )
  return inserted.length
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
 * The classic saldokonto (open-items) synthetics — receivables/payables and the
 * settlement accounts that MUST pair per counterparty (§16 + KH matching). These
 * ship with tracks_open_items = true so the open-items/saldokonto engine and KH
 * pairing are live on a freshly-scaffolded entity (advisor change 8).
 */
export const DEFAULT_OPEN_ITEM_ACCOUNTS: readonly string[] = [
  "311", // Odběratelé
  "314", // Poskytnuté zálohy
  "315", // Ostatní pohledávky
  "321", // Dodavatelé
  "324", // Přijaté provozní zálohy
  "325", // Ostatní závazky
  "335", // Pohledávky za zaměstnanci
  "355", // Ostatní pohledávky za společníky
  "361", // Závazky ovládaná/ovládající
  "365", // Ostatní závazky ke společníkům
  "371", // Pohledávky z prodeje obchodního závodu
  "379", // Jiné závazky
  "343", // DPH
] as const

/**
 * Materialize the směrná účtová osnova (Vyhláška 500/2002 Příloha 1) into a
 * chart as synthetic účty — one INSERT…SELECT over directive_account, NOT 218
 * round-trips. nature/normal_balance are stored on the directive; the account's
 * class/group/synthetic/is_synthetic are GENERATED from number. tracks_open_items
 * is preset for the saldokonto set. specializes_directive_code back-links each
 * account to its 3-digit catalogue row. Returns the count seeded.
 *
 * FOR-PROFIT double-entry ONLY. Spolek/nadace book under Vyhláška 504/2002 (a
 * different osnova, not seeded) — the orchestrator hard-errors before reaching
 * here; this function does not guard legal form.
 */
export async function seedChartFromDirectives(
  db: RowExecutor,
  ctx: OrgCtx,
  input: {
    chartId: string
    periodId: string
    openItemAccounts?: readonly string[]
  },
): Promise<number> {
  const openItems = input.openItemAccounts ?? DEFAULT_OPEN_ITEM_ACCOUNTS
  const seeded = await rows<{ id: string }>(
    db,
    sql`INSERT INTO account
          (organization_id, chart_id, period_id, number, name, nature, normal_balance,
           tracks_open_items, specializes_directive_code)
        SELECT ${ctx.organizationId}::uuid, ${input.chartId}::uuid, ${input.periodId}::uuid,
               da.code, COALESCE(da.name_cs, da.name_en), da.nature, da.normal_balance,
               (da.code = ANY(${sql`ARRAY[${sql.join(
                 openItems.map((c) => sql`${c}`),
                 sql`, `,
               )}]::char(3)[]`})),
               da.code
        FROM directive_account da
        WHERE da.deprecated = false
        RETURNING id`,
  )
  return seeded.length
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
  // Find-or-create: a counterparty is one workspace-shared row per DIČ (the
  // (workspace_id, tax_id) dedup index, migration 0058), perennial across periods.
  // ON CONFLICT DO NOTHING + re-select so re-declaring the same partner (self-org
  // rows excluded from the index) returns the existing row instead of erroring.
  const inserted = await rows<{ id: string }>(
    db,
    sql`INSERT INTO counterparty (workspace_id, self_of_organization_id, name, tax_id, country_code)
        VALUES (${ctx.workspaceId}::uuid, ${input.selfOfOrganizationId ?? null},
                ${input.name ?? null}, ${input.taxId ?? null}, ${input.countryCode ?? null})
        ON CONFLICT DO NOTHING
        RETURNING id`,
  )
  if (inserted[0]) return inserted[0].id
  // Re-select the row that won the conflict. A self-org row conflicts on the
  // self_of_organization_id UNIQUE (not tax_id), so key the re-select off the
  // actual conflict target; a non-self row conflicts on the (workspace_id, tax_id)
  // partial unique index.
  const existing = await one<{ id: string }>(
    db,
    input.selfOfOrganizationId != null
      ? sql`SELECT id FROM counterparty
             WHERE self_of_organization_id = ${input.selfOfOrganizationId}::uuid
             LIMIT 1`
      : sql`SELECT id FROM counterparty
             WHERE workspace_id = ${ctx.workspaceId}::uuid
               AND self_of_organization_id IS NULL
               AND tax_id = ${input.taxId ?? null}
             LIMIT 1`,
  )
  return existing.id
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

/** Input to {@link createAsset} — a fixed-asset register card (karta majetku). */
export interface AssetInput {
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
}

/** Create a fixed-asset register card. Allocates a gapless inventární číslo (Označení). */
export async function createAsset(
  db: RowExecutor,
  ctx: OrgCtx,
  input: AssetInput,
): Promise<{ id: string; designation: string; sequenceNumber: number }> {
  const allocated = await allocateNumber(
    db,
    input.seriesId,
    input.commissioningDate,
    "ASSET",
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

/** Input to {@link createDepreciationPlan} — an účetní odpisový plán. */
export interface DepreciationPlanInput {
  assetId: string
  method: DepreciationMethod
  startDate: string
  monthlyAmount: Decimal
  expenseAccountNumber: string
  accumulatedAccountNumber: string
  usefulLifeMonths?: number | null
  residualValue?: Decimal
  supersedesPlanId?: string | null
}

/** Create an účetní odpisový plán (drives MD 551 / D 08x monthly). Accounts BY NUMBER (D8). */
export async function createDepreciationPlan(
  db: RowExecutor,
  ctx: OrgCtx,
  input: DepreciationPlanInput,
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

/** Input to {@link createInventoryCount} — an inventurní soupis (§29-30). */
export interface InventoryCountInput {
  seriesId: string
  countDate: string
  description?: string | null
}

/** Create an inventurní soupis (§29-30). Allocates a gapless soupis č. (Označení). */
export async function createInventoryCount(
  db: RowExecutor,
  ctx: OrgCtx,
  input: InventoryCountInput,
): Promise<{ id: string; designation: string; sequenceNumber: number }> {
  const allocated = await allocateNumber(
    db,
    input.seriesId,
    input.countDate,
    "INVENTORY_COUNT",
  )
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
