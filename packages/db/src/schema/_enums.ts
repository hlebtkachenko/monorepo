/**
 * Drizzle pgEnum declarations — single source of truth.
 *
 * Every enum declaration here MUST mirror the SQL exactly. If a future
 * migration adds a value via `ALTER TYPE ... ADD VALUE`, the same PR MUST
 * update this file.
 *
 * Comments point to the migration that creates each SQL enum.
 */
import { pgEnum } from "drizzle-orm/pg-core"

// Mirrors: packages/db/migrations/0004_audit.sql — CREATE TYPE actor_kind AS ENUM
export const actorKind = pgEnum("actor_kind", [
  "human",
  "ai",
  "ai_on_behalf",
  "system",
])

// Mirrors: packages/db/migrations/0005_workspace.sql — CREATE TYPE workspace_role AS ENUM
export const workspaceRole = pgEnum("workspace_role", [
  "owner",
  "admin",
  "member",
])

// Mirrors: packages/db/migrations/0005_workspace.sql — CREATE TYPE organization_role AS ENUM
export const organizationRole = pgEnum("organization_role", [
  "owner",
  "admin",
  "member",
  "agent",
  "guest",
])

// Mirrors: packages/db/migrations/0002_auth.sql — CREATE TYPE invite_status AS ENUM
export const inviteStatus = pgEnum("invite_status", [
  "pending",
  "accepted",
  "revoked",
  "expired",
])

// Mirrors: packages/db/migrations/0012_onboarding_extensions.sql — CREATE TYPE app_user_experience AS ENUM
export const appUserExperience = pgEnum("app_user_experience", [
  "new",
  "some",
  "bookkeeper",
  "accountant",
])

// Mirrors: packages/db/migrations/0012_onboarding_extensions.sql — CREATE TYPE workspace_use_case AS ENUM
export const workspaceUseCase = pgEnum("workspace_use_case", ["firm", "biz"])

// Mirrors: packages/db/migrations/0012_onboarding_extensions.sql — CREATE TYPE workspace_team_size AS ENUM
export const workspaceTeamSize = pgEnum("workspace_team_size", [
  "solo",
  "sm",
  "md",
  "lg",
  "xl",
])

// Mirrors: packages/db/migrations/0012_onboarding_extensions.sql — CREATE TYPE billing_plan AS ENUM
export const billingPlan = pgEnum("billing_plan", [
  "starter",
  "growth",
  "scale",
])

// =============================================================================
// v2 accounting enums — all created in
// packages/db/migrations/0024_accounting_enums_reference.sql (CREATE TYPE ...)
// =============================================================================

// Mirrors: 0024_accounting_enums_reference.sql — CREATE TYPE person_type AS ENUM
export const personType = pgEnum("person_type", ["NATURAL", "LEGAL"])

// Mirrors: 0024_accounting_enums_reference.sql — CREATE TYPE period_status AS ENUM
export const periodStatus = pgEnum("period_status", ["OPEN", "CLOSED"])

// Mirrors: 0024_accounting_enums_reference.sql — CREATE TYPE vat_filing_period AS ENUM
export const vatFilingPeriod = pgEnum("vat_filing_period", [
  "MONTHLY",
  "QUARTERLY",
])

// Mirrors: 0024_accounting_enums_reference.sql — CREATE TYPE book_kind AS ENUM
export const bookKind = pgEnum("book_kind", ["LEDGER", "MONETARY_JOURNAL"])

// Mirrors: 0024_accounting_enums_reference.sql — CREATE TYPE number_series_entity AS ENUM
export const numberSeriesEntity = pgEnum("number_series_entity", [
  "EVENT",
  "DOCUMENT",
  "ASSET",
  "INVENTORY_COUNT",
])

// Mirrors: 0024_accounting_enums_reference.sql — CREATE TYPE summary_record_type AS ENUM
export const summaryRecordType = pgEnum("summary_record_type", [
  "RECEIVED_INVOICE",
  "ISSUED_INVOICE",
  "BANK_STATEMENT",
  "INTERNAL",
  "CASH_DOCUMENT",
  "BATCH",
])

// Mirrors: 0024_accounting_enums_reference.sql — CREATE TYPE vat_mode AS ENUM
export const vatMode = pgEnum("vat_mode", [
  "STANDARD",
  "REVERSE_CHARGE",
  "EXEMPT",
  "OUTSIDE_VAT",
  "IMPORT",
])

// Mirrors: 0024_accounting_enums_reference.sql — CREATE TYPE fx_rate_kind AS ENUM
export const fxRateKind = pgEnum("fx_rate_kind", ["DAILY", "REAL", "FIXED"])

