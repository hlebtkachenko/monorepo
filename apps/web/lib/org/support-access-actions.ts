"use server"

import { and, eq, isNull, sql } from "drizzle-orm"
import {
  withAdminBypass,
  withOrganization,
  writeAuditEventGlobal,
} from "@workspace/db"
import { impersonation, organization } from "@workspace/db/schema"

import { resolveMembership } from "@/lib/org/resolve"
import { getRequestSession } from "@/lib/org/session"

export interface SetSupportAccessResult {
  ok: boolean
}

/**
 * Toggle per-org support-access consent (F11).
 *
 * The consent flag (`organization.support_access_expires_at`) is the
 * precondition an admin operator's impersonation session requires to sign in to
 * this org: no active grant → the admin console refuses. `on` writes a 7-day
 * window (the outer bound; each impersonation session still has its own 30-min
 * TTL); `off` clears it AND force-ends any live impersonation row for the org so
 * an operator already inside is cut immediately.
 *
 * Tenancy + authz are derived server-side, never from the client: `userId` from
 * the session, `organizationId` + `role` from `resolveMembership({ slug, userId })`
 * (the same (slug, userId) key the org layout uses, so only an org the caller
 * belongs to resolves). Only an owner/admin may toggle — a member/agent/guest is
 * refused. The `organization` write runs under `withOrganization` (FORCE RLS is
 * the tenant boundary); the impersonation force-end runs under `withAdminBypass`
 * because `impersonation` is admin-bypass-only (app_user has no grant on it).
 *
 * Every grant/revoke is audited via `writeAuditEventGlobal` (admin bypass): the
 * org owner giving consent may not be a workspace member, so the
 * workspace-membership-gated `audit_event_insert` RLS policy can't be relied on
 * from inside `withOrganization`.
 */
export async function setSupportAccess(
  slug: string,
  on: boolean,
): Promise<SetSupportAccessResult> {
  const session = await getRequestSession()
  const userId = session?.user?.id
  if (!userId) return { ok: false }

  const membership = await resolveMembership({ slug, userId })
  // Owner/admin write-gate — mirrors authorizeOrgAdmin without reaching into the
  // frozen old tree (the org-tree wall).
  if (
    !membership ||
    (membership.role !== "owner" && membership.role !== "admin")
  ) {
    return { ok: false }
  }

  const { organizationId, workspaceId } = membership

  await withOrganization(organizationId, userId, async (db) => {
    await db
      .update(organization)
      .set({
        support_access_expires_at: on ? sql`now() + interval '7 days'` : null,
      })
      .where(eq(organization.id, organizationId))
  })

  // Revoke cuts any live operator session for this org immediately.
  if (!on) {
    await withAdminBypass(async (db) => {
      await db
        .update(impersonation)
        .set({ ended_at: sql`now()` })
        .where(
          and(
            eq(impersonation.organization_id, organizationId),
            isNull(impersonation.ended_at),
          ),
        )
    })
  }

  await writeAuditEventGlobal({
    workspaceId,
    organizationId,
    actorUserId: userId,
    action: on ? "org.support_access.granted" : "org.support_access.revoked",
    payload: on ? { window: "7 days" } : {},
  })

  return { ok: true }
}
