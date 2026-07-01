import Link from "next/link"
import { notFound } from "next/navigation"
import { and, eq, sql } from "drizzle-orm"

import { withAdminBypass } from "@workspace/db"
import {
  app_user,
  organization,
  organization_membership,
} from "@workspace/db/schema"

import { auditAdminAction } from "@/lib/admin-audit"
import { DataTablePage } from "../../../_components"
import type { ColumnDef } from "../../../_components"
import { OrgTabNav } from "../_components/org-tab-nav"

export const metadata = { title: "Org members" }

const PAGE_SIZE = 50

async function loadMembers(
  id: string,
  pageIndex: number,
  roleFilter: string | undefined,
  activeFilter: string | undefined,
) {
  return withAdminBypass(async (db) => {
    const [org] = await db
      .select({ id: organization.id, slug: organization.slug })
      .from(organization)
      .where(eq(organization.id, id))
      .limit(1)

    if (!org) return null

    const conditions = [eq(organization_membership.organization_id, id)]
    if (roleFilter) {
      conditions.push(
        eq(organization_membership.role, roleFilter as "owner" | "member"),
      )
    }
    if (activeFilter === "true") {
      conditions.push(eq(organization_membership.active, true))
    } else if (activeFilter === "false") {
      conditions.push(eq(organization_membership.active, false))
    }

    const where = and(...conditions)

    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(organization_membership)
      .where(where)

    const rows = await db
      .select({
        id: organization_membership.id,
        role: organization_membership.role,
        active: organization_membership.active,
        created_at: organization_membership.created_at,
        user_id: app_user.id,
        email: app_user.email,
        name: app_user.name,
      })
      .from(organization_membership)
      .leftJoin(app_user, eq(organization_membership.user_id, app_user.id))
      .where(where)
      .orderBy(organization_membership.created_at)
      .limit(PAGE_SIZE)
      .offset(pageIndex * PAGE_SIZE)

    return { org, rows, totalRows: countRow?.count ?? 0 }
  })
}

const COLUMNS: ColumnDef[] = [
  {
    key: "email",
    label: "Email",
    render: (_, row) => (
      <Link
        href={`/users/${row.user_id}`}
        className="font-mono text-xs text-primary underline-offset-2 hover:underline"
      >
        {String(row.email ?? "—")}
      </Link>
    ),
  },
  { key: "name", label: "Name" },
  {
    key: "role",
    label: "Role",
    render: (value) => (
      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
        {String(value)}
      </span>
    ),
  },
  {
    key: "active",
    label: "Active",
    render: (value) =>
      value ? (
        <span className="inline-flex items-center rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
          active
        </span>
      ) : (
        <span className="inline-flex items-center rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
          inactive
        </span>
      ),
  },
  {
    key: "created_at",
    label: "Joined",
    render: (value) => {
      if (!value) return <span className="text-muted-foreground">—</span>
      const d = value instanceof Date ? value : new Date(String(value))
      return (
        <span className="font-mono text-xs">
          {d.toISOString().slice(0, 19).replace("T", " ")} UTC
        </span>
      )
    },
  },
]

export default async function OrgMembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const sp = await searchParams
  const pageIndex = Math.max(0, Number(sp.page ?? 0))
  const roleFilter = typeof sp.role === "string" ? sp.role : undefined
  const activeFilter = typeof sp.active === "string" ? sp.active : undefined

  const data = await loadMembers(id, pageIndex, roleFilter, activeFilter)

  if (!data) notFound()

  const { org, rows, totalRows } = data

  void auditAdminAction({
    action: "admin.org.members_viewed",
    organizationId: id,
    payload: { slug: org.slug },
  })

  function buildHref(p: number) {
    const u = new URLSearchParams()
    u.set("page", String(p))
    if (roleFilter) u.set("role", roleFilter)
    if (activeFilter) u.set("active", activeFilter)
    return `/orgs/${id}/members?${u.toString()}`
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <OrgTabNav id={id} active="members" />
      <DataTablePage
        title="Members"
        description={`Organization: ${org.slug}`}
        columns={COLUMNS}
        rows={rows as Array<Record<string, unknown>>}
        pagination={{ pageIndex, pageSize: PAGE_SIZE, totalRows }}
        pageHrefBuilder={buildHref}
        auditPrefix="admin.org.members"
        emptyTitle="No members"
        emptyDescription="No members match the current filters."
      />
    </div>
  )
}
