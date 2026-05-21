import type { ReactNode } from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@workspace/auth/server"

import { AppContextMenuClient } from "../_components/app-context-menu-client"

/**
 * Workspace tier layout.
 *
 * Real session validation against the Better Auth store: signed cookie,
 * not expired, user still exists. Edge proxy already does the optimistic
 * cookie-presence check; this is the durable Node-runtime gate.
 *
 * Wraps every route under `/workspace/*` (chooser, settings, billing,
 * profile, onboarding when added). Mirrors `[orgSlug]/layout.tsx` in
 * mounting the in-app right-click context menu so the same Sidekick /
 * About / Report-bug / Copy-path actions are available on every
 * authenticated app surface — no org slug here since the workspace
 * scope is the accountant office, not a tenant book.
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
  return (
    <AppContextMenuClient
      user={{ id: session.user.id, email: session.user.email }}
    >
      {children}
    </AppContextMenuClient>
  )
}
