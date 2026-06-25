import "server-only"

import { ArrowUpRight } from "lucide-react"
import { desc, eq } from "drizzle-orm"

import { withAdminBypass } from "@workspace/db"
import {
  app_user,
  audit_event,
  auth_session,
  two_factor,
  workspace,
  workspace_membership,
} from "@workspace/db/schema"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"

import {
  DataTable,
  PageHeader,
  Section,
  type ColumnDef,
} from "@/app/(gated)/_components"
import { auditAdminAction } from "@/lib/admin-audit"
import { requireAdminSession } from "@/lib/admin-session"

import { RevokeOwnSessionButton } from "./_components/revoke-own-session-button"

export const metadata = { title: "My profile" }

const WEB_BASE_URL = process.env.WEB_BASE_URL ?? "http://localhost:3010"

function fmt(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 19).replace("T", " ") : "—"
}

const SESSION_COLUMNS: ColumnDef[] = [
  {
    key: "id",
    label: "Session",
    render: (v) => (
      <span className="font-mono text-xs">{String(v).slice(0, 8)}</span>
    ),
  },
  {
    key: "ip_address",
    label: "IP",
    render: (v) =>
      v ? (
        <span className="font-mono text-xs">{String(v)}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    key: "user_agent",
    label: "User agent",
    render: (v) =>
      v ? (
        <span className="block max-w-xs truncate text-muted-foreground">
          {String(v)}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    key: "created_at",
    label: "Created",
    render: (v) => <span className="tabular-nums">{fmt(v as Date)}</span>,
  },
  {
    key: "active",
    label: "Status",
    render: (v) =>
      v ? (
        <Badge variant="default">Active</Badge>
      ) : (
        <Badge variant="outline">Expired</Badge>
      ),
  },
  {
    key: "actions",
    label: "",
    align: "right",
    render: (_v, row) => <RevokeOwnSessionButton sessionId={String(row.id)} />,
  },
]

export default async function Page() {
  const ctx = await requireAdminSession()
  const now = new Date()

  const data = await withAdminBypass(async (db) => {
    const [userRow, sessions, auditRows, mfaRows, memberships] =
      await Promise.all([
        db.select().from(app_user).where(eq(app_user.id, ctx.userId)).limit(1),
        db
          .select()
          .from(auth_session)
          .where(eq(auth_session.user_id, ctx.userId))
          .orderBy(desc(auth_session.created_at)),
        db
          .select()
          .from(audit_event)
          .where(eq(audit_event.actor_user_id, ctx.userId))
          .orderBy(desc(audit_event.created_at))
          .limit(25),
        db
          .select({ id: two_factor.id, enabled: two_factor.enabled })
          .from(two_factor)
          .where(eq(two_factor.user_id, ctx.userId)),
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
            eq(workspace.id, workspace_membership.workspace_id),
          )
          .where(eq(workspace_membership.user_id, ctx.userId))
          .orderBy(workspace_membership.created_at),
      ])

    return { user: userRow[0], sessions, auditRows, mfaRows, memberships }
  })

  await auditAdminAction({ action: "admin.me.viewed" })

  const { user, sessions, auditRows, mfaRows, memberships } = data
  const mfaEnabled = mfaRows.some((r) => r.enabled)
  const activeSessions = sessions.filter((s) => s.expires_at > now).length

  const sessionRows = sessions.map((s) => ({
    ...s,
    active: s.expires_at > now,
  })) as unknown as Array<Record<string, unknown>>

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="My profile"
        description={ctx.email}
        meta={
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{ctx.effectiveRole}</Badge>
            {mfaEnabled ? (
              <Badge variant="default">MFA on</Badge>
            ) : (
              <Badge variant="destructive">MFA off</Badge>
            )}
          </div>
        }
      />

      {/* Quick actions — the things the operator actually reaches for. */}
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <a href={WEB_BASE_URL} target="_blank" rel="noreferrer">
            Open workspace app
            <ArrowUpRight className="size-3" />
          </a>
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href="/staff/members">Staff members</a>
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href="/ops/critical-systems">Critical systems</a>
        </Button>
      </div>

      <Section title="Identity">
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Name</dt>
          <dd>
            {user?.name || <span className="text-muted-foreground">—</span>}
          </dd>

          <dt className="text-muted-foreground">Email</dt>
          <dd className="flex items-center gap-2">
            {ctx.email}
            {user?.email_verified ? (
              <Badge variant="outline">Verified</Badge>
            ) : (
              <Badge variant="outline">Unverified</Badge>
            )}
          </dd>

          <dt className="text-muted-foreground">Staff role</dt>
          <dd>
            <Badge variant="secondary">{ctx.effectiveRole}</Badge>
          </dd>

          <dt className="text-muted-foreground">Active sessions</dt>
          <dd className="tabular-nums">{activeSessions}</dd>

          <dt className="text-muted-foreground">Member since</dt>
          <dd className="tabular-nums">{fmt(user?.created_at)}</dd>
        </dl>
      </Section>

      <Section title="Your workspaces">
        {memberships.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You are not a member of any workspace.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {memberships.map((m) => (
              <li
                key={m.workspace_id}
                className="flex items-center gap-3 rounded-md border border-border-subtle px-3 py-2 text-sm"
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

      <Section title="My sessions">
        <DataTable
          columns={SESSION_COLUMNS}
          rows={sessionRows}
          emptyTitle="No sessions"
          emptyDescription="You have no active session records."
        />
      </Section>

      <Section title="My recent staff actions">
        {auditRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent actions.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {auditRows.map((e) => (
              <li
                key={e.id}
                className="flex items-baseline gap-3 rounded-sm px-2 py-1.5 text-sm hover:bg-muted/40"
              >
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {fmt(e.created_at)}
                </span>
                <span className="font-mono text-xs">{e.action}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}