// Mirrors: 0024_accounting_enums_reference.sql — CREATE TYPE signature_role AS ENUM
export const signatureRole = pgEnum("signature_role", [
  "FOR_EVENT",
  "FOR_POSTING",
])

// Mirrors: 0024_accounting_enums_reference.sql — CREATE TYPE account_nature AS ENUM
export const accountNature = pgEnum("account_nature", [
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "EXPENSE",
  "REVENUE",
  "CLOSING",
  "OFF_BALANCE",
])

// Mirrors: 0024_accounting_enums_reference.sql — CREATE TYPE debit_credit AS ENUM
export const debitCredit = pgEnum("debit_credit", ["DEBIT", "CREDIT"])

// Mirrors: 0024_accounting_enums_reference.sql — CREATE TYPE posting_kind AS ENUM
export const postingKind = pgEnum("posting_kind", ["SIMPLE", "COMPOUND"])

// Mirrors: 0024_accounting_enums_reference.sql — CREATE TYPE correction_type AS ENUM
export const correctionType = pgEnum("correction_type", [
  "REVERSAL",
  "SUPPLEMENTARY",
])

// Mirrors: 0024_accounting_enums_reference.sql — CREATE TYPE monetary_location AS ENUM
export const monetaryLocation = pgEnum("monetary_location", ["CASH", "BANK"])

// Mirrors: 0024_accounting_enums_reference.sql — CREATE TYPE monetary_direction AS ENUM
export const monetaryDirection = pgEnum("monetary_direction", [
  "INFLOW",
  "OUTFLOW",
])

// Mirrors: 0024_accounting_enums_reference.sql — CREATE TYPE category_type AS ENUM
export const categoryType = pgEnum("category_type", ["INCOME", "EXPENSE"])

// Mirrors: 0024_accounting_enums_reference.sql — CREATE TYPE asset_category AS ENUM
export const assetCategory = pgEnum("asset_category", [
  "INTANGIBLE",
  "TANGIBLE_DEPRECIABLE",
  "TANGIBLE_NON_DEPRECIABLE",
])

// Mirrors: 0024_accounting_enums_reference.sql — CREATE TYPE depreciation_method AS ENUM
export const depreciationMethod = pgEnum("depreciation_method", [
  "STRAIGHT_LINE",
  "PERFORMANCE",
  "DECLINING",
])

// Mirrors: 0024_accounting_enums_reference.sql — CREATE TYPE tax_depreciation_method AS ENUM
export const taxDepreciationMethod = pgEnum("tax_depreciation_method", [
  "STRAIGHT_LINE",
  "ACCELERATED",
  "EXTRAORDINARY",
])

// Mirrors: 0024_accounting_enums_reference.sql — CREATE TYPE asset_disposal_method AS ENUM
export const assetDisposalMethod = pgEnum("asset_disposal_method", [
  "SALE",
  "LIQUIDATION",
  "THEFT",
  "NATURAL_DISASTER",
  "DONATION",
  "CONTRIBUTION",
])

// Mirrors: 0024_accounting_enums_reference.sql — CREATE TYPE depreciation_plan_status AS ENUM
export const depreciationPlanStatus = pgEnum("depreciation_plan_status", [
  "ACTIVE",
  "SUPERSEDED",
  "FULLY_DEPRECIATED",
  "DISPOSED",
])

// Mirrors: 0024_accounting_enums_reference.sql — CREATE TYPE inventory_difference AS ENUM
export const inventoryDifference = pgEnum("inventory_difference", [
  "MATCH",
  "SHORTAGE",
  "SURPLUS",
])

// Mirrors: 0024_accounting_enums_reference.sql — CREATE TYPE open_item_direction AS ENUM
export const openItemDirection = pgEnum("open_item_direction", [
  "RECEIVABLE",
  "PAYABLE",
])

// Mirrors: 0024_accounting_enums_reference.sql — CREATE TYPE period_output_type AS ENUM
export const periodOutputType = pgEnum("period_output_type", [
  "FINANCIAL_STATEMENTS",
  "OVERVIEWS",
  "PERSONAL_INCOME_TAX",
])

// =============================================================================
// Finance domain enums — created in
// packages/db/migrations/0073_financial_account.sql (CREATE TYPE ...)
// =============================================================================

// Mirrors: 0073_financial_account.sql — CREATE TYPE financial_account_kind AS ENUM
export const financialAccountKind = pgEnum("financial_account_kind", [
  "BANK",
  "CASH",
  "CASH_EQUIVALENT",
])

// Mirrors: 0073_financial_account.sql — CREATE TYPE financial_account_status AS ENUM
export const financialAccountStatus = pgEnum("financial_account_status", [
  "DRAFT",
  "ACTIVE",
  "INACTIVE",
  "CLOSED",
  "ARCHIVED",
])
