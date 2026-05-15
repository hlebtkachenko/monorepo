/**
 * Public surface of @workspace/db.
 *
 * Consumers import from this barrel:
 *   import { withOrganization, withWorkspace, withAdminBypass } from '@workspace/db'
 *   import { workspace, app_user } from '@workspace/db'
 *   import { writeToolCallLog } from '@workspace/db'
 */

// Tenancy helpers + branded types
export {
  withOrganization,
  withWorkspace,
  withAdminBypass,
  organizationBrand,
  workspaceBrand,
  adminBypassBrand,
} from "./tenancy"
export type {
  OrganizationBoundDb,
  WorkspaceBoundDb,
  AdminBypassDb,
} from "./tenancy"

// Domain types (Money, FxRate, branded IDs)
export type {
  Currency,
  Money,
  FxRate,
  WorkspaceId,
  OrganizationId,
  UserId,
  ToolCallLogId,
} from "./types"

// Column helpers
export { money } from "./columns"

// Schema (all tables + enums)
export * from "./schema/index"

// RLS policy helpers
export {
  ORGANIZATION_SCOPED_TABLES,
  applyOrganizationPolicy,
} from "./policies/rls"
export type { OrganizationScopedTable } from "./policies/rls"

// Audit module
export * from "./audit/index"

// Drizzle helpers for consumers
export { sql, eq, and, or, inArray, ne } from "drizzle-orm"

// Db type for consumers that need the raw client type
export type { Db } from "./client"
