"use server"

import { and, asc, eq } from "drizzle-orm"
import { withOrganization, withOrgReadonly } from "@workspace/db"
import { favorite_page } from "@workspace/db/schema"

import { resolveMembership } from "@/lib/org/resolve"
import { getRequestSession } from "@/lib/org/session"

export interface ToggleFavoriteInput {
  /**
   * Org slug from the current route. A routing key, NOT a tenant id: it is
   * validated against the caller's own memberships (`resolveMembership` only
   * resolves orgs the user belongs to), so a forged slug is inert. The client
   * never supplies `organization_id` / `user_id` — those are derived here.
   */
  slug: string
  /** Org-relative orgHref path being (un)starred, e.g. 'records/invoices-received'. */
  route: string
  /** Rail module the page belongs to, e.g. 'records'. */
  module: string
  /** ContentHeader title snapshot shown in the favorites list. */
  label: string
}

export interface ToggleFavoriteResult {
  ok: boolean
  /** True when the page is now a favorite, false when it was removed. */
  favorited?: boolean
}

/**
 * Toggle the signed-in user's favorite for one org page.
 *
 * Tenancy is derived server-side: `userId` from the session, `organizationId`
 * from `resolveMembership({ slug, userId })` — the same (slug, userId) key the
 * org layout uses, so only an org the caller belongs to resolves. The write
 * runs under `withOrganization`, binding `app.organization_id` (+ `app.user_id`)
 * so the `favorite_page` FORCE-RLS `organization_isolation` policy is the tenant
 * boundary; the explicit `organization_id` filter is defense-in-depth.
 *
 * Toggle is delete-or-insert on (organization_id, user_id, page_route): a
 * present row is removed (returns `favorited: false`), an absent one inserted
 * (returns `favorited: true`), atomically within the one org-bound transaction.
 */
export async function toggleFavorite(
  input: ToggleFavoriteInput,
): Promise<ToggleFavoriteResult> {
  const route = input.route.trim()
  const moduleKey = input.module.trim()
  const label = input.label.trim()
  if (!route || !moduleKey || !label) return { ok: false }

  const session = await getRequestSession()
  const userId = session?.user?.id
  if (!userId) return { ok: false }

  const membership = await resolveMembership({ slug: input.slug, userId })
  if (!membership) return { ok: false }

  const { organizationId } = membership

  const favorited = await withOrganization(
    organizationId,
    userId,
    async (db) => {
      const removed = await db
        .delete(favorite_page)
        .where(
          and(
            eq(favorite_page.organization_id, organizationId),
            eq(favorite_page.user_id, userId),
            eq(favorite_page.page_route, route),
          ),
        )
        .returning({ id: favorite_page.id })
      if (removed.length > 0) return false

      await db.insert(favorite_page).values({
        organization_id: organizationId,
        user_id: userId,
        page_route: route,
        module_key: moduleKey,
        label,
      })
      return true
    },
  )

  return { ok: true, favorited }
}

/** One favorited page, projected for the module-overview cards. */
export interface FavoritePageRow {
  id: string
  /** Org-relative orgHref path, e.g. 'company/periods'. */
  route: string
  /** Rail module the page belongs to. */
  module: string
  /** ContentHeader title snapshot. */
  label: string
}

/**
 * List the signed-in user's favorited pages for one org, optionally narrowed to
 * a single rail module (the module-overview card read).
 *
 * Tenancy is derived server-side exactly like `toggleFavorite`: `userId` from
 * the session, `organizationId` from `resolveMembership({ slug, userId })` — so
 * only an org the caller belongs to resolves. The read runs under
 * `withOrgReadonly`, which binds `app.organization_id` (+ `app.user_id`) so the
 * `favorite_page` FORCE-RLS `organization_isolation` policy is the tenant
 * boundary AND issues `SET TRANSACTION READ ONLY` so the query provably cannot
 * mutate. The explicit `organization_id`/`user_id` filters are defense-in-depth.
 */
export async function listFavorites(input: {
  slug: string
  module?: string
}): Promise<FavoritePageRow[]> {
  const session = await getRequestSession()
  const userId = session?.user?.id
  if (!userId) return []

  const membership = await resolveMembership({ slug: input.slug, userId })
  if (!membership) return []

  const { organizationId } = membership
  const moduleKey = input.module?.trim()

  return withOrgReadonly(organizationId, userId, async (db) =>
    db
      .select({
        id: favorite_page.id,
        route: favorite_page.page_route,
        module: favorite_page.module_key,
        label: favorite_page.label,
      })
      .from(favorite_page)
      .where(
        and(
          eq(favorite_page.organization_id, organizationId),
          eq(favorite_page.user_id, userId),
          moduleKey ? eq(favorite_page.module_key, moduleKey) : undefined,
        ),
      )
      .orderBy(asc(favorite_page.sort_order), asc(favorite_page.created_at)),
  )
}

/**
 * Whether one org page is currently favorited by the signed-in user — the
 * initial state for a page's controlled favorite star. Same server-side
 * principal derivation + `withOrgReadonly` tenancy as `listFavorites`.
 */
export async function isFavorited(input: {
  slug: string
  route: string
}): Promise<boolean> {
  const route = input.route.trim()
  if (!route) return false

  const session = await getRequestSession()
  const userId = session?.user?.id
  if (!userId) return false

  const membership = await resolveMembership({ slug: input.slug, userId })
  if (!membership) return false

  const { organizationId } = membership

  return withOrgReadonly(organizationId, userId, async (db) => {
    const [row] = await db
      .select({ id: favorite_page.id })
      .from(favorite_page)
      .where(
        and(
          eq(favorite_page.organization_id, organizationId),
          eq(favorite_page.user_id, userId),
          eq(favorite_page.page_route, route),
        ),
      )
      .limit(1)
    return Boolean(row)
  })
}
