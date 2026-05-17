/**
 * Caller identity passed into every domain function. Resolved by the transport
 * adapter — from a Better Auth session (web) or from an API key (public api) —
 * before the domain layer is entered. Domain functions never touch cookies,
 * headers, or request objects.
 */

/** Organization-scoped caller (an API key, or a session acting on one org). */
export interface OrgPrincipal {
  /** app_user.id of the actor. Null when the credential has no creating user. */
  readonly userId: string | null
  readonly organizationId: string
  readonly workspaceId: string
  /** Coarse capability scopes carried by the credential (api_key.scopes). */
  readonly scopes: readonly string[]
}

/** Workspace-tier caller (no single organization in scope). */
export interface WorkspacePrincipal {
  readonly userId: string
  readonly workspaceId: string
}
