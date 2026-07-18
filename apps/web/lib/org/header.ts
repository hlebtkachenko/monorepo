import "server-only"

import { and, asc, count, eq, ne, sql } from "drizzle-orm"
import { withAdminBypass, withOrgReadonly } from "@workspace/db"
import {
  app_user,
  organization,
  organization_membership,
} from "@workspace/db/schema"

import { presignAvatarRead } from "@/app/_lib/avatar-storage"

/**
 * App-shell header data for the rebuilt org tree — the signed-in user's
 * identity and the org-switcher's org list. Owned by the new tree
 * (`apps/web/lib/org/`); mirrors the inline `getHeaderUser` + `_lib/header-org`
 * from the frozen old tree.
 *
 * `memberCount` runs under `withOrgReadonly` (FORCE RLS is the tenant boundary,
 * with an explicit filter for defense-in-depth, in a read-only transaction).
 * `otherOrgs` spans workspaces, so it must stay under `withAdminBypass` — FORCE
 * RLS would drop every sibling. `getHeaderUser` reads the single signed-in
 * user's own row under `withAdminBypass` (global identity, no org scope).
 */

export interface HeaderUser {
  userName: string
  userImage?: string
}

/**
 * Resolve the signed-in user's display name + avatar. `avatar_url` is a
 * private-bucket S3 key resolved to a presigned GET URL; falls back to the
 * Better Auth `image`. Initials are derived client-side when both are absent.
 */
export async function getHeaderUser(
  userId: string,
  email: string,
): Promise<HeaderUser> {
  // rls-allow-admin-bypass: global app_user identity read, no org scope.
  const row = await withAdminBypass(async (db) => {
    const [r] = await db
      .select({
        name: app_user.name,
        display_name: app_user.display_name,
        image: app_user.image,
        avatar_url: app_user.avatar_url,
      })
      .from(app_user)
      .where(eq(app_user.id, userId))
      .limit(1)
    return r ?? null
  })
  const presigned = await presignAvatarRead(row?.avatar_url ?? null)
  return {
    userName: row?.display_name || row?.name || email,
    userImage: presigned ?? row?.image ?? undefined,
  }
}

export interface HeaderOrgData {
  /** Active member count for the current org (drives "· N Members"). */
  memberCount: number
  /**
   * True when this org currently grants admin support access — i.e.
   * `support_access_expires_at` is in the future. Drives the header
   * Support-access toggle's checked state (F11).
   */
  supportAccessActive: boolean
  /**
   * Up to 3 other orgs the user actively belongs to, across every workspace,
   * excluding the current one. There is no `last_accessed_at` column, so the
   * order is deterministic-by-name, not true recency.
   */
  otherOrgs: { id: string; slug: string; name: string }[]
}

export async function getHeaderOrgData(input: {
  organizationId: string
  userId: string
}): Promise<HeaderOrgData> {
  const [orgScoped, otherOrgs] = await Promise.all([
    // Current-org reads under FORCE RLS: withOrgReadonly binds
    // app.organization_id + app.user_id in a read-only tx. The member count
    // relies on org_membership_org_read (a proven member may count the current
    // org's members); the support-access flag reads the org's own row, visible
    // under organization_isolation. Explicit filters are defense-in-depth.
    withOrgReadonly(input.organizationId, input.userId, async (db) => {
      const [counted] = await db
        .select({ count: count() })
        .from(organization_membership)
        .where(
          and(
            eq(organization_membership.organization_id, input.organizationId),
            eq(organization_membership.active, true),
          ),
        )
      const [org] = await db
        .select({
          // NULL / past → false; a future timestamp → true (evaluated in SQL to
          // avoid app-vs-DB clock skew).
          supportAccessActive: sql<boolean>`(${organization.support_access_expires_at} > now())`,
        })
        .from(organization)
        .where(eq(organization.id, input.organizationId))
        .limit(1)
      return {
        memberCount: counted?.count ?? 0,
        supportAccessActive: org?.supportAccessActive ?? false,
      }
    }),
    // Org-switcher list spans workspaces, so it must bypass RLS — FORCE RLS
    // would scope it to the current org and drop every sibling.
    // rls-allow-admin-bypass: cross-workspace org-switcher list; a single-org bind drops siblings.
    withAdminBypass(async (db) =>
      db
        .select({
          id: organization.id,
          slug: organization.slug,
          name: organization.legal_name,
        })
        .from(organization_membership)
        .innerJoin(
          organization,
          eq(organization.id, organization_membership.organization_id),
        )
        .where(
          and(
            eq(organization_membership.user_id, input.userId),
            eq(organization_membership.active, true),
            ne(organization.id, input.organizationId),
          ),
        )
        .orderBy(asc(organization.legal_name))
        .limit(3),
    ),
  ])

  return {
    memberCount: orgScoped.memberCount,
    supportAccessActive: orgScoped.supportAccessActive,
    otherOrgs,
  }
}
