import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { auth } from "@workspace/auth/server"

import type { StepUpLevel } from "@/lib/capabilities"
import { safeNextPath } from "@/lib/safe-next-path"

import { StepUpForm } from "./step-up-form"

/**
 * Step-up reauth page. Reached via `requireStepUp()` redirect from a
 * gated layout or server action. Always renders inside the unauthenticated
 * auth shell; the user is already signed in (otherwise we send them to
 * `/auth/login`).
 *
 * Query params:
 *   level=password|twofa   — which factor is required
 *   return=<path>          — where to land after success (sanitized
 *                            again in the server action)
 */
export default async function StepUpPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string; return?: string }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect("/auth/login")
  }

  const sp = await searchParams
  const level: StepUpLevel = sp.level === "twofa" ? "twofa" : "password"
  const next = safeNextPath(sp.return)

  return <StepUpForm level={level} next={next} email={session.user.email} />
}
