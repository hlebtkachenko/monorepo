/**
 * Pure helpers for the admin workspace-allowlist gate. Kept separate from
 * `(gated)/layout.tsx` so the decision is unit-testable without a database
 * or a session.
 */

/** Parse `ADMIN_WORKSPACE_ALLOWLIST` — a comma-separated list of workspace ids. */
export function parseAdminWorkspaceAllowlist(
  env: string | undefined,
): string[] {
  return (env ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
}

/**
 * True when the user belongs to at least one allowlisted workspace. An empty
 * allowlist denies everyone — the gate fails closed.
 */
export function isWorkspaceAllowed(
  userWorkspaceIds: readonly string[],
  allowlistEnv: string | undefined,
): boolean {
  const allowed = new Set(parseAdminWorkspaceAllowlist(allowlistEnv))
  if (allowed.size === 0) return false
  return userWorkspaceIds.some((id) => allowed.has(id))
}
