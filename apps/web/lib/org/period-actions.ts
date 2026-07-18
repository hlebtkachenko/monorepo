"use server"

import { cookies, headers } from "next/headers"
import { auth } from "@workspace/auth/server"

import { PERIOD_COOKIE } from "./period"

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
