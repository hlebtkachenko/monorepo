import "server-only"

export { requireAdminSession, type AdminSessionContext } from "./admin-session"

export {
  auditAdminAction,
  auditOnce,
  type AuditAdminActionInput,
} from "./admin-audit"

export {
  ADMIN_CAPABILITIES,
  requireAdminCapability,
  type AdminCapability,
} from "./admin-capability"

export { searchAllAction } from "./admin-search"
export type { SearchResult } from "./admin-search-types"

export {
  getActiveImpersonation,
  startImpersonation,
  stopImpersonation,
} from "./admin-impersonation"
export type {
  ImpersonationState,
  ImpersonationMutationResult,
  StartImpersonationInput,
} from "./admin-impersonation-types"
