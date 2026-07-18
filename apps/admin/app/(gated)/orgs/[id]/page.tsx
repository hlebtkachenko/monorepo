import { notFound } from "next/navigation"
import { and, desc, eq, sql } from "drizzle-orm"

import { withAdminBypass } from "@workspace/db"
import {
  app_user,
  audit_event,
  organization,
  organization_membership,
  workspace,
} from "@workspace/db/schema"
import { Text } from "@workspace/ui/components/text"

import { auditAdminAction } from "@/lib/admin-audit"
import { SectionCard } from "../../_components"
import { SignInToOrgForm } from "./_components/sign-in-to-org-form"

export const metadata = { title: "Organization" }

async function loadOrg(id: string) {
  return withAdminBypass(async (db) => {
    const [org] = await db
      .select()
      .from(organization)
      .where(eq(organization.id, id))
      .limit(1)

    if (!org) return null

    const [ws] = await db
      .select({ id: workspace.id, display_name: workspace.display_name })
      .from(workspace)
      .where(eq(workspace.id, org.workspace_id))
      .limit(1)

    const memberCountRow = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(organization_membership)
      .where(eq(organization_membership.organization_id, id))

    const memberCount = memberCountRow[0]?.count ?? 0

    const recentActivity = await db
      .select({
        id: audit_event.id,
        action: audit_event.action,
        actor_user_id: audit_event.actor_user_id,
        created_at: audit_event.created_at,
      })
      .from(audit_event)
      .where(eq(audit_event.organization_id, id))
      .orderBy(desc(audit_event.created_at))
      .limit(10)

    // Resolve the sign-in target: the responsible accountant if set, else the
    // org owner. This is who the operator impersonates when signing in to the
    // org (both have access to the book).
    let targetUserId: string | null = null
    let targetEmail: string | null = null
    let targetRole: "responsible" | "owner" | null = null

    if (org.responsible_user_id) {
      const [u] = await db
        .select({ id: app_user.id, email: app_user.email })
        .from(app_user)
        .where(eq(app_user.id, org.responsible_user_id))
        .limit(1)
      if (u) {
        targetUserId = u.id
        targetEmail = u.email
        targetRole = "responsible"
      }
    }
    if (!targetUserId) {
      const [owner] = await db
        .select({ id: app_user.id, email: app_user.email })
        .from(organization_membership)
        .innerJoin(app_user, eq(app_user.id, organization_membership.user_id))
        .where(
          and(
            eq(organization_membership.organization_id, id),
            eq(organization_membership.role, "owner"),
            eq(organization_membership.active, true),
          ),
        )
        .limit(1)
      if (owner) {
        targetUserId = owner.id
        targetEmail = owner.email
        targetRole = "owner"
      }
    }

    return {
      org,
      ws: ws ?? null,
      memberCount,
      recentActivity,
      target: { targetUserId, targetEmail, targetRole },
    }
  })
}

function fmt(d: Date | string | null | undefined): string {
  if (!d) return "—"
  const t = typeof d === "string" ? new Date(d) : d
  return t.toISOString().slice(0, 19).replace("T", " ") + " UTC"
}

function timeAgo(d: Date | string | null | undefined): string {
  if (!d) return "—"
  const t = typeof d === "string" ? new Date(d) : d
  const diff = Date.now() - t.getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return s + "s ago"
  if (s < 3600) return Math.floor(s / 60) + "m ago"
  if (s < 86400) return Math.floor(s / 3600) + "h ago"
  return Math.floor(s / 86400) + "d ago"
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-2 last:border-0">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-sm">{value ?? "—"}</span>
    </div>
  )
}

export default async function OrgDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const data = await loadOrg(id)

  if (!data) notFound()

  const { org, ws, memberCount, recentActivity, target } = data

  const supportExpiresAt = org.support_access_expires_at
    ? new Date(org.support_access_expires_at)
    : null
  const grantActive = supportExpiresAt !== null && supportExpiresAt > new Date()

  void auditAdminAction({
    action: "admin.org.viewed",
    organizationId: id,
    payload: { slug: org.slug },
  })

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Identity">
          <KV
            label="Slug"
            value={<code className="font-mono text-xs">{org.slug}</code>}
          />
          <KV label="Legal name" value={org.legal_name} />
          <KV label="Kind" value={org.person_kind} />
          <KV
            label="FY start month"
            value={String(org.fiscal_year_start_month)}
          />
          <KV label="Created" value={fmt(org.created_at)} />
          <KV label="Members" value={String(memberCount)} />
          <KV
            label="Workspace"
            value={
              ws ? (
                <span>
                  {ws.display_name}{" "}
                  <span className="font-mono text-xs text-muted-foreground">
                    {org.workspace_id}
                  </span>
                </span>
              ) : (
                <code className="font-mono text-xs">{org.workspace_id}</code>
              )
            }
          />
        </SectionCard>

        <SectionCard title="Recent activity">
          {recentActivity.length === 0 ? (
            <Text variant="muted" className="text-sm">
              No audit events for this organization.
            </Text>
          ) : (
            <ul className="flex flex-col gap-1">
              {recentActivity.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-2 rounded px-2 py-1 text-xs hover:bg-muted/30"
                >
                  <span className="truncate font-mono">{e.action}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {e.actor_user_id ? e.actor_user_id.slice(0, 8) : "system"} ·{" "}
                    {timeAgo(e.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Support access">
        <div className="flex flex-col gap-4">
          <div>
            <KV
              label="Status"
              value={
                grantActive ? (
                  <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                    Granted
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">Off</span>
                )
              }
            />
            <KV
              label="Consent expires"
              value={grantActive ? fmt(supportExpiresAt) : "—"}
            />
          </div>
          <SignInToOrgForm
            organizationId={id}
            targetUserId={target.targetUserId}
            targetEmail={target.targetEmail}
            targetRole={target.targetRole}
            grantActive={grantActive}
          />
        </div>
      </SectionCard>
    </div>
  )
}
