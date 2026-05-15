import "server-only"
import { createHash } from "node:crypto"
import { and, eq, sql } from "drizzle-orm"
import { withAdminBypass } from "@workspace/db"
import {
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
 *              token_hash=? AND status='pending' RETURNING id
 *              → if 0 rows updated, the invite is already-accepted,
 *                revoked, or expired → throw.
 *   revoke  →  see issue-invite.ts `revokePendingInvites`.
 *
 * Returns the organization slug so the caller can redirect to /[orgSlug].
 */
export interface MaterializeInviteInput {
  /** Organization the user is joining (from the invite record). */
  organizationId: string
  /** Organization role to assign on accept. */
  role: "owner" | "admin" | "member" | "agent" | "guest"
  /** Better Auth user id of the accepting user. */
  userId: string
  /** Raw invite token from the URL/cookie — hashed for the DB lookup. */
  inviteRawToken: string
  /** Email recorded on the invite (from the auth_invite row). */
  email: string
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
  const tokenHash = sha256(input.inviteRawToken)

  return await withAdminBypass(async (db) => {
    // Atomic check-and-set: only one accept can succeed per token.
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
          // expires_at > now()  — let expired tokens fail explicitly
          sql`${auth_invite.expires_at} > now()`,
        ),
      )
      .returning({
        id: auth_invite.id,
        organization_id: auth_invite.organization_id,
        workspace_id: auth_invite.workspace_id,
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

    const [org] = await db
      .select({
        id: organization.id,
        workspace_id: organization.workspace_id,
        slug: organization.slug,
      })
      .from(organization)
      .where(eq(organization.id, input.organizationId))
      .limit(1)
    if (!org) throw new InviteAcceptError("organization-not-found")
    if (org.id !== inviteRow.organization_id) {
      // Defense-in-depth: the JWT claim must match the row's
      // organization_id. Mismatch implies tampering or a token from
      // another org being replayed here.
      throw new InviteAcceptError("invite-not-found")
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
      await db.insert(organization_membership).values({
        organization_id: org.id,
        workspace_id: org.workspace_id,
        user_id: input.userId,
        workspace_membership_id: wsMembershipId,
        role: input.role,
      })
    }

    return org.slug
  })
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex")
}
