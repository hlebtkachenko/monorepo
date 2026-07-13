export const UTILITY_PAGE_IDS = [
  "route_not_found",
  "resource_not_found",
  "resource_gone",
  "invalid_link",
  "expired_link",
  "authentication_required",
  "session_expired",
  "reauthentication_required",
  "mfa_required",
  "auth_link_invalid",
  "invite_invalid",
  "account_locked",
  "account_disabled",
  "access_denied",
  "membership_required",
  "action_forbidden",
  "resource_access_denied",
  "workspace_unavailable",
  "organization_unavailable",
  "organization_suspended",
  "organization_archived",
  "feature_not_enabled",
  "maintenance_scheduled",
  "maintenance_active",
  "service_unavailable",
  "service_degraded",
  "system_waking",
  "dependency_unavailable",
  "read_only_mode",
  "unexpected_server_error",
  "unexpected_client_error",
  "request_timeout",
  "gateway_error",
  "chunk_load_failed",
  "update_required",
  "offline",
  "connection_lost",
  "connection_restoring",
  "unsupported_browser",
  "javascript_required",
  "cookies_required",
  "storage_unavailable",
  "rate_limited",
  "quota_exceeded",
  "ai_budget_exhausted",
  "cooldown_active",
] as const

export type UtilityPageId = (typeof UTILITY_PAGE_IDS)[number]

export function isUtilityPageId(value: unknown): value is UtilityPageId {
  return (
    typeof value === "string" &&
    (UTILITY_PAGE_IDS as readonly string[]).includes(value)
  )
}

export type UtilityErrorType =
  | "navigation"
  | "authentication"
  | "authorization"
  | "tenancy"
  | "availability"
  | "runtime"
  | "connectivity"
  | "client"
  | "capacity"

export type UtilityActionId =
  | "go_back"
  | "choose_organization"
  | "sign_in"
  | "reauthenticate"
  | "retry"
  | "reload"
  | "request_access"
  | "open_status"
  | "contact_support"

export type UtilityPageSurface = "global" | "shell" | "auth"

export type UtilityApplication = "app" | "admin" | "api"

type UtilityPageMessageKey =
  `utilityPage.states.${UtilityPageId}.${"codeLabel" | "title" | "description"}`

export interface UtilityPageDefinition {
  id: UtilityPageId
  errorType: UtilityErrorType
  condition: "expected" | "unexpected"
  duration: "temporary" | "permanent" | "unknown"
  recovery: "none" | "navigate" | "manual_retry" | "automatic_retry"
  defaultSurface: UtilityPageSurface
  httpStatus: number | null
  codeLabel: UtilityPageMessageKey
  title: UtilityPageMessageKey
  description: UtilityPageMessageKey
  tone: "neutral" | "warning" | "danger"
  actions: readonly UtilityActionId[]
  telemetry: {
    log: "none" | "aggregate" | "warning" | "error"
    report: "none" | "automatic" | "automatic_with_user_feedback"
  }
  reference: "hidden" | "when_available" | "required"
  noIndex: true
}

export interface UtilityPageReport {
  endpoint?: string
  payload: {
    message: string
    id?: string
    source?: string
    digest?: string
  }
}

export type UtilityPageBindingStatus = "active" | "reserved" | "preview_only"

export interface UtilityPageBinding {
  status: UtilityPageBindingStatus
  applications: readonly UtilityApplication[]
  triggers: readonly string[]
}

export interface UtilityPageRuntime {
  surface?: UtilityPageSurface
  /** Application that sent the user here. Defaults to the customer app. */
  application?: UtilityApplication
  /** Use only when the root i18n provider may be unavailable. */
  fallbackChrome?: boolean
  referenceId?: string
  retryAfterSeconds?: number
  buildVersion?: string
  actionHrefs?: Partial<Record<UtilityActionId, string>>
  onRetry?: () => void
  report?: UtilityPageReport
  /** Disable automatic delivery in catalogs and development previews. */
  automaticReport?: boolean
}
