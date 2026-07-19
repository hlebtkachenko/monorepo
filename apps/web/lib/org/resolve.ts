import "server-only"

import { and, asc, eq } from "drizzle-orm"
import { withAdminBypass, type OrganizationRole } from "@workspace/db"
import { organization, organization_membership } from "@workspace/db/schema"
import { RESERVED_SLUGS } from "@workspace/org-provisioning"

/**
 * Org-slug resolution + membership check for the rebuilt org tree.
 *
 * Owned by the new tree (`apps/web/lib/org/`) so it never imports the frozen
 * old tree. Mirrors the inline logic in `[orgSlug]/layout.tsx`; the old tree
 * keeps its own copy (frozen, deleted at the flip).
 */

/**
 * Mirrors the DB CHECK on `organization.slug`:
 *   slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'  (letters or digits, dashes inside)
 * The single-char form the regex permits is rejected by the DB length CHECK; we
 * still accept it here so an out-of-range slug resolves like a non-existent org
 * (`resolveMembership` returns null) rather than a separate error path.
 */
const SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/

/**
 * True when `slug` could legitimately be an org slug — passes the shape check
 * and is not a reserved routing/brand word (the shared org-provisioning set,
 * which now includes the temporary `o` tree prefix). Bot scans for `/admin`,
 * `/wp-admin`, etc. short-circuit here before touching Postgres.
 */
export function isResolvableOrgSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && !RESERVED_SLUGS.has(slug)
}

export interface ResolvedMembership {
  organizationId: string
  workspaceId: string
  legalName: string
  role: OrganizationRole
}

/**
 * Resolve `:orgSlug` → the signed-in user's membership, or null when the slug
 * doesn't exist or the user has no active membership.
 *
 * `organization.slug` is UNIQUE per `(workspace_id, slug)`, so the same slug can
 * repeat across workspaces. Joining membership in the same query keys the lookup
 * on `(slug, user_id, active)` — the only org resolvable is by definition one
 * the user belongs to. Runs under `withAdminBypass`: the slug→org lookup spans
 * workspaces, so a `withOrganization` read would have no GUC to scope by.
 */
export async function resolveMembership(input: {
  slug: string
  userId: string
}): Promise<ResolvedMembership | null> {
  // rls-allow-admin-bypass: cross-workspace slug→org lookup runs before any org id/GUC exists (org.slug is unique only per workspace).
  return await withAdminBypass(async (db) => {
    const [row] = await db
      .select({
        organization_id: organization.id,
        workspace_id: organization.workspace_id,
        legal_name: organization.legal_name,
        role: organization_membership.role,
      })
      .from(organization)
      .innerJoin(
        organization_membership,
        and(
          eq(organization_membership.organization_id, organization.id),
          eq(organization_membership.user_id, input.userId),
          eq(organization_membership.active, true),
        ),
      )
      .where(eq(organization.slug, input.slug))
      // Deterministic pick when a slug repeats across workspaces the user
      // belongs to (org.slug is unique only per workspace): without an order,
      // the layout could bind tenancy to a non-deterministic row.
      .orderBy(asc(organization.id))
      .limit(1)
    if (!row) return null

    return {
      organizationId: row.organization_id,
      workspaceId: row.workspace_id,
      legalName: row.legal_name,
      role: row.role,
    }
  })
}
