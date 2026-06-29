import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"

import { auth } from "@workspace/auth/server"
import { withAdminBypass } from "@workspace/db"
import { app_user } from "@workspace/db/schema"

import { safeNextPath } from "@/lib/safe-next-path"

import { StepUpForm } from "./step-up-form"

/**
 * Step-up reauth page. Reached via `requireStepUp()` redirect from a
 * gated layout or server action. Always renders inside the unauthenticated
 * auth shell; the user is already signed in (otherwise we send them to
 * `/auth/login`).
 *
 * Query params:
 *   return=<path>          — where to land after success (sanitized
 *                            again in the server action)
 *
 * The required factor is NOT taken from the URL: whether a TOTP code is
 * collected (and enforced in the action) is driven by the operator's 2FA
 * enrollment, read server-side. The per-resource password/twofa requirement
 * is enforced downstream by `requireStepUp` against the minted cookie.
 */
export default async function StepUpPage({
  searchParams,
}: {
  searchParams: Promise<{ return?: string }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect("/auth/login")
  }

  const sp = await searchParams
  const next = safeNextPath(sp.return)

  const twoFactorEnrolled = await withAdminBypass(async (db) => {
    const [u] = await db
      .select({ enabled: app_user.two_factor_enabled })
      .from(app_user)
      .where(eq(app_user.id, session.user.id))
      .limit(1)
    return u?.enabled ?? false
  })

  return (
    <StepUpForm
      twoFactorEnrolled={twoFactorEnrolled}
      next={next}
      email={session.user.email}
    />
  )
}
