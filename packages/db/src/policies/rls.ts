/**
 * RLS policy declarations for organization-scoped tables.
 *
 * RLS is applied via handwritten migrations (0003_rls_force.sql, 0004_audit.sql).
 * This module documents the table list and exposes a helper for test harnesses
 * and pgTAP suites that need to apply the standard policy programmatically.
 *
 * If you add an organization-scoped table, add it here AND to the migration.
 *
 * Policy contract (applied to every organization-scoped table):
 *
 *   ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;
 *   ALTER TABLE <t> FORCE  ROW LEVEL SECURITY;
 *   CREATE POLICY organization_isolation ON <t>
 *     USING      (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
 *     WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
 */

/**
 * Names of organization-scoped tables in the current schema.
 * Kept in sync with migrations that declare `organization_isolation` policy:
 *   - 0003_rls_force.sql  — organization
 *   - 0004_audit.sql      — tool_call_log
 *   - 0015_api_key.sql    — api_key
 *   - 0034_accounting_enforcement.sql — the v2 accounting `org_scoped` array
 *     (section 1: FORCE RLS + organization_isolation on every org-scoped
 *     accounting table). The list below mirrors that array verbatim.
 *
 * If you add an organization-scoped table, add it here AND to a migration
 * that creates the `organization_isolation` policy with the NULLIF guard.
 *
 * Note: auth_invite (dropped in 0020) was previously in this list.
 * auth_token is global, not organization-scoped — it carries
 * organization context in `payload` for `inv` rows only.
 *
 * Deliberately EXCLUDED from this FORCE-RLS set (see 0034_accounting_enforcement.sql):
 *   - counterparty — WORKSPACE-scoped, not org-scoped. Gets 4 command-specific
 *     RLS policies keyed on workspace_id (0034 §2), not organization_isolation.
 *   - account_period_balance, monetary_period_summary — read-model turnover
 *     tables get ENABLE (not FORCE) RLS so the SECURITY DEFINER maintenance
 *     trigger writes through (0034 §3). Not in this org-isolation list.
 *   - regime, legal_form, legal_form_allowed_regime, accounting_size,
 *     vat_regime, currency, business_activity, account_group,
 *     directive_account, depreciation_group — reference (law) tables, shared
 *     across all tenants, no RLS.
 */
export const ORGANIZATION_SCOPED_TABLES = [
  "api_key",
  "organization",
  "tool_call_log",
  // v2 accounting org-scoped tables (0034_accounting_enforcement.sql, `org_scoped`)
  "organization_business_activity",
  "accounting_period",
  "vat_status",
  "number_series",
  "accounting_event",
  "signature",
  "summary_record",
  "individual_record",
  "partial_record",
  "chart_of_accounts",
  "account",
  "category",
  "posting",
  "posting_double_entry_line",
  "posting_monetary_line",
  "asset",
  "depreciation_plan",
  "tax_depreciation",
  "inventory_count",
  "inventory_count_line",
  "period_output",
  "open_item",
  "open_item_settlement",
  // org config satellites (0042_org_config.sql)
  "organization_authorized_person",
  "organization_tax_representative",
  "organization_oss_registration",
  // operational tax profile (0048_organization_tax_profile.sql)
  "organization_tax_profile",
] as const

export type OrganizationScopedTable =
  (typeof ORGANIZATION_SCOPED_TABLES)[number]

/**
 * Names of WORKSPACE-scoped tables in the current schema.
 *
 * These isolate on `app.workspace_id` (the accountant's office), NOT
 * `app.organization_id` (a single client book). A workspace-scoped row is
 * shared across every organization in the office — a supplier's identity
 * (counterparty) or the Brain's learned OCR layout (ocr_extraction_template)
 * does not change per client book.
 *
 * Unlike the org-scoped set, these do NOT carry a single `organization_isolation`
 * policy; each gets FOUR command-specific policies (SELECT / INSERT / UPDATE /
 * DELETE) keyed on `workspace_id = NULLIF(current_setting('app.workspace_id',
 * true), '')::uuid`, plus a composite UNIQUE(id, workspace_id) that closes the
 * cross-workspace FK-bypass hole (Postgres FK checks run internal and skip RLS).
 *
 * Kept in sync with migrations that declare per-command `<table>_{select,insert,
 * update,delete}` policies keyed on workspace_id:
 *   - 0035_accounting_enforcement.sql §2 — counterparty
 *   - 0047_ocr_extraction_template.sql   — ocr_extraction_template
 *
 * If you add a workspace-scoped table, add it here AND to a migration that
 * creates its 4 command-specific policies with the NULLIF guard.
 *
 * See ADR-0029 "Brain learned state is workspace-scoped".
 */
export const WORKSPACE_SCOPED_TABLES = [
  "counterparty",
  "ocr_extraction_template",
] as const

export type WorkspaceScopedTable = (typeof WORKSPACE_SCOPED_TABLES)[number]

/**
 * SQL block that enables and forces RLS on a single table with the standard
 * `organization_isolation` policy using the NULLIF guard pattern.
 *
 * Useful for test harnesses and pgTAP suites.
 *
 * NULLIF guard: `NULLIF(current_setting('app.X', true), '')::uuid` returns
 * NULL when the GUC is unset or empty, causing the policy to evaluate to NULL
 * (no match) rather than throwing a cast error. This is the canonical pattern
 * used by all migrations in this repo (see ADR-0010).
 */
export function applyOrganizationPolicy(tableName: string): string {
  return `
    ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY;
    CREATE POLICY organization_isolation ON ${tableName}
      USING      (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
      WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
  `
}
