import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@workspace/auth/server"

import { HomeDashboard } from "../_components/workspace/home/home-dashboard"
import { getWorkspaceContext } from "./_lib/workspace-context"

export const metadata = {
  title: "Overview",
}

// `?error=` values the org layout redirects here on a failed org entry
// (`[orgSlug]/layout.tsx`). Surfaced as a toast on load so the signal isn't lost
// now that the standalone chooser (which never showed them) is gone.
const ERROR_MESSAGES: Record<string, string> = {
  "invalid-slug": "That workspace address isn't valid.",
  "no-access": "You don't have access to that organization.",
  internal: "Something went wrong. Please try again.",
}

/**
 * Workspace Home — the accountant-office overview dashboard, and the post-login
 * landing (`/` → `/workspace`). Replaces the old workspace chooser: the org
 * list moved to `/workspace/clients`, and switching workspaces moved to the
 * header `WorkspaceSwitcher`. The zero-workspace case is handled one level up in
 * `layout.tsx`, so `ctx.current` is present here.
 */
export default async function WorkspaceHomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/auth/login")

  const ctx = await getWorkspaceContext(session.user.id)
  if (!ctx.current) return null

  const { error } = await searchParams
  const errorMessage = error ? ERROR_MESSAGES[error] : undefined

  return (
    <HomeDashboard
      workspaceName={ctx.current.name}
      activeClients={ctx.current.clientCount}
      errorMessage={errorMessage}
    />
  )
}
