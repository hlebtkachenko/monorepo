import type { ReactNode } from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@workspace/auth/server"

/**
 * Workspace tier layout.
 *
 * Real session validation against the Better Auth store: signed cookie,
 * not expired, user still exists. Edge proxy already does the optimistic
 * cookie-presence check; this is the durable Node-runtime gate.
 *
 * Wraps every route under `/workspace/*` (chooser, settings, billing,
 * profile, onboarding when added).
 */
export default async function WorkspaceLayout({
  children,
}: {
  children: ReactNode
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect("/auth/login")
  }
  return <>{children}</>
}
