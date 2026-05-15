import { signToken, verifyToken } from "./jwt"

/**
 * Active-workspace cookie — carries the workspace_id the user is
 * currently operating in. Set after workspace creation (onboarding
 * step 4) and on the `/workspace` chooser when the user selects a
 * workspace. Read by server actions that need to know "which
 * workspace am I writing to" without re-querying the DB on every
 * call.
 *
 * Replaces the fragile `findOwnerWorkspaceId(userId) ORDER BY
 * created_at LIMIT 1` fallback for users who own multiple workspaces.
 * The userId-only lookup remains as a defense-in-depth fallback (and
 * is still used for the resume helper before the cookie is set).
 *
 * Signed HS256 JWT, HttpOnly, path "/", 90-day TTL.
 */
export interface ActiveWorkspaceClaims {
  kind: "active-workspace"
  workspaceId: string
}

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 90

export async function signActiveWorkspaceToken(
  workspaceId: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<string> {
  return await signToken<ActiveWorkspaceClaims>(
    { kind: "active-workspace", workspaceId },
    ttlSeconds,
  )
}

export async function verifyActiveWorkspaceToken(
  token: string,
): Promise<ActiveWorkspaceClaims> {
  return await verifyToken<ActiveWorkspaceClaims>(token, "active-workspace")
}
