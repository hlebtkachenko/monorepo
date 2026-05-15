import "server-only"
import { and, eq, sql } from "drizzle-orm"
import { hashInviteToken } from "@workspace/auth/tokens"
import { withAdminBypass } from "@workspace/db"
import {
  app_user,
  auth_invite,
  organization,
  organization_membership,
  workspace_membership,
} from "@workspace/db/schema"

/**
 * Shared helper for accept-invite flows.
 *
 * Atomically flips the `auth_invite` row (pre-created at issue time with
 * status='pending') to status='accepted', then materializes
 * `workspace_membership` + `organization_membership` for the user.
 *
 * Runs under `withAdminBypass` because no tenancy context is bound at
 * this point (the user has no `app.organization_id` GUC yet).
 *
 * Lifecycle (mirroring lac/packages/domain/src/auth/invite.ts):
 *   issue   →  auth_invite (status='pending', token_hash, expires_at)
 *   accept  →  this function: UPDATE status='accepted' WHERE
 *              token_hash=? AND status='pending' RETURNING
 *              {id, organization_id, workspace_id, role, email}
 *              → if 0 rows updated, the invite is already-accepted,
 *                revoked, or expired → throw.
 *   revoke  →  see invite-issuer.ts `revokePendingInvites`.
 *
 * Contract: callers pass only the accepting user id and the raw token.
 * `role`, `organization_id`, `workspace_id`, and `email` are derived
 * from the auth_invite row inside this function so a caller cannot
 * inject a different role or org via parameter manipulation.
 *
 * Returns the organization slug so the caller can redirect to /[orgSlug].
 */
export interface MaterializeInviteInput {
  /** Better Auth user id of the accepting user. */
  userId: string
  /** Raw invite token from the URL/cookie — hashed for the DB lookup. */
  inviteRawToken: string
}

export class InviteAcceptError extends Error {
  constructor(public readonly code: InviteAcceptErrorCode) {
    super(code)
    this.name = "InviteAcceptError"
  }
}

export type InviteAcceptErrorCode =
  | "invite-not-found"
  | "invite-already-accepted"
  | "invite-revoked"
  | "invite-expired"
  | "organization-not-found"

export async function materializeInvite(
  input: MaterializeInviteInput,
): Promise<string> {
  const tokenHash = hashInviteToken(input.inviteRawToken)

  return await withAdminBypass(async (db) => {
    // Atomic check-and-set: only one accept can succeed per token.
    // RETURNING includes role + email so we never trust the caller to
    // tell us what they're materializing.
    const updated = await db
      .update(auth_invite)
      .set({
        status: "accepted",
        accepted_at: new Date(),
        accepted_by_user_id: input.userId,
      })
      .where(
        and(
          eq(auth_invite.token_hash, tokenHash),
          eq(auth_invite.status, "pending"),
          sql`${auth_invite.expires_at} > now()`,
        ),
      )
      .returning({
        id: auth_invite.id,
        organization_id: auth_invite.organization_id,
        workspace_id: auth_invite.workspace_id,
        role: auth_invite.role,
        email: auth_invite.email,
      })

    if (updated.length === 0) {
      // Diagnose why: was it already accepted / revoked / expired / not found?
      const [existing] = await db
        .select({
          status: auth_invite.status,
          expires_at: auth_invite.expires_at,
        })
        .from(auth_invite)
        .where(eq(auth_invite.token_hash, tokenHash))
        .limit(1)
      if (!existing) throw new InviteAcceptError("invite-not-found")
      if (existing.status === "accepted") {
        throw new InviteAcceptError("invite-already-accepted")
      }
      if (existing.status === "revoked") {
        throw new InviteAcceptError("invite-revoked")
      }
      if (existing.expires_at < new Date()) {
        throw new InviteAcceptError("invite-expired")
      }
      throw new InviteAcceptError("invite-not-found")
    }
    const inviteRow = updated[0]!

    // Defence-in-depth: the session user's email must match the invite's
    // recipient email. Even if the caller already checked this (the
    // welcome card does), enforcing it here guarantees no path can write
    // a membership for the wrong identity.
    const [userRow] = await db
      .select({ email: app_user.email })
      .from(app_user)
      .where(eq(app_user.id, input.userId))
      .limit(1)
    if (!userRow) {
      throw new InviteAcceptError("invite-not-found")
    }
    if (
      userRow.email.trim().toLowerCase() !==
      inviteRow.email.trim().toLowerCase()
    ) {
      throw new InviteAcceptError("invite-not-found")
    }

    const [org] = await db
      .select({
        id: organization.id,
        workspace_id: organization.workspace_id,
        slug: organization.slug,
      })
      .from(organization)
      .where(eq(organization.id, inviteRow.organization_id))
      .limit(1)
    if (!org) throw new InviteAcceptError("organization-not-found")
    // Workspace cross-check (F7): the workspace_id stored on the invite
    // row must match the organization's workspace_id.
    if (org.workspace_id !== inviteRow.workspace_id) {
      throw new InviteAcceptError("organization-not-found")
    }

    const [existingWsM] = await db
      .select({ id: workspace_membership.id })
      .from(workspace_membership)
      .where(
        and(
          eq(workspace_membership.workspace_id, org.workspace_id),
          eq(workspace_membership.user_id, input.userId),
          eq(workspace_membership.active, true),
        ),
      )
      .limit(1)

    let wsMembershipId: string
    if (existingWsM) {
      wsMembershipId = existingWsM.id
    } else {
      const [inserted] = await db
        .insert(workspace_membership)
        .values({
          workspace_id: org.workspace_id,
          user_id: input.userId,
          role: "member",
        })
        .returning()
      if (!inserted) {
        throw new Error("Could not create workspace membership.")
      }
      wsMembershipId = inserted.id
    }

    // The partial unique index on (organization_id, user_id) WHERE
    // active = true blocks an immediate duplicate. No-op if the row
    // already exists.
    const [existingOrgM] = await db
      .select({ id: organization_membership.id })
      .from(organization_membership)
      .where(
        and(
          eq(organization_membership.organization_id, org.id),
          eq(organization_membership.user_id, input.userId),
          eq(organization_membership.active, true),
        ),
      )
      .limit(1)

    if (!existingOrgM) {
      // auth_invite.role is varchar(64) (intentionally open for future
      // roles); organization_membership.role is an enum. The invite-issuer
      // validates against the enum at write time, so casting here is safe.
      await db.insert(organization_membership).values({
        organization_id: org.id,
        workspace_id: org.workspace_id,
        user_id: input.userId,
        workspace_membership_id: wsMembershipId,
        role: inviteRow.role as
          | "owner"
          | "admin"
          | "member"
          | "agent"
          | "guest",
      })
    }

    return org.slug
  })
}
