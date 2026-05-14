import { headers } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import { eq, and } from "drizzle-orm"
import { auth } from "@workspace/auth/server"
import { withAdminBypass } from "@workspace/db"
import {
  workspace,
  workspace_membership,
  organization,
  organization_membership,
} from "@workspace/db/schema"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { AccountMenu } from "../auth/_components/account-menu"

export const metadata = {
  title: "Your workspaces",
}

interface WorkspaceRow {
  id: string
  display_name: string
  onboarding_completed_at: Date | null
  role: "owner" | "admin" | "member" | "guest"
  organizations: { id: string; slug: string; legal_name: string }[]
}

export default async function WorkspaceChooserPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect("/auth/login")
  }

  const workspaces = await listWorkspacesForUser(session.user.id)
  if (workspaces.length === 0) {
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 py-12">
        <Card>
          <CardHeader>
            <CardTitle>No workspaces yet</CardTitle>
            <CardDescription>
              Your account is not linked to a workspace. Ask support to send you
              an invitation to get started.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Signed in as {session.user.email}.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-12">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1>Your workspaces</h1>
          <p className="text-sm text-muted-foreground">
            Pick a workspace to enter, or open one of its organizations.
          </p>
        </div>
        <AccountMenu email={session.user.email} />
      </header>
      <nav className="flex flex-wrap gap-2 text-sm">
        <Button asChild variant="outline" size="sm">
          <Link href="/workspace/inbox">Inbox</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/workspace/profile">Profile</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/workspace/settings">Workspace settings</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/workspace/billing">Billing</Link>
        </Button>
      </nav>
      <div className="grid gap-4">
        {workspaces.map((ws) => (
          <Card key={ws.id}>
            <CardHeader>
              <CardTitle>{ws.display_name}</CardTitle>
              <CardDescription>{ws.role}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {ws.organizations.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No organizations yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {ws.organizations.map((org) => (
                    <li
                      key={org.id}
                      className="flex items-center justify-between"
                    >
                      <span>{org.legal_name}</span>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/${org.slug}`}>Open</Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/workspace/settings?ws=${ws.id}`}>Settings</Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/workspace/billing?ws=${ws.id}`}>Billing</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

async function listWorkspacesForUser(userId: string): Promise<WorkspaceRow[]> {
  return await withAdminBypass(async (db) => {
    const memberships = await db
      .select({
        workspaceId: workspace.id,
        displayName: workspace.display_name,
        onboardingAt: workspace.onboarding_completed_at,
        role: workspace_membership.role,
      })
      .from(workspace_membership)
      .innerJoin(workspace, eq(workspace.id, workspace_membership.workspace_id))
      .where(
        and(
          eq(workspace_membership.user_id, userId),
          eq(workspace_membership.active, true),
        ),
      )

    const out: WorkspaceRow[] = []
    for (const m of memberships) {
      const orgs = await db
        .select({
          id: organization.id,
          slug: organization.slug,
          legal_name: organization.legal_name,
        })
        .from(organization_membership)
        .innerJoin(
          organization,
          eq(organization.id, organization_membership.organization_id),
        )
        .where(
          and(
            eq(organization_membership.user_id, userId),
            eq(organization_membership.workspace_id, m.workspaceId),
            eq(organization_membership.active, true),
          ),
        )
      out.push({
        id: m.workspaceId,
        display_name: m.displayName,
        onboarding_completed_at: m.onboardingAt,
        role: m.role,
        organizations: orgs,
      })
    }
    return out
  })
}
