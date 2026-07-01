import "server-only"

import { notFound } from "next/navigation"
import Link from "next/link"
import { and, count, eq } from "drizzle-orm"

import { withAdminBypass } from "@workspace/db"
import {
  app_user,
  auth_session,
  organization,
  organization_membership,
  two_factor,
  workspace,
  workspace_membership,
} from "@workspace/db/schema"
import { Badge } from "@workspace/ui/components/badge"

import { Section } from "@/app/(gated)/_components"
import { auditAdminAction } from "@/lib/admin-audit"

export const metadata = { title: "User" }

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function Page({ params }: PageProps) {
  const { id } = await params

  const data = await withAdminBypass(async (db) => {
    const [user] = await db
      .select()
      .from(app_user)
      .where(eq(app_user.id, id))
      .limit(1)

    if (!user) return null

    const [sessionCountRow, mfaRow, workspaceMemberships, orgMemberships] =
      await Promise.all([
        db
          .select({ count: count() })
          .from(auth_session)
          .where(eq(auth_session.user_id, id)),
        db
          .select({ id: two_factor.id })
          .from(two_factor)
          .where(eq(two_factor.user_id, id))
          .limit(1),
        db
          .select({
            workspace_id: workspace_membership.workspace_id,
            display_name: workspace.display_name,
            role: workspace_membership.role,
            active: workspace_membership.active,
          })
          .from(workspace_membership)
          .innerJoin(
            workspace,
            eq(workspace_membership.workspace_id, workspace.id),
          )
          .where(eq(workspace_membership.user_id, id))
          .orderBy(workspace_membership.created_at),
        db
          .select({
            org_id: organization_membership.organization_id,
            slug: organization.slug,
            role: organization_membership.role,
            active: organization_membership.active,
          })
          .from(organization_membership)
          .innerJoin(
            organization,
            eq(organization_membership.organization_id, organization.id),
          )
          .where(eq(organization_membership.user_id, id))
          .orderBy(organization_membership.created_at),
      ])

    return {
      user,
      activeSessionCount: Number(sessionCountRow[0]?.count ?? 0),
      mfaEnabled: mfaRow.length > 0,
      workspaceMemberships,
      orgMemberships,
    }
  })

  if (!data) notFound()

  const {
    user,
    activeSessionCount,
    mfaEnabled,
    workspaceMemberships,
    orgMemberships,
  } = data

  await auditAdminAction({
    action: "admin.user.viewed",
    payload: { user_id: id },
  })

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Identity */}
      <Section title="Identity">
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Email</dt>
          <dd>{user.email}</dd>

          <dt className="text-muted-foreground">Name</dt>
          <dd>
            {user.name || <span className="text-muted-foreground">—</span>}
          </dd>

          <dt className="text-muted-foreground">Email verified</dt>
          <dd>
            {user.email_verified ? (
              <Badge variant="default">Verified</Badge>
            ) : (
              <Badge variant="outline">Unverified</Badge>
            )}
          </dd>

          <dt className="text-muted-foreground">Banned</dt>
          <dd>
            {user.banned ? (
              <Badge variant="destructive">Banned</Badge>
            ) : (
              <Badge variant="secondary">Active</Badge>
            )}
          </dd>

          {user.ban_reason ? (
            <>
              <dt className="text-muted-foreground">Ban reason</dt>
              <dd>{user.ban_reason}</dd>
            </>
          ) : null}

          {user.ban_expires ? (
            <>
              <dt className="text-muted-foreground">Ban expires</dt>
              <dd>{user.ban_expires.toISOString()}</dd>
            </>
          ) : null}

          <dt className="text-muted-foreground">Created</dt>
          <dd>{user.created_at.toISOString()}</dd>

          <dt className="text-muted-foreground">Updated</dt>
          <dd>{user.updated_at.toISOString()}</dd>

          <dt className="text-muted-foreground">ID</dt>
          <dd className="font-mono text-xs">{user.id}</dd>
        </dl>
      </Section>

      {/* Workspace memberships */}
      <Section title="Memberships — workspaces">
        {workspaceMemberships.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No workspace memberships.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {workspaceMemberships.map((m) => (
              <li
                key={m.workspace_id}
                className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">
                  {m.display_name}
                </span>
                <Badge variant="secondary">{m.role}</Badge>
                {m.active ? (
                  <Badge variant="default">Active</Badge>
                ) : (
                  <Badge variant="outline">Inactive</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Organization memberships */}
      <Section title="Memberships — organizations">
        {orgMemberships.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No organization memberships.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {orgMemberships.map((m) => (
              <li
                key={m.org_id}
                className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm"
              >
                <Link
                  href={`/orgs/${m.org_id}`}
                  className="min-w-0 flex-1 truncate font-mono text-xs text-primary underline-offset-4 hover:underline"
                >
                  {m.slug}
                </Link>
                <Badge variant="secondary">{m.role}</Badge>
                {m.active ? (
                  <Badge variant="default">Active</Badge>
                ) : (
                  <Badge variant="outline">Inactive</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Security */}
      <Section title="Security">
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted-foreground">MFA</dt>
          <dd>
            {mfaEnabled ? (
              <Badge variant="default">Enabled</Badge>
            ) : (
              <Badge variant="outline">Disabled</Badge>
            )}
          </dd>

          <dt className="text-muted-foreground">Active sessions</dt>
          <dd>{activeSessionCount}</dd>
        </dl>
      </Section>
    </div>
  )
}
