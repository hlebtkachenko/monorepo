import type {
  UtilityApplication,
  UtilityPageBinding,
  UtilityPageBindingStatus,
  UtilityPageId,
} from "./utility-page.types"

function binding(
  status: UtilityPageBindingStatus,
  applications: readonly UtilityApplication[],
  ...triggers: string[]
): UtilityPageBinding {
  return { status, applications, triggers }
}

export const UTILITY_PAGE_BINDINGS = {
  route_not_found: binding(
    "active",
    ["app", "admin"],
    "Root Next.js not-found boundary",
  ),
  resource_not_found: binding(
    "active",
    ["app", "admin", "api"],
    "Organization and gated resource not-found boundaries",
  ),
  resource_gone: binding(
    "reserved",
    ["app", "admin", "api"],
    "Deleted-resource resolver returns HTTP 410",
  ),
  invalid_link: binding(
    "reserved",
    ["app"],
    "Malformed action-link validation",
  ),
  expired_link: binding("reserved", ["app"], "Expired action-link validation"),
  authentication_required: binding(
    "reserved",
    ["app", "admin", "api"],
    "Protected route has no authenticated principal",
  ),
  session_expired: binding(
    "active",
    ["app", "admin"],
    "Reauthentication action cannot resolve an active session",
  ),
  reauthentication_required: binding(
    "reserved",
    ["app", "admin", "api"],
    "Sensitive action fails the fresh-session requirement",
  ),
  mfa_required: binding(
    "reserved",
    ["app", "admin", "api"],
    "Protected action requires completed MFA",
  ),
  auth_link_invalid: binding(
    "reserved",
    ["app", "admin"],
    "Magic-link verification rejects the token",
  ),
  invite_invalid: binding(
    "reserved",
    ["app", "admin"],
    "Invitation verification rejects the token",
  ),
  account_locked: binding(
    "reserved",
    ["app", "admin", "api"],
    "Identity provider reports a temporary account lock",
  ),
  account_disabled: binding(
    "reserved",
    ["app", "admin", "api"],
    "Identity provider reports a disabled account",
  ),
  access_denied: binding(
    "active",
    ["app", "admin", "api"],
    "Admin capability guard and forbidden shell adapter",
  ),
  membership_required: binding(
    "reserved",
    ["app", "admin", "api"],
    "Organization membership resolver finds no active membership",
  ),
  action_forbidden: binding(
    "reserved",
    ["app", "admin", "api"],
    "Operation permission check returns forbidden",
  ),
  resource_access_denied: binding(
    "reserved",
    ["app", "admin", "api"],
    "Resource-level authorization check returns forbidden",
  ),
  workspace_unavailable: binding(
    "reserved",
    ["app", "admin", "api"],
    "Workspace resolver cannot return an accessible workspace",
  ),
  organization_unavailable: binding(
    "reserved",
    ["app", "admin", "api"],
    "Organization resolver cannot return an accessible organization",
  ),
  organization_suspended: binding(
    "reserved",
    ["app", "admin", "api"],
    "Organization lifecycle state is suspended",
  ),
  organization_archived: binding(
    "reserved",
    ["app", "admin", "api"],
    "Organization lifecycle state is archived",
  ),
  feature_not_enabled: binding(
    "reserved",
    ["app", "admin", "api"],
    "Feature entitlement check is disabled for the organization",
  ),
  maintenance_scheduled: binding(
    "reserved",
    ["app", "admin", "api"],
    "Operations maintenance schedule is announced",
  ),
  maintenance_active: binding(
    "reserved",
    ["app", "admin", "api"],
    "Operations maintenance mode is active",
  ),
  service_unavailable: binding(
    "reserved",
    ["app", "admin", "api"],
    "Service health gate returns HTTP 503",
  ),
  service_degraded: binding(
    "reserved",
    ["app", "admin", "api"],
    "Service health gate reports partial degradation",
  ),
  system_waking: binding(
    "reserved",
    ["app", "admin", "api"],
    "Service health gate reports a cold start",
  ),
  dependency_unavailable: binding(
    "reserved",
    ["app", "admin", "api"],
    "Required dependency health check fails",
  ),
  read_only_mode: binding(
    "reserved",
    ["app", "admin", "api"],
    "Write gate reports read-only operations mode",
  ),
  unexpected_server_error: binding(
    "active",
    ["app", "admin", "api"],
    "Next.js error and global-error boundaries receive a server digest",
  ),
  unexpected_client_error: binding(
    "active",
    ["app", "admin"],
    "Next.js error and global-error boundaries receive a client failure",
  ),
  request_timeout: binding(
    "reserved",
    ["app", "admin", "api"],
    "Request client or API returns HTTP 408",
  ),
  gateway_error: binding(
    "reserved",
    ["app", "admin", "api"],
    "Gateway or upstream request returns HTTP 502",
  ),
  chunk_load_failed: binding(
    "reserved",
    ["app", "admin"],
    "Next.js chunk loader rejects an application bundle",
  ),
  update_required: binding(
    "reserved",
    ["app", "admin", "api"],
    "Client and server build compatibility check returns HTTP 409",
  ),
  offline: binding(
    "reserved",
    ["app", "admin"],
    "Browser starts with navigator.onLine false",
  ),
  connection_lost: binding(
    "reserved",
    ["app", "admin"],
    "Browser transitions from online to offline",
  ),
  connection_restoring: binding(
    "reserved",
    ["app", "admin"],
    "Browser returns online while the health check recovers",
  ),
  unsupported_browser: binding(
    "reserved",
    ["app", "admin"],
    "Browser support policy rejects the user agent",
  ),
  javascript_required: binding(
    "reserved",
    ["app", "admin"],
    "Root document noscript fallback",
  ),
  cookies_required: binding(
    "reserved",
    ["app", "admin"],
    "Authentication cookie capability check fails",
  ),
  storage_unavailable: binding(
    "reserved",
    ["app", "admin"],
    "Browser storage capability check fails",
  ),
  rate_limited: binding(
    "reserved",
    ["app", "admin", "api"],
    "Request client or API returns HTTP 429 with a retry window",
  ),
  quota_exceeded: binding(
    "reserved",
    ["app", "admin", "api"],
    "Organization quota guard rejects the operation",
  ),
  ai_budget_exhausted: binding(
    "reserved",
    ["app", "admin", "api"],
    "AI budget guard rejects additional processing",
  ),
  cooldown_active: binding(
    "reserved",
    ["app", "admin", "api"],
    "Operation cooldown guard returns a retry window",
  ),
} as const satisfies Record<UtilityPageId, UtilityPageBinding>
