import "server-only"
import { and, eq } from "drizzle-orm"
import { consumeToken } from "@workspace/auth/tokens"
import { withAdminBypass } from "@workspace/db"
import {
  app_user,
  organization,
  organization_membership,
  workspace_membership,
  type OrganizationRole,
} from "@workspace/db/schema"

/**
 * Shared helper for accept-invite flows.
 *
 * Atomically redeems the invite's `auth_token` row (kind='inv', flips
 * `pending` → `consumed` in the same UPDATE that returns the payload)
 * and materializes `workspace_membership` + `organization_membership`
 * for the accepting user.
 *
 * Replaces the previous flow that flipped a separate `auth_invite` row
 * — that table was dropped in migration 0020. The single auth_token row
 * is the source of truth for an invite's lifecycle.
 *
 * Runs under `withAdminBypass` (consumeToken does the same internally
 * for the row update) because no tenancy context is bound at this point
 * (the user has no `app.organization_id` GUC yet).
 *
 * Lifecycle:
 *   issue   →  auth_token (status='pending', kind='inv', payload carries
 *              email + organizationId + workspaceId + role)
 *   accept  →  this function: consumeToken returns payload + flips status
 *              to 'consumed'. If consumeToken returns null, throws an
 *              InviteAcceptError so the caller can render a generic error.
 *              The subsequent membership writes run in a fresh transaction
 *              (organization lookup + insert). If a membership write fails,
 *              the token row stays `consumed` — re-attempts cannot replay
 *              the same token.
 *
 * Contract: callers pass only the accepting user id and the raw token.
 * `role`, `organization_id`, `workspace_id`, and `email` are read off
 * the auth_token payload so a caller cannot inject a different role via
 * parameter manipulation.
 *
 * Returns the organization slug so the caller can redirect to /[orgSlug].
 */
export interface MaterializeInviteInput {
  /** Better Auth user id of the accepting user. */
  userId: string
  /** Raw invite token from the URL/cookie. */
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

interface InvitePayload {
  email?: string
  organizationId?: string
  workspaceId?: string
  role?: string
}

export async function materializeInvite(
  input: MaterializeInviteInput,
): Promise<string> {
  // consumeToken returns null on any failure mode (expired, revoked,
  // wrong kind, format mismatch, already consumed). We deliberately do
  // NOT distinguish those externally; one generic error code propagates
  // back to the UI. Callers that need the finer-grained reason should
  // peek with `readInviteByRawToken` BEFORE calling this helper.
  const consumed = await consumeToken<InvitePayload>({
    rawToken: input.inviteRawToken,
    expectedKind: "inv",
  })
  if (!consumed) {
    throw new InviteAcceptError("invite-not-found")
  }

  const email = consumed.payload.email
  const organizationId = consumed.payload.organizationId
  const workspaceId = consumed.payload.workspaceId
  const role = consumed.payload.role
  if (!email || !organizationId || !workspaceId || !role) {
    throw new InviteAcceptError("invite-not-found")
  }

  return await withAdminBypass(async (db) => {
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
    if (userRow.email.trim().toLowerCase() !== email.trim().toLowerCase()) {
      throw new InviteAcceptError("invite-not-found")
    }

    const [org] = await db
      .select({
        id: organization.id,
        workspace_id: organization.workspace_id,
        slug: organization.slug,
      })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1)
    if (!org) throw new InviteAcceptError("organization-not-found")
    // Workspace cross-check (F7): the workspace_id stored on the invite
    // payload must match the organization's workspace_id.
    if (org.workspace_id !== workspaceId) {
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
      await db.insert(organization_membership).values({
        organization_id: org.id,
        workspace_id: org.workspace_id,
        user_id: input.userId,
        workspace_membership_id: wsMembershipId,
        role: role as OrganizationRole,
      })
    }

    return org.slug
  })
}
