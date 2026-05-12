import { signToken, verifyToken } from "./jwt"

/**
 * Signup token — issued by support (or the future admin app) when a new
 * workspace owner is invited. The email link points to
 * `/auth/signup/start?token=<jwt>`; that Route Handler verifies, stashes
 * the JWT in an HttpOnly cookie, then redirects to `/auth/signup` (the
 * welcome card). Claims:
 *
 *   kind       always "signup"
 *   email      the invitee's email (becomes app_user.email)
 *   workspace  workspace.display_name suggestion (user can edit)
 *
 * The token does NOT carry a workspace_id: the workspace row is created
 * AT signup completion. The token is the sole authorization to create a
 * workspace + owner-membership pair.
 *
 * Default TTL: 14 days. Long enough to land in spam folders and still
 * recover, short enough to bound exposure.
 */
export interface SignupClaims {
  kind: "signup"
  email: string
  workspace: string
}

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 14

export async function signSignupToken(
  input: Omit<SignupClaims, "kind">,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<string> {
  return await signToken<SignupClaims>({ kind: "signup", ...input }, ttlSeconds)
}

export async function verifySignupToken(token: string): Promise<SignupClaims> {
  return await verifyToken<SignupClaims>(token, "signup")
}
