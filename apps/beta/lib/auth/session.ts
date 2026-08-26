import "server-only"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"

import { betaDb } from "@/db/client"
import { app_user } from "@/db/schema"

import { betaAuth } from "./server"

/**
 * Server-side session access. There is no middleware and no cookie peek: the
 * gate reads `auth_session` on every request.
 *
 * That is a deliberate trade. The cheap alternative — `getSessionCookie()` in
 * middleware — is exactly the hole Advisor blocker B4-2 describes: it matches
 * on Better Auth's DEFAULT cookie prefix, so the main product's domain-wide
 * `.afframe.com` session cookie, which arrives at this host on every request,
 * would satisfy it. Beta names its cookie `__Host-beta-auth.session_token`
 * (`policy.ts`), which that helper cannot even see. Reading the session through
 * Better Auth means the token is verified against beta's own signing secret and
 * looked up in beta's own table — a prod cookie is not a session here, it is
 * noise.
 */

export type BetaSession = {
  userId: string
  email: string
  name: string
}

export async function getBetaSession(): Promise<BetaSession | null> {
  // Read the request headers FIRST. Every caller is a page or layout, and this
  // call is what tells Next the route is per-request: `betaAuth()` builds the
  // database handle eagerly, so touching it before `headers()` would make a
  // prerender pass fail on a missing DATABASE_URL instead of bailing out to
  // dynamic rendering.
  const requestHeaders = await headers()
  const session = await betaAuth().api.getSession({ headers: requestHeaders })
  if (!session) return null

  // Sessions outlive a deactivation: `disabled_at` is set by /admin (PR 08) and
  // the existing cookie would otherwise keep working until it expires. The
  // session-create hook in `server.ts` blocks NEW sessions; this blocks live
  // ones. One extra read per request, on an indexed primary key.
  const [user] = await betaDb()
    .select({ disabled_at: app_user.disabled_at })
    .from(app_user)
    .where(eq(app_user.id, session.user.id))
    .limit(1)

  if (!user || user.disabled_at !== null) return null

  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
  }
}

/** Portal guard. Unauthenticated visitors never reach a portal page body. */
export async function requireBetaSession(): Promise<BetaSession> {
  const session = await getBetaSession()
  if (!session) redirect("/sign-in")
  return session
}
