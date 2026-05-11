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
 *   - 0002_auth.sql       — auth_invite
 *   - 0003_rls_force.sql  — organization
 *   - 0004_audit.sql      — tool_call_log
 *
 * If you add an organization-scoped table, add it here AND to a migration
 * that creates the `organization_isolation` policy with the NULLIF guard.
 */
export const ORGANIZATION_SCOPED_TABLES = [
  "auth_invite",
  "organization",
  "tool_call_log",
] as const

export type OrganizationScopedTable =
  (typeof ORGANIZATION_SCOPED_TABLES)[number]

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
