import "server-only"
import { createHash } from "node:crypto"
import { and, eq } from "drizzle-orm"
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
 * Creates (or reuses) `workspace_membership` and `organization_membership`
 * rows for the user joining `organizationId`, and inserts a matching
 * `auth_invite` row with `status='accepted'` for the audit trail.
 *
 * Runs under `withAdminBypass` because no tenancy context is bound at
 * this point (the user has no `app.organization_id` GUC yet).
 *
 * Returns the organization slug so the caller can redirect to /[orgSlug].
 */
export interface MaterializeInviteInput {
  /** Organization the user is joining (from the invite token's claims). */
  organizationId: string
  /** Organization role to assign on accept. */
  role: "owner" | "admin" | "member" | "agent" | "guest"
  /** Better Auth user id of the accepting user. */
  userId: string
  /** Issued JWT (raw string) — hashed for the audit-trail token_hash. */
  inviteJwt: string
  /** Email recorded on the invite (from the JWT claims). */
  email: string
  /** Optional: user id of the issuer (only known to the issuer, not the cookie). */
  issuedByUserId?: string
}

export async function materializeInvite(
  input: MaterializeInviteInput,
): Promise<string> {
  const tokenHash = sha256(input.inviteJwt)

  return await withAdminBypass(async (db) => {
    const [org] = await db
      .select({
        id: organization.id,
        workspace_id: organization.workspace_id,
        slug: organization.slug,
      })
      .from(organization)
      .where(eq(organization.id, input.organizationId))
      .limit(1)
    if (!org) {
      throw new Error("Organization not found for invite.")
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
    // active = true blocks the immediate duplicate. Surface that as a
    // "already a member" no-op rather than a thrown error.
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

    // Audit-trail invite row. Recording acceptance regardless of whether
    // a `pending` row was pre-created — the unique constraint on
    // token_hash blocks replay of the same JWT.
    try {
      await db
        .insert(auth_invite)
        .values({
          organization_id: org.id,
          workspace_id: org.workspace_id,
          token_hash: tokenHash,
          email: input.email,
          role: input.role,
          status: "accepted",
          issued_by_user_id: input.issuedByUserId ?? null,
          // JWT TTL is 7 days; this expires_at mirrors that so the row
          // stays self-describing even if the JWT-side TTL changes.
          expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
          accepted_at: new Date(),
          accepted_by_user_id: input.userId,
        })
        .onConflictDoNothing({ target: auth_invite.token_hash })
    } catch (err) {
      // Don't fail the whole accept on the audit insert — but log so a
      // missed row is debuggable later.
      console.error("[materializeInvite] audit insert failed", err)
    }

    return org.slug
  })
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex")
}
