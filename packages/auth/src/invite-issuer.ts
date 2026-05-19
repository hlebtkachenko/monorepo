import { and, eq, inArray, sql } from "drizzle-orm"
import { withAdminBypass, auth_token } from "@workspace/db"
import {
  app_user,
  auth_invite,
  organization,
  organization_membership,
} from "@workspace/db/schema"
import { sendEmail, inviteEmail } from "@workspace/email"

import {
  generateRawInviteToken,
  hashInviteToken,
  type InviteRecord,
} from "./tokens/invite"
import { mintToken, hashRawToken } from "./tokens"

/**
 * Issue a single invite: generates a 32-byte random token, writes the
 * `auth_invite` row at status='pending' (the audit trail starts at
 * issue time), and emails the recipient. Returns the URL so the caller
 * can also display / copy it.
 *
 * Caller should `revokePendingInvites()` first when re-issuing for the
 * same (organization, email) — the unique constraint on `token_hash`
 * does not dedupe across different tokens. Each call mints a fresh
 * random token.
 */

export const DEFAULT_INVITE_TTL_SECONDS = 60 * 60 * 24 * 7

export type InviteRole = InviteRecord["role"]

function useNewInvPath(): boolean {
  return process.env.USE_AUTH_TOKEN_FOR_INV === "true"
}

export interface IssueInviteInput {
  email: string
  organizationId: string
  role: InviteRole
  /** Issuing user (workspace owner / admin). Used for audit + email "from". */
  issuedByUserId: string | null
  /** Base URL (e.g. http://localhost:3000) — link is base + /auth/invite/start?token=... */
  baseUrl: string
  /** Localized brand name (resolved by caller via i18n). */
  brandName: string
  /** Optional override for the TTL. Default 7 days. */
  ttlSeconds?: number
}

export interface IssueInviteResult {
  inviteId: string
  url: string
  expiresAt: Date
}

export async function issueInvite(
  input: IssueInviteInput,
): Promise<IssueInviteResult> {
  const ttlSeconds = input.ttlSeconds ?? DEFAULT_INVITE_TTL_SECONDS
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000)
  // Normalise email at the write boundary so the (org, email) uniqueness
  // and the revoke lookup below resolve case-insensitively. The DB trigger
  // also lowercases, but normalising in code keeps the in-memory `email`
  // consistent with what we email and what we later compare to a session
  // user's email.
  const normalizedEmail = input.email.trim().toLowerCase()

  // Resolve the org first (we need workspace_id for both writes).
  const { orgRow, inviterName } = await withAdminBypass(async (db) => {
    const [org] = await db
      .select({
        id: organization.id,
        workspace_id: organization.workspace_id,
        legal_name: organization.legal_name,
      })
      .from(organization)
      .where(eq(organization.id, input.organizationId))
      .limit(1)
    if (!org) {
      throw new Error(`Organization ${input.organizationId} not found`)
    }

    let inviterDisplay: string | null = null
    if (input.issuedByUserId) {
      const [issuer] = await db
        .select({
          display_name: app_user.display_name,
          name: app_user.name,
        })
        .from(app_user)
        .where(eq(app_user.id, input.issuedByUserId))
        .limit(1)
      inviterDisplay = issuer?.display_name ?? issuer?.name ?? null
    }
    return { orgRow: org, inviterName: inviterDisplay }
  })

  // Mint the raw token. Under the legacy path it's a random base64url
  // (32 bytes). Under the new path it's an afkey-formatted token from
  // `mintToken('inv')` which ALSO writes an auth_token row. Both
  // hashing paths use sha256(raw), so the token_hash that lands in
  // auth_invite (the source-of-truth lifecycle row) is identical to the
  // one in auth_token. The new /landing/consume route consults auth_token
  // (via consumeToken); the existing materializeInvite path consults
  // auth_invite — both find the same hash.
  const useNew = useNewInvPath()
  let rawToken: string
  let tokenHash: string
  if (useNew) {
    const minted = await mintToken({
      kind: "inv",
      payload: {
        email: normalizedEmail,
        organizationId: orgRow.id,
        workspaceId: orgRow.workspace_id,
        role: input.role,
        issuedByUserId: input.issuedByUserId,
      },
      ttlSeconds,
      issuedToUserId: input.issuedByUserId ?? null,
    })
    rawToken = minted.rawToken
    tokenHash = hashRawToken(rawToken)
  } else {
    rawToken = generateRawInviteToken()
    tokenHash = hashInviteToken(rawToken)
  }

  const url = `${input.baseUrl}/auth/invite/start?token=${encodeURIComponent(rawToken)}`

  const inviteId = await withAdminBypass(async (db) => {
    const [inserted] = await db
      .insert(auth_invite)
      .values({
        organization_id: orgRow.id,
        workspace_id: orgRow.workspace_id,
        token_hash: tokenHash,
        email: normalizedEmail,
        role: input.role,
        status: "pending",
        issued_by_user_id: input.issuedByUserId,
        expires_at: expiresAt,
      })
      .returning({ id: auth_invite.id })

    if (!inserted) {
      throw new Error("auth_invite insert returned no row")
    }
    return inserted.id
  })

  await sendEmail(
    inviteEmail({
      to: normalizedEmail,
      url,
      brandName: input.brandName,
      workspaceName: orgRow.legal_name,
      inviterName,
      role: input.role,
      expiresAt,
    }),
  )

  return { inviteId, url, expiresAt }
}

