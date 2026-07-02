import type { ReactNode } from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@workspace/auth/server"
import { getBuildVersion } from "@workspace/ui/brand-assets"
import { AppHeader } from "@workspace/ui/blocks/app-header"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { AppContextMenuClient } from "../_components/app-context-menu-client"
import { OrgHeaderActions } from "../_components/org-header-actions"
import { WorkspaceShell } from "../_components/workspace-shell"
import { WorkspaceSwitcherClient } from "../_components/workspace-switcher"
import { AccountMenu } from "../auth/_components/account-menu"
import {
  getWorkspaceContext,
  getWorkspaceHeaderUser,
  type WorkspaceRole,
} from "./_lib/workspace-context"

// DB role enum → human-readable label shown in the workspace switcher.
const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
}

/**
 * Workspace tier layout — the accountant-office shell.
 *
 * Real session validation against the Better Auth store (the edge proxy only
 * does the optimistic cookie-presence check). Resolves the active workspace +
 * the user's other workspaces, builds the persistent `AppHeader` node
 * server-side (it needs the session + an avatar presign), and mounts the
 * persistent `WorkspaceShell` once so the rail/sidebar/chrome stay put while the
 * page bodies under `/workspace/*` swap.
 *
 * A user with no active workspace membership can't be shown an office, so this
 * short-circuits to a centered empty state (with a sign-out affordance) instead
 * of the shell — the single home for the zero-workspace case across every
 * `/workspace/*` route.
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

  const ctx = await getWorkspaceContext(session.user.id)

  if (ctx.hasNoWorkspace || !ctx.current) {
    return (
      <AppContextMenuClient
        user={{ id: session.user.id, email: session.user.email }}
      >
        <div className="mx-auto max-w-md space-y-4 px-4 py-12">
          <header className="flex items-start justify-between gap-4">
            <h1 className="text-xl font-semibold">No workspace yet</h1>
            <AccountMenu email={session.user.email} />
          </header>
          <Card>
            <CardHeader>
              <CardTitle>You are not part of a workspace</CardTitle>
              <CardDescription>
                Your account is not linked to an accounting workspace yet. Ask
                support to send you an invitation to get started.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Signed in as {session.user.email}.
              </p>
            </CardContent>
          </Card>
        </div>
      </AppContextMenuClient>
    )
  }

  const { userName, userImage } = await getWorkspaceHeaderUser(
    session.user.id,
    session.user.email,
  )

  const header = (
    <AppHeader
      leftContent={
        <WorkspaceSwitcherClient
          currentWorkspace={{
            id: ctx.current.id,
            name: ctx.current.name,
            role: ROLE_LABELS[ctx.current.role],
            clientCount: ctx.current.clientCount,
          }}
          otherWorkspaces={ctx.others.map((w) => ({ id: w.id, name: w.name }))}
        />
      }
      actions={
        <OrgHeaderActions
          userName={userName}
          userImage={userImage}
          version={getBuildVersion()}
        />
      }
    />
  )

  return (
    <AppContextMenuClient
      user={{ id: session.user.id, email: session.user.email }}
    >
      <WorkspaceShell header={header}>{children}</WorkspaceShell>
    </AppContextMenuClient>
  )
}
