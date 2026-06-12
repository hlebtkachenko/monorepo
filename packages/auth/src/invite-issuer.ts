import { and, eq, sql } from "drizzle-orm"
import { withAdminBypass, auth_token } from "@workspace/db"
import {
  app_user,
  organization,
  organization_membership,
} from "@workspace/db/schema"
import { sendEmail, inviteEmail } from "@workspace/email"

import {
  hashRawToken,
  mintToken,
  resolveAuthTokenEnv,
  verifyChecksum,
} from "./tokens"

/**
 * Invite-issuance + lookup helpers, on top of the unified `auth_token`
 * table (ADR-0022). Each invite is a row with `kind='inv'`, payload
 * `{ email, organizationId, workspaceId, role, issuedByUserId }`, and
 * the standard lifecycle (`pending` → `consumed` | `revoked` | `expired`).
 *
 * The previous `auth_invite` table is dropped by migration 0020.
 */

export const DEFAULT_INVITE_TTL_SECONDS = 60 * 60 * 24 * 7

/** Roles the app accepts on an invite. Mirrors organization_membership.role. */
export type InviteRole = "owner" | "admin" | "member" | "agent" | "guest"

/**
 * Shape returned by `readInviteByRawToken`. Kept compatible with the
 * previous `InviteRecord` so downstream callers (welcome card, cookie
 * reader) didn't need to change names.
 */
export interface InviteRecord {
  /** auth_token row id. */
  id: string
  email: string
  organizationId: string
  workspaceId: string
  role: InviteRole
  status: "pending" | "accepted" | "revoked" | "expired"
  expiresAt: Date
}

export interface IssueInviteInput {
  email: string
  organizationId: string
  role: InviteRole
  /** Issuing user (workspace owner / admin). Used for audit + email "from". */
  issuedByUserId: string | null
  /** Base URL (e.g. http://localhost:3000) — link is base + /auth/invite?token=... */
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
  // Normalise email at the write boundary so revoke / read lookups
  // resolve case-insensitively. We compare payload->>'email' directly,
  // so the in-memory + payload values must agree.
  const normalizedEmail = input.email.trim().toLowerCase()

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

  const url = `${input.baseUrl}/auth/invite?token=${encodeURIComponent(minted.rawToken)}`

  await sendEmail(
    inviteEmail({
      to: normalizedEmail,
      url,
      brandName: input.brandName,
      workspaceName: orgRow.legal_name,
      inviterName,
      role: input.role,
      expiresAt: minted.expiresAt,
    }),
  )

  return { inviteId: minted.id, url, expiresAt: minted.expiresAt }
}

/**
 * Look up an invite by its raw token. Caller provides the raw token from
 * the URL or cookie; we hash + SELECT here so the lookup is a constant
 * SHA-256 + indexed read on `auth_token.token_hash`.
 *
 * Returns the record with `status` set to one of:
 *   - 'pending'  — usable, callers can drive accept flow
 *   - 'revoked'  — admin revoked the invite (status='revoked')
 *   - 'expired'  — past expires_at, OR explicit status='expired'
 *   - 'accepted' — already consumed (status='consumed')
 *
 * Returns null only when the token format is invalid or the row does
 * not exist. The "unknown token" and "expired" paths are intentionally
 * indistinguishable to callers to avoid enumeration leaks; only routes
 * that need a finer-grained UI message should branch on `status`.
 */
export async function readInviteByRawToken(
  rawToken: string,
): Promise<InviteRecord | null> {
  if (!rawToken) return null
  if (!verifyChecksum(rawToken, "inv", resolveAuthTokenEnv())) {
    return null
  }
  const tokenHash = hashRawToken(rawToken)
  return await withAdminBypass(async (db) => {
    const [row] = await db
      .select({
        id: auth_token.id,
        status: auth_token.status,
        expires_at: auth_token.expires_at,
        payload: auth_token.payload,
      })
      .from(auth_token)
      .where(
        and(eq(auth_token.token_hash, tokenHash), eq(auth_token.kind, "inv")),
      )
      .limit(1)
    if (!row) return null

    const payload = row.payload as Record<string, unknown>
    const email = typeof payload["email"] === "string" ? payload["email"] : null
    const organizationId =
      typeof payload["organizationId"] === "string"
        ? payload["organizationId"]
        : null
    const workspaceId =
      typeof payload["workspaceId"] === "string" ? payload["workspaceId"] : null
    const role = typeof payload["role"] === "string" ? payload["role"] : null
    if (!email || !organizationId || !workspaceId || !role) return null

    // Map auth_token status onto the public InviteRecord vocabulary.
    // 'consumed' on the auth_token row means the invite was accepted.
    let outStatus: InviteRecord["status"]
    if (row.status === "consumed") outStatus = "accepted"
    else if (row.status === "revoked") outStatus = "revoked"
    else if (row.status === "expired") outStatus = "expired"
    else if (row.expires_at <= new Date()) outStatus = "expired"
    else outStatus = "pending"

    return {
      id: row.id,
      email,
      organizationId,
      workspaceId,
      role: role as InviteRole,
      status: outStatus,
      expiresAt: row.expires_at,
    }
  })
}

/**
 * Mark every still-pending invite for (organizationId, email) as
 * 'revoked'. Call this BEFORE issuing a fresh invite to the same
 * recipient so an older token can no longer be redeemed.
 *
 * Operates on auth_token rows with kind='inv' whose payload->>'email'
 * matches the normalized email and payload->>'organizationId' matches.
 */
export async function revokePendingInvites(input: {
  organizationId: string
  email: string
}): Promise<number> {
  const normalizedEmail = input.email.trim().toLowerCase()
  return await withAdminBypass(async (db) => {
    const result = (await db.execute(
      sql`UPDATE auth_token
          SET status = 'revoked'
          WHERE kind = 'inv'
            AND status = 'pending'
            AND payload->>'organizationId' = ${input.organizationId}
            AND payload->>'email' = ${normalizedEmail}
          RETURNING id`,
    )) as unknown as Array<{ id: string }>
    return result.length
  })
}

/**
 * Find the user id (if any) for the organization owner. Used by the
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