/**
 * Look up an invite by its raw token. Caller provides the raw token from
 * the URL or cookie; we hash + SELECT here so the lookup is a constant
 * SHA-256 + indexed read.
 *
 * Returns:
 *   - the invite record if pending + not expired (caller sees full claims)
 *   - { status: 'accepted' | 'revoked' | 'expired', ... } when the row exists
 *     but is no longer usable — caller can render an appropriate error
 *   - null if the token does not exist (treated identically to "expired"
 *     to avoid token-enumeration leaks)
 *
 * Auto-expires rows whose `expires_at` has passed but still carry
 * `status='pending'` (the cleanup worker may not have run yet).
 */
export async function readInviteByRawToken(
  rawToken: string,
): Promise<InviteRecord | null> {
  if (!rawToken) return null
  const tokenHash = hashInviteToken(rawToken)
  return await withAdminBypass(async (db) => {
    const [row] = await db
      .select({
        id: auth_invite.id,
        email: auth_invite.email,
        organization_id: auth_invite.organization_id,
        workspace_id: auth_invite.workspace_id,
        role: auth_invite.role,
        status: auth_invite.status,
        expires_at: auth_invite.expires_at,
      })
      .from(auth_invite)
      .where(eq(auth_invite.token_hash, tokenHash))
      .limit(1)
    if (!row) return null

    // Soft auto-expire: a pending row past expires_at is functionally
    // expired even if the cleanup worker hasn't flipped its status yet.
    let status = row.status
    if (status === "pending" && row.expires_at <= new Date()) {
      status = "expired"
    }

    return {
      id: row.id,
      email: row.email,
      organizationId: row.organization_id,
      workspaceId: row.workspace_id,
      role: row.role as InviteRole,
      status: status as InviteRecord["status"],
      expiresAt: row.expires_at,
    }
  })
}

/**
 * Mark every still-pending invite for (organizationId, email) as
 * 'revoked'. Call this BEFORE issuing a fresh invite to the same
 * recipient so an older token can no longer be redeemed.
 *
 * Under the dual-write window (USE_AUTH_TOKEN_FOR_INV=true), the matching
 * `auth_token` rows (kind='inv', same token_hash) are also flipped to
 * 'revoked' so the new consume path stops returning them. The dual write
 * means we may have a token_hash in BOTH tables, and revoke must catch
 * both.
 */
export async function revokePendingInvites(input: {
  organizationId: string
  email: string
}): Promise<number> {
  // Mirror the same normalisation as issueInvite so revoking by
  // "Foo@Bar.com" still hits rows the trigger lowercased on INSERT.
  const normalizedEmail = input.email.trim().toLowerCase()
  const rows = await withAdminBypass(async (db) => {
    const flipped = await db
      .update(auth_invite)
      .set({ status: "revoked" })
      .where(
        and(
          eq(auth_invite.organization_id, input.organizationId),
          eq(auth_invite.email, normalizedEmail),
          eq(auth_invite.status, "pending"),
        ),
      )
      .returning({ id: auth_invite.id, token_hash: auth_invite.token_hash })

    if (flipped.length > 0) {
      // Mirror the revoke to auth_token. Same token_hash, kind='inv', and
      // pending status — every matched row becomes 'revoked'. No-op when
      // the new path is off (no auth_token rows exist for these hashes).
      const hashes = flipped.map((r) => r.token_hash)
      await db
        .update(auth_token)
        .set({ status: "revoked" })
        .where(
          and(
            inArray(auth_token.token_hash, hashes),
            eq(auth_token.kind, "inv"),
            eq(auth_token.status, "pending"),
          ),
        )
    }
    return flipped
  })
  return rows.length
}

/**
 * Find the user id (if any) for the organization owner. Used by
 * onboarding team-step action and the dev-CLI invite script so issued
 * invites are recorded with the issuing user, not as anonymous.
 */
export async function findOrganizationOwner(
  organizationId: string,
): Promise<string | null> {
  return await withAdminBypass(async (db) => {
    const row = (
      await db
        .select({ user_id: organization_membership.user_id })
        .from(organization_membership)
        .where(
          and(
            eq(organization_membership.organization_id, organizationId),
            eq(organization_membership.role, "owner"),
            eq(organization_membership.active, true),
          ),
        )
        .limit(1)
    )[0]
    return row?.user_id ?? null
  })
}

/**
 * Mark all expired-but-still-pending invites as 'expired'. Called by
 * the daily cleanup worker (see packages/workers/src/jobs/
 * cleanup-auth-invites.ts).
 */
export async function expireDuePendingInvites(): Promise<number> {
  const rows = await withAdminBypass(async (db) => {
    const result = (await db.execute(
      sql`UPDATE auth_invite
          SET status = 'expired'
          WHERE expires_at < now()
            AND status = 'pending'
          RETURNING id`,
    )) as unknown as Array<{ id: string }>
    return result
  })
  return rows.length
}
