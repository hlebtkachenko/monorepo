import { createHash, randomBytes } from "node:crypto"

/**
 * Invite-token primitives — random 32-byte token + SHA-256 hex hash.
 *
 * Replaces the previous jose-JWT pattern (which encoded email +
 * organizationId + role as claims) with the industry-standard
 * opaque-token + DB-hash design used by Stripe / GitHub / Linear:
 *
 *   issue   → generateRawInviteToken() → store sha256(raw) in
 *             auth_invite.token_hash + the actual claims (org, email,
 *             role) as DB columns. Raw token is sent in the URL,
 *             never persisted anywhere except the recipient's email
 *             client and (briefly) the HttpOnly cookie.
 *   verify  → caller hashes the raw token, looks up auth_invite by
 *             token_hash, validates status='pending' and
 *             expires_at > now(). See `readInviteByRawToken` in
 *             `../invite-issuer.ts`.
 *
 * Why move away from JWT:
 * - JWTs can't be revoked. Random tokens revoke by flipping a status
 *   column.
 * - JWT's "the token IS the data" semantics meant we couldn't change
 *   role / org on an issued invite; the random token decouples that.
 * - Audit trail starts at issue time (status='pending' row already
 *   exists), not at accept time.
 */

/** Token entropy in bytes. 32 = 256 bits, base64url-encoded → 43 chars. */
export const INVITE_TOKEN_BYTES = 32

export function generateRawInviteToken(): string {
  return randomBytes(INVITE_TOKEN_BYTES).toString("base64url")
}

export function hashInviteToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex")
}

/**
 * Claim-shape returned by `readInviteByRawToken`. Mirrors the old
 * `InviteClaims` shape from the JWT era so consumers don't churn.
 */
export interface InviteRecord {
  /** auth_invite.id */
  id: string
  email: string
  organizationId: string
  workspaceId: string
  role: "owner" | "admin" | "member" | "agent" | "guest"
  status: "pending" | "accepted" | "revoked" | "expired"
  expiresAt: Date
}
