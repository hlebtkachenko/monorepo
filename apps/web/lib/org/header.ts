import "server-only"

import { and, asc, count, eq, ne } from "drizzle-orm"
import { withAdminBypass } from "@workspace/db"
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
 * All reads run under `withAdminBypass` with explicit id filters: the org GUC is
 * not bound in the layout (it is bound per server action / route handler), and
 * the org-switcher list spans workspaces so FORCE RLS would drop siblings. The
 * explicit equality filters are the tenant boundary.
 */

export interface HeaderUser {
  userName?: string
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
  return await withAdminBypass(async (db) => {
    const [counted] = await db
      .select({ count: count() })
      .from(organization_membership)
      .where(
        and(
          eq(organization_membership.organization_id, input.organizationId),
          eq(organization_membership.active, true),
        ),
      )

    const others = await db
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
      .limit(3)

    return {
      memberCount: counted?.count ?? 0,
      otherOrgs: others,
    }
  })
}
