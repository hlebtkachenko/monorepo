"use server"

import { cookies, headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@workspace/auth/server"

import { PERIOD_COOKIE } from "./header-periods"

// Mirrors the org-slug DB CHECK (see [orgSlug]/layout.tsx) + a uuid shape for
// the period id — boundary validation so an arbitrary path cannot reach
// revalidatePath and an arbitrary string cannot be stored in the year-long
// cookie. The READ side still re-validates the id against the org's periods.
const SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Persist the active accounting period for the signed-in user.
 *
 * The selection lives in an httpOnly cookie read by the org layout
 * (`resolveActivePeriodId`). The READ side is the tenant boundary — it only
 * honors the cookie when the id belongs to the current org's periods — so this
 * writer just needs a signed-in caller; a bogus or cross-org id is inert.
 */
export async function setActivePeriodAction(
  slug: string,
  periodId: string,
): Promise<{ ok: boolean }> {
  if (!SLUG_RE.test(slug) || !UUID_RE.test(periodId)) return { ok: false }

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
  // Re-render the org layout so the server-resolved active period matches the
  // cookie on the next navigation (the client holds optimistic state meanwhile).
  revalidatePath(`/${slug}`, "layout")
  return { ok: true }
}
