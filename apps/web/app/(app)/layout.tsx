import type { ReactNode } from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@workspace/auth/server"

/**
 * (app) route group — session-required.
 *
 * Edge middleware already redirected unauthenticated callers to /auth/login,
 * but middleware only checks cookie presence. This layout does the real
 * session validation against the Better Auth store: signed cookie, not
 * expired, user still exists.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect("/auth/login")
  }
  return <>{children}</>
}
