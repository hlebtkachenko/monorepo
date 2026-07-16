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
  executeRows,
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

// Accounting-domain DB helpers (trust-state writes shared across surfaces)
export { unconfirmTemplateOnReject } from "./accounting/ocr-template-trust"

// Confident-wrong circuit-breaker seams (constitution §I8): the gate reads the
// count fail-closed at run entry; the human review surface increments it; an
// operator clears it. See packages/brain/.brain/constitution.md §I8.
export {
  readConfidentWrongCount,
  recordConfidentWrong,
  resetConfidentWrongCount,
} from "./brain/confident-wrong"
export type {
  RecordConfidentWrongInput,
  ResetConfidentWrongInput,
} from "./brain/confident-wrong"

// Marshrutizátor core (ADR-0028): per-(org, period) write serialization +
// admission caps. `lockPeriodInTx` is wired into the accounting write gate + the
// approve-replay lanes; `withPeriodLock` (own-tx form) + `closePeriod` locking
// stay reusable for a future period-close endpoint.
export { withPeriodLock, lockPeriodInTx, hashInt } from "./period-lock"
export {
  InMemoryAdmissionController,
  DbAdmissionController,
  AdmissionRejected,
  isBrainRuntimeActive,
  reapExpiredAdmissionSlots,
} from "./admission"
export type {
  AdmissionController,
  AdmissionCaps,
  AdmissionSlot,
  AdmissionRejectReason,
} from "./admission"

// Drizzle helpers for consumers
export {
  sql,
  eq,
  and,
  or,
  inArray,
  ne,
  isNull,
  isNotNull,
  desc,
  asc,
} from "drizzle-orm"

// Db type for consumers that need the raw client type
export type { Db } from "./client"
