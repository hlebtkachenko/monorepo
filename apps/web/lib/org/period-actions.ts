"use server"

import { cookies, headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { auth } from "@workspace/auth/server"
import { withOrganization } from "@workspace/db"
import { accounting_period } from "@workspace/db/schema"

import { orgHref } from "./href"
import { PERIOD_COOKIE } from "./period"
import { resolveMembership } from "./resolve"
import { getRequestSession } from "./session"

/** Max length of a user-entered period code — a short label, not free text. */
const ZKRATKA_MAX = 32

// Boundary validation: a uuid shape for the period id so an arbitrary string
// can't be stored in the year-long cookie. The READ side is the real tenant
// boundary — `getActivePeriod` only honors an id that belongs to the org's
// periods — so this writer just needs a signed-in caller; a bogus or cross-org
// id is inert.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Persist the active period as the signed-in user's sticky default.
 *
 * The rebuilt period switch drives the active period through the URL
 * (`router.push(orgHref(slug, path, { period }))`), which re-renders the layout
 * and pages — the navigation IS the switch. This action only writes the cookie
 * so the choice survives a plain navigation with no `?period=` and the next
 * visit; it is best-effort persistence, never the authoritative selection.
 */
export async function setPeriodDefault(
  periodId: string,
): Promise<{ ok: boolean }> {
  if (!UUID_RE.test(periodId)) return { ok: false }

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return { ok: false }

  const cookieStore = await cookies()
  cookieStore.set(PERIOD_COOKIE, periodId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  })
  return { ok: true }
}

/**
 * Set the editable short code (zkratka) of one accounting period.
 *
 * Tenancy is derived server-side like `listFavorites`/`toggleFavorite`: `userId`
 * from the session, `organizationId` from `resolveMembership({ slug, userId })`
 * (only an org the caller belongs to resolves). The write runs under
 * `withOrganization`, so the `accounting_period` FORCE-RLS policy is the tenant
 * boundary; the explicit `organization_id` filter is defense-in-depth and the
 * `id` filter targets the one row. `slug` is a routing key, never a tenant id.
 * Revalidates the Periods list so the stored value replaces the derived default.
 */
export async function updatePeriodZkratka(input: {
  slug: string
  periodId: string
  zkratka: string
}): Promise<{ ok: boolean }> {
  if (!UUID_RE.test(input.periodId)) return { ok: false }
  const zkratka = input.zkratka.trim()
  if (!zkratka || zkratka.length > ZKRATKA_MAX) return { ok: false }

  const session = await getRequestSession()
  const userId = session?.user?.id
  if (!userId) return { ok: false }

  const membership = await resolveMembership({ slug: input.slug, userId })
  if (!membership) return { ok: false }
  const { organizationId } = membership

  await withOrganization(organizationId, userId, async (db) => {
    await db
      .update(accounting_period)
      .set({ zkratka })
      .where(
        and(
          eq(accounting_period.id, input.periodId),
          eq(accounting_period.organization_id, organizationId),
        ),
      )
  })

  revalidatePath(orgHref(input.slug, "closing/periods"))
  return { ok: true }
}
