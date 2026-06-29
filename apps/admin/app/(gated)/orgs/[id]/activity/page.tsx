import Link from "next/link"
import { notFound } from "next/navigation"
import { desc, eq, sql } from "drizzle-orm"

import { withAdminBypass } from "@workspace/db"
import { audit_event, organization } from "@workspace/db/schema"

import { auditAdminAction } from "@/lib/admin-audit"
import { DataTablePage } from "../../../_components"
import type { ColumnDef } from "../../../_components"
import { OrgTabNav } from "../_components/org-tab-nav"

export const metadata = { title: "Org activity" }

const PAGE_SIZE = 50

async function loadActivity(id: string, pageIndex: number) {
  return withAdminBypass(async (db) => {
    const [org] = await db
      .select({ id: organization.id, slug: organization.slug })
      .from(organization)
      .where(eq(organization.id, id))
      .limit(1)

    if (!org) return null

    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(audit_event)
      .where(eq(audit_event.organization_id, id))

    const rows = await db
      .select({
        id: audit_event.id,
        action: audit_event.action,
        actor_user_id: audit_event.actor_user_id,
        payload: audit_event.payload,
        created_at: audit_event.created_at,
      })
      .from(audit_event)
      .where(eq(audit_event.organization_id, id))
      .orderBy(desc(audit_event.created_at))
      .limit(PAGE_SIZE)
      .offset(pageIndex * PAGE_SIZE)

    return { org, rows, totalRows: countRow?.count ?? 0 }
  })
}

const COLUMNS: ColumnDef[] = [
  {
    key: "created_at",
    label: "When",
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
  {
    key: "action",
    label: "Action",
    render: (value) => (
      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
        {String(value ?? "—")}
      </code>
    ),
  },
  {
    key: "actor_user_id",
    label: "Actor",
    render: (value) => {
      if (!value)
        return <span className="text-xs text-muted-foreground">system</span>
      const uid = String(value)
      return (
        <Link
          href={`/users/${uid}`}
          className="font-mono text-xs text-primary underline-offset-2 hover:underline"
        >
          {uid.slice(0, 8)}
        </Link>
      )
    },
  },
  {
    key: "payload",
    label: "Payload",
    render: (value) => {
      const raw = value === null || value === undefined ? "{}" : value
      const str = typeof raw === "string" ? raw : JSON.stringify(raw)
      const truncated = str.length > 120 ? str.slice(0, 120) + "…" : str
      return (
        <code className="text-xs break-all text-muted-foreground">
          {truncated}
        </code>
      )
    },
  },
]

export default async function OrgActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const sp = await searchParams
  const pageIndex = Math.max(0, Number(sp.page ?? 0))

  const data = await loadActivity(id, pageIndex)

  if (!data) notFound()

  const { org, rows, totalRows } = data

  void auditAdminAction({
    action: "admin.org.activity_viewed",
    organizationId: id,
    payload: { slug: org.slug },
  })

  function buildHref(p: number) {
    return `/orgs/${id}/activity?page=${p}`
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <OrgTabNav id={id} active="activity" />
      <DataTablePage
        title="Activity"
        description={`Audit log for: ${org.slug}`}
        columns={COLUMNS}
        rows={rows as Array<Record<string, unknown>>}
        pagination={{ pageIndex, pageSize: PAGE_SIZE, totalRows }}
        pageHrefBuilder={buildHref}
        auditPrefix="admin.org.activity"
        emptyTitle="No audit events"
        emptyDescription="No audit events recorded for this organization."
      />
    </div>
  )
}
