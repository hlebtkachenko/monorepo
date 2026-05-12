import { signToken, verifyToken } from "./jwt"

/**
 * Invite token — issued by a workspace owner or admin from
 * `/<orgSlug>/settings` to invite a user to an organization. The email
 * link points to `/auth/invite/start?token=<jwt>`; that Route Handler
 * verifies, stashes the JWT in an HttpOnly cookie, then redirects to
 * `/auth/invite` (the welcome card).
 *
 * Claims:
 *   kind            always "invite"
 *   email           the invitee's email
 *   organizationId  target organization (resolved from current URL slug)
 *   role            organization_role to assign on accept
 *
 * Default TTL: 7 days.
 */
export interface InviteClaims {
  kind: "invite"
  email: string
  organizationId: string
  role: "owner" | "admin" | "member" | "agent" | "guest"
}

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7

export async function signInviteToken(
  input: Omit<InviteClaims, "kind">,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<string> {
  return await signToken<InviteClaims>({ kind: "invite", ...input }, ttlSeconds)
}

export async function verifyInviteToken(token: string): Promise<InviteClaims> {
  return await verifyToken<InviteClaims>(token, "invite")
}
