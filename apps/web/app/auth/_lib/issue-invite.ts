import "server-only"
import { createHash } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { signInviteToken, type InviteClaims } from "@workspace/auth/tokens"
import { withAdminBypass } from "@workspace/db"
import {
  app_user,
  auth_invite,
  organization,
  organization_membership,
} from "@workspace/db/schema"
import { sendEmail, inviteEmail } from "@workspace/email"

/**
 * Issue a single invite: signs the JWT, writes the auth_invite row at
 * status='pending' (the audit trail starts at issue time, not accept
 * time), and emails the recipient. Idempotent on a (organization_id,
 * email, status='pending') tuple — the unique index on token_hash
 * prevents replay; for same-email re-issues the caller should call
 * `revokePendingInvites` first.
 *
 * Returns the URL so the caller can also display / copy it (useful for
 * the dev-CLI script and admin UIs).
 */

export const DEFAULT_INVITE_TTL_SECONDS = 60 * 60 * 24 * 7

export interface IssueInviteInput {
  email: string
  organizationId: string
  role: InviteClaims["role"]
  /** Issuing user (workspace owner / admin). Used for audit + email "from". */
  issuedByUserId: string | null
  /** Base URL (e.g. http://localhost:3000) — the link is base + /auth/invite/start?token=... */
  baseUrl: string
  /** Localized brand name (resolved by caller via t('brand.name')). */
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

  const token = await signInviteToken(
    {
      email: input.email,
      organizationId: input.organizationId,
      role: input.role,
    },
    ttlSeconds,
  )
  const tokenHash = sha256(token)
  const url = `${input.baseUrl}/auth/invite/start?token=${encodeURIComponent(token)}`

  // Insert auth_invite row + look up organization metadata for the email
  // template (workspace name, inviter name). Done inside withAdminBypass
  // because the issuer's session GUC may not be bound to this org yet.
  const { workspaceName, inviterName, inviteId } = await withAdminBypass(
    async (db) => {
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

      const [inserted] = await db
        .insert(auth_invite)
        .values({
          organization_id: org.id,
          workspace_id: org.workspace_id,
          token_hash: tokenHash,
          email: input.email,
          role: input.role,
          status: "pending",
          issued_by_user_id: input.issuedByUserId,
          expires_at: expiresAt,
        })
        .returning({ id: auth_invite.id })

      if (!inserted) {
        throw new Error("auth_invite insert returned no row")
      }

      return {
        inviteId: inserted.id,
        workspaceName: org.legal_name,
        inviterName: inviterDisplay,
      }
    },
  )

  await sendEmail(
    inviteEmail({
      to: input.email,
      url,
      brandName: input.brandName,
      workspaceName,
      inviterName,
      role: input.role,
      expiresAt,
    }),
  )

  return { inviteId, url, expiresAt }
}

/**
 * Mark every still-pending invite for (organizationId, email) as
 * 'revoked'. Call this BEFORE issuing a fresh invite to the same
 * recipient so the old token can no longer be redeemed.
 *
 * Returns the count of revoked rows for logging.
 */
export async function revokePendingInvites(input: {
  organizationId: string
  email: string
}): Promise<number> {
  const rows = await withAdminBypass(async (db) => {
    return await db
      .update(auth_invite)
      .set({ status: "revoked" })
      .where(
        and(
          eq(auth_invite.organization_id, input.organizationId),
          eq(auth_invite.email, input.email),
          eq(auth_invite.status, "pending"),
        ),
      )
      .returning({ id: auth_invite.id })
  })
  return rows.length
}

/**
 * Find the user id (if any) for the organization owner. Used by the
 * onboarding team-step action so issued invites are recorded with the
 * issuing user, not as anonymous.
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

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex")
}
